import type { DubLine, DubPack } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { sliceAudioBlob } from "@/lib/audioSlice";
import type { PackEditMedia } from "@/lib/packStore";

export const DUB_PACKS_BUCKET = "dub-packs";

export type CloudPackLine = {
  id: string;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
};

export type DubPackRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  creator_name: string;
  tags: string[];
  nsfw: boolean;
  play_count: number;
  thumbnail_color: string;
  lines: CloudPackLine[];
  video_path: string;
  thumb_path: string;
  backing_path: string | null;
  vocals_path: string | null;
  created_at: string;
};

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  );
}

export function publicPackUrl(path: string): string {
  const supabase = createClient();
  const { data } = supabase.storage.from(DUB_PACKS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function packPath(userId: string, packId: string, filename: string): string {
  return `${userId}/${packId}/${filename}`;
}

function extForBlob(blob: Blob, fallback: string): string {
  const type = blob.type || "";
  if (type.includes("webm")) return "webm";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("mp4")) return fallback === "thumb" ? "jpg" : "mp4";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  return fallback === "thumb" ? "jpg" : fallback === "video" ? "mp4" : "wav";
}

async function uploadPackFile(
  path: string,
  blob: Blob,
  contentType?: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage.from(DUB_PACKS_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: contentType || blob.type || undefined,
  });
  if (error) throw error;
}

function stripLineUrls(lines: DubLine[]): CloudPackLine[] {
  return lines.map(({ id, speaker, text, startMs, endMs }) => ({
    id,
    speaker,
    text,
    startMs,
    endMs,
  }));
}

function rowToDubPack(row: DubPackRow): DubPack {
  const lines: DubLine[] = (row.lines ?? []).map((line) => ({ ...line }));
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    creator: row.creator_name,
    clipCount: lines.length,
    tags: row.tags ?? [],
    nsfw: row.nsfw,
    playCount: row.play_count,
    createdAt: row.created_at.slice(0, 10),
    thumbnailColor: row.thumbnail_color,
    thumbnailUrl: publicPackUrl(row.thumb_path),
    videoUrl: publicPackUrl(row.video_path),
    backingTrackUrl: row.backing_path
      ? publicPackUrl(row.backing_path)
      : undefined,
    vocalsStemUrl: row.vocals_path ? publicPackUrl(row.vocals_path) : undefined,
    lines,
    source: "cloud",
    ownerId: row.owner_id,
  };
}

