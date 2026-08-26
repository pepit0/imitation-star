import type { DubLine, RecordedLine } from "@/lib/types";
import type { DubPost, DubPostTake, UserProfile } from "@/lib/types/social";
import { createClient } from "@/lib/supabase/client";
import { profileFromRow, PROFILE_SELECT, type ProfileRow } from "@/lib/supabase/profile";
import { DUB_PACKS_BUCKET, publicPackUrl } from "@/lib/cloudPacks";

export type { DubPostTake };

export type DubPostRow = {
  id: string;
  author_id: string;
  pack_id: string;
  pack_title: string;
  caption: string;
  star_count: number;
  created_at: string;
  pack_thumbnail_url: string | null;
  pack_thumbnail_color: string | null;
  takes: DubPostTake[] | null;
  video_url: string | null;
  backing_url: string | null;
  archived_at: string | null;
};

function isPublicOrSiteUrl(url: string | undefined): url is string {
  if (!url) return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/")
  );
}

export function resolveTakeAudioUrl(audioPath: string): string {
  if (
    audioPath.startsWith("http://") ||
    audioPath.startsWith("https://") ||
    audioPath.startsWith("/") ||
    audioPath.startsWith("blob:")
  ) {
    return audioPath;
  }
  return publicPackUrl(audioPath);
}

export function postFromRow(row: DubPostRow): DubPost {
  return {
    id: row.id,
    authorId: row.author_id,
    packId: row.pack_id,
    packTitle: row.pack_title,
    caption: row.caption ?? "",
    starCount: row.star_count,
    createdAt: row.created_at,
    packThumbnailUrl: row.pack_thumbnail_url ?? undefined,
    packThumbnailColor: row.pack_thumbnail_color ?? undefined,
    takes: row.takes ?? [],
    videoUrl: row.video_url ?? undefined,
    backingUrl: row.backing_url ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  };
}

const POST_SELECT =
  "id, author_id, pack_id, pack_title, caption, star_count, created_at, pack_thumbnail_url, pack_thumbnail_color, takes, video_url, backing_url, archived_at";

export async function listCloudDubPosts(): Promise<DubPost[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dub_posts")
    .select(POST_SELECT)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data as DubPostRow[] | null)?.map(postFromRow) ?? [];
}

export async function listCloudDubPostsByAuthor(
  authorId: string
): Promise<DubPost[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dub_posts")
    .select(POST_SELECT)
    .eq("author_id", authorId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data as DubPostRow[] | null)?.map(postFromRow) ?? [];
}

async function uploadTakeAudio(path: string, blob: Blob): Promise<void> {
  const supabase = createClient();
  const rawType = blob.type || "audio/webm";
  const contentType = rawType.split(";")[0]?.trim() || "audio/webm";
  const { error } = await supabase.storage.from(DUB_PACKS_BUCKET).upload(path, blob, {
    upsert: true,
    contentType,
    cacheControl: "3600",
  });
  if (error) throw error;
}

export async function publishDubPost(input: {
  authorId: string;
  packId: string;
  packTitle: string;
  caption: string;
  packThumbnailUrl?: string;
  packThumbnailColor?: string;
  videoUrl?: string;
  backingUrl?: string;
  lines: DubLine[];
  recordings: RecordedLine[];
}): Promise<DubPost> {
  const supabase = createClient();
  const postId = crypto.randomUUID();
  const takes: DubPostTake[] = [];

  if (!input.recordings.length) {
    throw new Error("No takes to publish — record the scene first.");
  }

  for (const line of input.lines) {
    const rec = input.recordings.find((r) => r.lineId === line.id);
    if (!rec?.blob || rec.blob.size < 1) continue;
    const type = rec.blob.type || "";
    const ext = type.includes("mp4")
      ? "mp4"
      : type.includes("ogg")
        ? "ogg"
        : type.includes("mpeg") || type.includes("mp3")
          ? "mp3"
          : "webm";
    const audioPath = `${input.authorId}/takes/${postId}/${line.id}.${ext}`;
    await uploadTakeAudio(audioPath, rec.blob);
    takes.push({
      lineId: line.id,
      audioPath,
      startMs: line.startMs,
      endMs: line.endMs,
    });
  }

  if (takes.length === 0) {
    throw new Error("No takes to publish — record the scene first.");
  }

  const { data, error } = await supabase
    .from("dub_posts")
    .insert({
      id: postId,
      author_id: input.authorId,
      pack_id: input.packId,
      pack_title: input.packTitle,
      caption: input.caption.trim(),
      pack_thumbnail_url: input.packThumbnailUrl ?? null,
      pack_thumbnail_color: input.packThumbnailColor ?? null,
      takes,
      video_url: isPublicOrSiteUrl(input.videoUrl) ? input.videoUrl : null,
      backing_url: isPublicOrSiteUrl(input.backingUrl)
        ? input.backingUrl
        : null,
    })
    .select(POST_SELECT)
    .single();

  if (error) {
    // Best-effort cleanup of uploaded takes if the row insert fails.
    await supabase.storage
      .from(DUB_PACKS_BUCKET)
      .remove(takes.map((t) => t.audioPath))
      .catch(() => undefined);
    throw error;
  }
  return postFromRow(data as DubPostRow);
}

export async function archiveDubPost(postId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("dub_posts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) throw error;
}

export async function restoreDubPost(postId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("dub_posts")
    .update({ archived_at: null })
    .eq("id", postId);

  if (error) throw error;
}

export async function deleteDubPost(post: DubPost): Promise<void> {
  const supabase = createClient();
  const takePaths =
    post.takes?.map((t) => t.audioPath).filter(Boolean) ?? [];

  const { error } = await supabase.from("dub_posts").delete().eq("id", post.id);
  if (error) throw error;

  if (takePaths.length > 0) {
    await supabase.storage
      .from(DUB_PACKS_BUCKET)
      .remove(takePaths)
      .catch(() => undefined);
  }
}

/** Fetch profiles for authors missing from the local seed map. */
export async function fetchProfilesByIds(
  ids: string[]
): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, UserProfile>();
  if (unique.length === 0) return map;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      PROFILE_SELECT
    )
    .in("id", unique);

  if (error || !data) return map;
  for (const row of data as ProfileRow[]) {
    map.set(row.id, profileFromRow(row));
  }
  return map;
}
