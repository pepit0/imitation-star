import { publishDubPost } from "@/lib/cloudPosts";
import {
  deleteBlob,
  idbReq,
  loadBlob,
  loadUserDubPacks,
  openDb,
  PENDING_DUB_STORE,
  saveBlob,
} from "@/lib/packStore";
import type { DubLine, LineScore, RecordedLine } from "@/lib/types";

export type PendingDubStatus = "pending" | "uploading" | "failed";

export type StoredPendingDub = {
  id: string;
  authorId?: string;
  packId: string;
  packTitle: string;
  packThumbnailColor: string;
  caption: string;
  lines: DubLine[];
  takes: {
    lineId: string;
    blobKey: string;
    durationMs: number;
    score?: LineScore;
  }[];
  createdAt: string;
  status: PendingDubStatus;
  lastError?: string;
};

function stripLineUrls(lines: DubLine[]): DubLine[] {
  return lines.map(({ referenceAudioUrl: _r, ...rest }) => rest);
}

export async function listPendingDubs(): Promise<StoredPendingDub[]> {
  const db = await openDb();
  const tx = db.transaction(PENDING_DUB_STORE, "readonly");
  const all = await idbReq<StoredPendingDub[]>(
    tx.objectStore(PENDING_DUB_STORE).getAll()
  );
  db.close();
  return (all ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function countPendingDubs(): Promise<number> {
  const pending = await listPendingDubs();
  return pending.filter((d) => d.status !== "uploading").length;
}

async function savePendingDubRow(row: StoredPendingDub): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PENDING_DUB_STORE, "readwrite");
  await idbReq(tx.objectStore(PENDING_DUB_STORE).put(row));
  db.close();
}

async function deletePendingDubRow(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PENDING_DUB_STORE, "readwrite");
  await idbReq(tx.objectStore(PENDING_DUB_STORE).delete(id));
  db.close();
}

/** Persist a completed dub on device until connection returns. */
export async function savePendingDub(input: {
  packId: string;
  packTitle: string;
  packThumbnailColor: string;
  caption: string;
  lines: DubLine[];
  recordings: RecordedLine[];
  authorId?: string;
}): Promise<StoredPendingDub> {
  if (!input.recordings.length) {
    throw new Error("Nothing to save — record the scene first.");
  }

  const id = crypto.randomUUID();
  const takes: StoredPendingDub["takes"] = [];

  for (const rec of input.recordings) {
    if (!rec.blob || rec.blob.size < 1) continue;
    const blobKey = `pending:${id}:line:${rec.lineId}`;
    await saveBlob(blobKey, rec.blob);
    takes.push({
      lineId: rec.lineId,
      blobKey,
      durationMs: rec.durationMs,
      score: rec.score,
    });
  }

  if (takes.length === 0) {
    throw new Error("Nothing to save — record the scene first.");
  }

  const row: StoredPendingDub = {
    id,
    authorId: input.authorId,
    packId: input.packId,
    packTitle: input.packTitle,
    packThumbnailColor: input.packThumbnailColor,
    caption: input.caption.trim(),
    lines: stripLineUrls(input.lines),
    takes,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  await savePendingDubRow(row);
  return row;
}

async function loadPendingRecordings(
  dub: StoredPendingDub
): Promise<RecordedLine[]> {
  const recordings: RecordedLine[] = [];
  for (const take of dub.takes) {
    const blob = await loadBlob(take.blobKey);
    if (!blob) continue;
    recordings.push({
      lineId: take.lineId,
      blob,
      durationMs: take.durationMs,
      score: take.score,
    });
  }
  return recordings;
}

async function deletePendingDubMedia(dub: StoredPendingDub): Promise<void> {
  for (const take of dub.takes) {
    await deleteBlob(take.blobKey);
  }
  await deletePendingDubRow(dub.id);
}

export type FlushPendingResult = {
  uploaded: number;
  failed: number;
  errors: string[];
};

/** Upload device-saved dubs when back online. Requires signed-in user. */
export async function flushPendingDubs(
  authorId: string
): Promise<FlushPendingResult> {
  const pending = await listPendingDubs();
  const result: FlushPendingResult = { uploaded: 0, failed: 0, errors: [] };

  for (const dub of pending) {
    if (dub.status === "uploading") continue;

    await savePendingDubRow({ ...dub, status: "uploading", lastError: undefined });

    try {
      const recordings = await loadPendingRecordings(dub);
      if (!recordings.length) {
        await deletePendingDubMedia(dub);
        continue;
      }

      const localPacks = await loadUserDubPacks();
      const pack = localPacks.find((p) => p.id === dub.packId);

      await publishDubPost({
        authorId,
        packId: dub.packId,
        packTitle: dub.packTitle,
        caption: dub.caption,
        packThumbnailColor: dub.packThumbnailColor,
        packThumbnailUrl: pack?.thumbnailUrl.startsWith("blob:")
          ? undefined
          : pack?.thumbnailUrl,
        videoUrl: pack?.videoUrl,
        backingUrl: pack?.backingTrackUrl,
        lines: dub.lines,
        recordings,
      });

      await deletePendingDubMedia(dub);
      result.uploaded += 1;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not upload saved dub.";
      await savePendingDubRow({
        ...dub,
        status: "failed",
        lastError: message,
      });
      result.failed += 1;
      result.errors.push(`${dub.packTitle}: ${message}`);
    }
  }

  return result;
}

export async function discardPendingDub(id: string): Promise<void> {
  const pending = await listPendingDubs();
  const dub = pending.find((d) => d.id === id);
  if (!dub) return;
  await deletePendingDubMedia(dub);
}
