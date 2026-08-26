import {
  deleteBlob,
  idbReq,
  loadBlob,
  openDb,
  PACK_PROGRESS_STORE,
  saveBlob,
} from "@/lib/packStore";
import type { LineScore, RecordedLine } from "@/lib/types";

export type StoredPackProgress = {
  packId: string;
  lineIndex: number;
  updatedAt: string;
  takes: {
    lineId: string;
    blobKey: string;
    durationMs: number;
    score?: LineScore;
  }[];
};

export type PackProgress = {
  lineIndex: number;
  recordings: RecordedLine[];
  updatedAt: string;
};

export type PackProgressSummary = {
  lineIndex: number;
  recordedCount: number;
  updatedAt: string;
};

function progressBlobKey(packId: string, lineId: string): string {
  return `progress:${packId}:line:${lineId}`;
}

async function loadProgressRow(
  packId: string
): Promise<StoredPackProgress | null> {
  const db = await openDb();
  const tx = db.transaction(PACK_PROGRESS_STORE, "readonly");
  const row = await idbReq<StoredPackProgress | undefined>(
    tx.objectStore(PACK_PROGRESS_STORE).get(packId)
  );
  db.close();
  return row ?? null;
}

async function deleteProgressBlobs(row: StoredPackProgress): Promise<void> {
  for (const take of row.takes) {
    await deleteBlob(take.blobKey);
  }
}

export async function listAllLocalPackProgressSummaries(): Promise<
  Map<string, PackProgressSummary>
> {
  const db = await openDb();
  const tx = db.transaction(PACK_PROGRESS_STORE, "readonly");
  const rows = await idbReq<StoredPackProgress[]>(
    tx.objectStore(PACK_PROGRESS_STORE).getAll()
  );
  db.close();

  const map = new Map<string, PackProgressSummary>();
  for (const row of rows) {
    if (row.takes.length < 1) continue;
    map.set(row.packId, {
      lineIndex: row.lineIndex,
      recordedCount: row.takes.length,
      updatedAt: row.updatedAt,
    });
  }
  return map;
}

/** Save all recorded lines for a pack-in-progress (local device cache). */
export async function saveLocalPackProgress(
  packId: string,
  lineIndex: number,
  recordings: RecordedLine[]
): Promise<void> {
  const validRecordings = recordings.filter((rec) => rec.blob && rec.blob.size > 0);
  if (validRecordings.length === 0) {
    await clearLocalPackProgress(packId);
    return;
  }

  const existing = await loadProgressRow(packId);
  const existingByLine = new Map(
    (existing?.takes ?? []).map((take) => [take.lineId, take])
  );
  const takes: StoredPackProgress["takes"] = [];
  const keptBlobKeys = new Set<string>();

  for (const rec of validRecordings) {
    const prev = existingByLine.get(rec.lineId);
    if (prev && prev.durationMs === rec.durationMs && prev.blobKey) {
      takes.push({
        lineId: rec.lineId,
        blobKey: prev.blobKey,
        durationMs: rec.durationMs,
        score: rec.score,
      });
      keptBlobKeys.add(prev.blobKey);
      continue;
    }

    const blobKey = progressBlobKey(packId, rec.lineId);
    await saveBlob(blobKey, rec.blob);
    takes.push({
      lineId: rec.lineId,
      blobKey,
      durationMs: rec.durationMs,
      score: rec.score,
    });
    keptBlobKeys.add(blobKey);
  }

  if (existing) {
    for (const take of existing.takes) {
      if (!keptBlobKeys.has(take.blobKey)) {
        await deleteBlob(take.blobKey);
      }
    }
  }

  const row: StoredPackProgress = {
    packId,
    lineIndex,
    updatedAt: new Date().toISOString(),
    takes,
  };

  const db = await openDb();
  const tx = db.transaction(PACK_PROGRESS_STORE, "readwrite");
  await idbReq(tx.objectStore(PACK_PROGRESS_STORE).put(row));
  db.close();
}

export async function loadLocalPackProgress(
  packId: string
): Promise<PackProgress | null> {
  const row = await loadProgressRow(packId);
  if (!row || row.takes.length === 0) return null;

  const recordings: RecordedLine[] = [];
  for (const take of row.takes) {
    const blob = await loadBlob(take.blobKey);
    if (!blob) continue;
    recordings.push({
      lineId: take.lineId,
      blob,
      durationMs: take.durationMs,
      score: take.score,
    });
  }

  if (recordings.length === 0) {
    await clearLocalPackProgress(packId);
    return null;
  }

  return {
    lineIndex: row.lineIndex,
    recordings,
    updatedAt: row.updatedAt,
  };
}

export async function getLocalPackProgressSummary(
  packId: string
): Promise<PackProgressSummary | null> {
  const row = await loadProgressRow(packId);
  if (!row || row.takes.length === 0) return null;
  return {
    lineIndex: row.lineIndex,
    recordedCount: row.takes.length,
    updatedAt: row.updatedAt,
  };
}

export async function hasLocalPackProgress(packId: string): Promise<boolean> {
  const summary = await getLocalPackProgressSummary(packId);
  return summary != null;
}

export async function clearLocalPackProgress(packId: string): Promise<void> {
  const row = await loadProgressRow(packId);
  if (row) {
    await deleteProgressBlobs(row);
  }
  const db = await openDb();
  const tx = db.transaction(PACK_PROGRESS_STORE, "readwrite");
  await idbReq(tx.objectStore(PACK_PROGRESS_STORE).delete(packId));
  db.close();
}