/** List published packs for the community browser. */
export async function listCloudDubPacks(): Promise<DubPack[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dub_packs")
    .select(
      "id, owner_id, title, description, creator_name, tags, nsfw, play_count, thumbnail_color, lines, video_path, thumb_path, backing_path, vocals_path, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as DubPackRow[] | null)?.map(rowToDubPack) ?? [];
}

/**
 * Record one completed dub play for a community pack.
 * No-ops for owners, guests, builtin/local packs, or missing cloud rows.
 * Returns the updated play_count, or null when nothing changed.
 */
export async function recordCommunityPackPlay(
  pack: Pick<DubPack, "id" | "source" | "ownerId">
): Promise<number | null> {
  if (pack.source !== "cloud" || !pack.ownerId || !isUuid(pack.id)) {
    return null;
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("increment_pack_play_count", {
    p_pack_id: pack.id,
  });

  if (error) {
    console.warn("Could not record pack play:", error.message);
    return null;
  }
  if (typeof data !== "number") return null;
  return data;
}

/**
 * Fetch vocals and build per-line reference slices for Replay / waveforms.
 * Safe to call for any pack; no-ops when already hydrated or no vocals.
 */
export async function hydratePackLineReferences(
  pack: DubPack
): Promise<DubPack> {
  if (!pack.vocalsStemUrl) return pack;
  if (pack.lines.every((l) => l.referenceAudioUrl)) return pack;

  try {
    const res = await fetch(pack.vocalsStemUrl);
    if (!res.ok) return pack;
    const vocalsBlob = await res.blob();
    const lines: DubLine[] = [];
    for (const line of pack.lines) {
      if (line.referenceAudioUrl) {
        lines.push(line);
        continue;
      }
      try {
        const slice = await sliceAudioBlob(
          vocalsBlob,
          line.startMs,
          line.endMs
        );
        lines.push({ ...line, referenceAudioUrl: URL.createObjectURL(slice) });
      } catch {
        lines.push(line);
      }
    }
    return { ...pack, lines };
  } catch {
    return pack;
  }
}

export async function publishPackToCloud(input: {
  packId?: string;
  ownerId: string;
  title: string;
  description: string;
  creatorName: string;
  tags: string[];
  nsfw: boolean;
  thumbnailColor: string;
  lines: DubLine[];
  videoBlob: Blob;
  thumbBlob: Blob;
  backingBlob?: Blob | null;
  vocalsBlob?: Blob | null;
  playCount?: number;
  createdAt?: string;
}): Promise<DubPack> {
  const packId =
    input.packId && isUuid(input.packId) ? input.packId : crypto.randomUUID();

  const videoPath = packPath(
    input.ownerId,
    packId,
    `video.${extForBlob(input.videoBlob, "video")}`
  );
  const thumbPath = packPath(
    input.ownerId,
    packId,
    `thumb.${extForBlob(input.thumbBlob, "thumb")}`
  );
  const backingPath = input.backingBlob
    ? packPath(
        input.ownerId,
        packId,
        `backing.${extForBlob(input.backingBlob, "audio")}`
      )
    : null;
  const vocalsPath = input.vocalsBlob
    ? packPath(
        input.ownerId,
        packId,
        `vocals.${extForBlob(input.vocalsBlob, "audio")}`
      )
    : null;

  await uploadPackFile(videoPath, input.videoBlob);
  await uploadPackFile(thumbPath, input.thumbBlob, "image/jpeg");
  if (backingPath && input.backingBlob) {
    await uploadPackFile(backingPath, input.backingBlob);
  }
  if (vocalsPath && input.vocalsBlob) {
    await uploadPackFile(vocalsPath, input.vocalsBlob);
  }

  const supabase = createClient();

  const { data: existing } = await supabase
    .from("dub_packs")
    .select("id")
    .eq("id", packId)
    .maybeSingle();
  const isFirstPublish = !existing;

  const row = {
    id: packId,
    owner_id: input.ownerId,
    title: input.title.trim() || "Untitled pack",
    description: input.description.trim(),
    creator_name: input.creatorName.trim() || "Dubber",
    tags: input.tags.length ? input.tags : ["upload"],
    nsfw: input.nsfw,
    play_count: input.playCount ?? 0,
    thumbnail_color: input.thumbnailColor,
    lines: stripLineUrls(input.lines),
    video_path: videoPath,
    thumb_path: thumbPath,
    backing_path: backingPath,
    vocals_path: vocalsPath,
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  };

  const { data, error } = await supabase
    .from("dub_packs")
    .upsert(row, { onConflict: "id" })
    .select(
      "id, owner_id, title, description, creator_name, tags, nsfw, play_count, thumbnail_color, lines, video_path, thumb_path, backing_path, vocals_path, created_at"
    )
    .single();

  if (error) throw error;
  const pack = rowToDubPack(data as DubPackRow);

  if (isFirstPublish) {
    const { emitNotificationEvent } = await import("@/lib/pushNotifications");
    emitNotificationEvent({
      type: "followee_pack",
      packId: pack.id,
      packTitle: pack.title,
    });
  }

  return pack;
}

/** Permanently remove a published pack (row + storage). RLS enforces owner. */
export async function deleteCloudDubPack(packId: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dub_packs")
    .select("video_path, thumb_path, backing_path, vocals_path")
    .eq("id", packId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return;

  const { error: deleteError } = await supabase
    .from("dub_packs")
    .delete()
    .eq("id", packId);
  if (deleteError) throw deleteError;

  const paths = [
    data.video_path,
    data.thumb_path,
    data.backing_path,
    data.vocals_path,
  ].filter((p): p is string => Boolean(p));

  if (paths.length > 0) {
    await supabase.storage
      .from(DUB_PACKS_BUCKET)
      .remove(paths)
      .catch(() => undefined);
  }
}

export async function loadCloudPackMediaForEdit(
  packId: string
): Promise<PackEditMedia | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dub_packs")
    .select("title, video_path, backing_path, vocals_path")
    .eq("id", packId)
    .maybeSingle();

  if (error || !data) return null;

  const videoRes = await fetch(publicPackUrl(data.video_path));
  if (!videoRes.ok) return null;
  const videoBlob = await videoRes.blob();

  let backingFile: File | null = null;
  if (data.backing_path) {
    const res = await fetch(publicPackUrl(data.backing_path));
    if (res.ok) {
      const blob = await res.blob();
      backingFile = new File([blob], "_backing_track.wav", {
        type: blob.type || "audio/wav",
      });
    }
  }

  let vocalsFile: File | null = null;
  if (data.vocals_path) {
    const res = await fetch(publicPackUrl(data.vocals_path));
    if (res.ok) {
      const blob = await res.blob();
      vocalsFile = new File([blob], "_vocals.wav", {
        type: blob.type || "audio/wav",
      });
    }
  }

  return {
    videoFile: new File([videoBlob], `${data.title || "pack"}.mp4`, {
      type: videoBlob.type || "video/mp4",
    }),
    backingFile,
    vocalsFile,
  };
}

export { isUuid };
