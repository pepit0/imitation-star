import { createClient } from "@/lib/supabase/client";
import { DUB_PACKS_BUCKET, publicPackUrl } from "@/lib/cloudPacks";
import type { LineScore, RecordedLine } from "@/lib/types";
import type { PackProgress, PackProgressSummary } from "@/lib/offline/packProgress";

export type CloudProgressTake = {
  lineId: string;
  audioPath: string;
  durationMs: number;
  score?: LineScore;
};

type PackProgressRow = {
  user_id: string;
  pack_id: string;
  pack_title: string;
  line_index: number;
  takes: CloudProgressTake[] | null;
  updated_at: string;
};

const PROGRESS_SELECT =
  "user_id, pack_id, pack_title, line_index, takes, updated_at";

function audioExt(blob: Blob): string {
  const type = blob.type || "";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  return "webm";
}

function progressAudioPath(
  userId: string,
  packId: string,
  lineId: string,
  blob: Blob
): string {
  return `${userId}/progress/${packId}/${lineId}.${audioExt(blob)}`;
}

async function uploadProgressAudio(path: string, blob: Blob): Promise<void> {
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

async function removeProgressPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = createClient();
  await supabase.storage.from(DUB_PACKS_BUCKET).remove(paths).catch(() => undefined);
}

async function fetchProgressRow(
  userId: string,
  packId: string
): Promise<PackProgressRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pack_progress")
    .select(PROGRESS_SELECT)
    .eq("user_id", userId)
    .eq("pack_id", packId)
    .maybeSingle();
  if (error) throw error;
  return (data as PackProgressRow | null) ?? null;
}

export async function saveCloudPackProgress(input: {
  userId: string;
  packId: string;
  packTitle: string;
  lineIndex: number;
  recordings: RecordedLine[];
}): Promise<void> {
  if (!input.recordings.length) {
    await clearCloudPackProgress(input.userId, input.packId);
    return;
  }

  const existing = await fetchProgressRow(input.userId, input.packId);
  const oldPaths = (existing?.takes ?? []).map((t) => t.audioPath);

  const takes: CloudProgressTake[] = [];
  const newPaths: string[] = [];

  for (const rec of input.recordings) {
    if (!rec.blob || rec.blob.size < 1) continue;
    const audioPath = progressAudioPath(
      input.userId,
      input.packId,
      rec.lineId,
      rec.blob
    );
    await uploadProgressAudio(audioPath, rec.blob);
    takes.push({
      lineId: rec.lineId,
      audioPath,
      durationMs: rec.durationMs,
      score: rec.score,
    });
    newPaths.push(audioPath);
  }

  if (takes.length === 0) {
    await clearCloudPackProgress(input.userId, input.packId);
    return;
  }

  const stalePaths = oldPaths.filter((p) => !newPaths.includes(p));
  await removeProgressPaths(stalePaths);

  const supabase = createClient();
  const { error } = await supabase.from("pack_progress").upsert(
    {
      user_id: input.userId,
      pack_id: input.packId,
      pack_title: input.packTitle.trim() || "Untitled pack",
      line_index: input.lineIndex,
      takes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,pack_id" }
  );
  if (error) throw error;
}

export async function loadCloudPackProgress(
  userId: string,
  packId: string
): Promise<PackProgress | null> {
  const row = await fetchProgressRow(userId, packId);
  if (!row?.takes?.length) return null;

  const recordings: RecordedLine[] = [];
  for (const take of row.takes) {
    try {
      const res = await fetch(publicPackUrl(take.audioPath));
      if (!res.ok) continue;
      const blob = await res.blob();
      recordings.push({
        lineId: take.lineId,
        blob,
        durationMs: take.durationMs,
        score: take.score,
      });
    } catch {
      /* skip missing take */
    }
  }

  if (recordings.length === 0) {
    await clearCloudPackProgress(userId, packId);
    return null;
  }

  return {
    lineIndex: row.line_index,
    recordings,
    updatedAt: row.updated_at,
  };
}

export async function getCloudPackProgressSummary(
  userId: string,
  packId: string
): Promise<PackProgressSummary | null> {
  const row = await fetchProgressRow(userId, packId);
  const count = row?.takes?.length ?? 0;
  if (!row || count < 1) return null;
  return {
    lineIndex: row.line_index,
    recordedCount: count,
    updatedAt: row.updated_at,
  };
}

export async function listCloudPackProgressSummaries(
  userId: string
): Promise<Map<string, PackProgressSummary>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pack_progress")
    .select("pack_id, line_index, takes, updated_at")
    .eq("user_id", userId);
  if (error) throw error;

  const map = new Map<string, PackProgressSummary>();
  for (const row of (data ?? []) as {
    pack_id: string;
    line_index: number;
    takes: CloudProgressTake[] | null;
    updated_at: string;
  }[]) {
    const count = row.takes?.length ?? 0;
    if (count < 1) continue;
    map.set(row.pack_id, {
      lineIndex: row.line_index,
      recordedCount: count,
      updatedAt: row.updated_at,
    });
  }
  return map;
}

export async function clearCloudPackProgress(
  userId: string,
  packId: string
): Promise<void> {
  const row = await fetchProgressRow(userId, packId);
  const paths = (row?.takes ?? []).map((t) => t.audioPath);
  await removeProgressPaths(paths);

  const supabase = createClient();
  const { error } = await supabase
    .from("pack_progress")
    .delete()
    .eq("user_id", userId)
    .eq("pack_id", packId);
  if (error) throw error;
}

export async function listCloudProgressStoragePaths(
  userId: string
): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pack_progress")
    .select("takes")
    .eq("user_id", userId);
  if (error) throw error;

  const paths: string[] = [];
  for (const row of data ?? []) {
    for (const take of (row.takes as CloudProgressTake[] | null) ?? []) {
      if (take.audioPath) paths.push(take.audioPath);
    }
  }
  return paths;
}
