import type { DubLine, DubPack } from "./types";
import { PALETTE } from "./colors";
import { sliceAudioBlob } from "./audioSlice";
import {
  deleteCloudDubPack,
  hydratePackLineReferences,
  isUuid,
  listCloudDubPacks,
  loadCloudPackMediaForEdit,
  publishPackToCloud,
} from "./cloudPacks";

const DB_NAME = "imitation-star";
const DB_VERSION = 2;
const PACK_STORE = "packs";
const BLOB_STORE = "blobs";

export const UPLOAD_MAX_BYTES = 95 * 1024 * 1024; // 95 MB
export const UPLOAD_MAX_DURATION_SEC = 5 * 60; // 5 minutes
export const BACKING_MAX_BYTES = 40 * 1024 * 1024; // 40 MB

export interface StoredUserPack {
  id: string;
  title: string;
  description: string;
  creator: string;
  tags: string[];
  nsfw: boolean;
  playCount: number;
  createdAt: string;
  thumbnailColor: string;
  /** Lines without live object URLs */
  lines: DubLine[];
  videoKey?: string;
  thumbKey: string;
  /** Optional CV-style no-dialogue stem */
  backingKey?: string;
  /** Full vocals stem */
  vocalsKey?: string;
  /** lineId → blob key for per-line reference slices */
  lineRefKeys?: Record<string, string>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PACK_STORE)) {
        db.createObjectStore(PACK_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "key" });
      }
    };
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function saveBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(BLOB_STORE, "readwrite");
  await idbReq(tx.objectStore(BLOB_STORE).put({ key, blob }));
  db.close();
}

export async function loadBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(BLOB_STORE, "readonly");
  const row = await idbReq<{ key: string; blob: Blob } | undefined>(
    tx.objectStore(BLOB_STORE).get(key)
  );
  db.close();
  return row?.blob ?? null;
}

export async function deleteBlob(key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(BLOB_STORE, "readwrite");
  await idbReq(tx.objectStore(BLOB_STORE).delete(key));
  db.close();
}

export async function listStoredPacks(): Promise<StoredUserPack[]> {
  const db = await openDb();
  const tx = db.transaction(PACK_STORE, "readonly");
  const all = await idbReq<StoredUserPack[]>(tx.objectStore(PACK_STORE).getAll());
  db.close();
  return all ?? [];
}

export async function saveStoredPack(pack: StoredUserPack): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PACK_STORE, "readwrite");
  await idbReq(tx.objectStore(PACK_STORE).put(pack));
  db.close();
}

export async function deleteStoredPack(id: string): Promise<void> {
  const packs = await listStoredPacks();
  const found = packs.find((p) => p.id === id);
  if (found) {
    if (found.videoKey) await deleteBlob(found.videoKey);
    await deleteBlob(found.thumbKey);
    if (found.backingKey) await deleteBlob(found.backingKey);
    if (found.vocalsKey) await deleteBlob(found.vocalsKey);
    if (found.lineRefKeys) {
      for (const key of Object.values(found.lineRefKeys)) {
        await deleteBlob(key);
      }
    }
  }
  const db = await openDb();
  const tx = db.transaction(PACK_STORE, "readwrite");
  await idbReq(tx.objectStore(PACK_STORE).delete(id));
  db.close();
}

/** Strip ephemeral object URLs before persisting line metadata. */
function stripLineUrls(lines: DubLine[]): DubLine[] {
  return lines.map(({ referenceAudioUrl: _r, ...rest }) => rest);
}

/** Hydrate stored packs into DubPacks with object URLs for video + thumb + backing. */
export async function loadUserDubPacks(): Promise<DubPack[]> {
  const stored = await listStoredPacks();
  const packs: DubPack[] = [];

  for (const s of stored) {
    const thumb = await loadBlob(s.thumbKey);
    if (!thumb) continue;

    const video = s.videoKey ? await loadBlob(s.videoKey) : null;

    let backingTrackUrl: string | undefined;
    if (s.backingKey) {
      const backing = await loadBlob(s.backingKey);
      if (backing) backingTrackUrl = URL.createObjectURL(backing);
    }

    let vocalsStemUrl: string | undefined;
    if (s.vocalsKey) {
      const vocals = await loadBlob(s.vocalsKey);
      if (vocals) vocalsStemUrl = URL.createObjectURL(vocals);
    }

    const lines: DubLine[] = [];
    for (const line of s.lines) {
      let referenceAudioUrl: string | undefined;
      const refKey = s.lineRefKeys?.[line.id];
      if (refKey) {
        const ref = await loadBlob(refKey);
        if (ref) referenceAudioUrl = URL.createObjectURL(ref);
      }
      lines.push({ ...line, referenceAudioUrl });
    }

    packs.push({
      id: s.id,
      title: s.title,
      description: s.description,
      creator: s.creator,
      clipCount: lines.length,
      tags: s.tags,
      nsfw: s.nsfw,
      playCount: s.playCount,
      createdAt: s.createdAt,
      thumbnailColor: s.thumbnailColor,
      thumbnailUrl: URL.createObjectURL(thumb),
      videoUrl: video ? URL.createObjectURL(video) : undefined,
      backingTrackUrl,
      vocalsStemUrl,
      lines,
      source: "user",
    });
  }

  return packs;
}

export type PackEditMedia = {
  /** Null for studio-style voice packs with no dub video. */
  videoFile: File | null;
  backingFile: File | null;
  vocalsFile: File | null;
  /** Per-line reference audio (especially voice packs). */
  lineRefBlobs?: Record<string, Blob>;
  thumbBlob?: Blob | null;
};

function blobToFile(blob: Blob, name: string, fallbackType: string): File {
  const type = blob.type || fallbackType;
  return new File([blob], name, { type });
}

/** Load raw media files for re-opening a pack in the maker (local, then cloud). */
export async function loadUserPackMediaForEdit(
  packId: string
): Promise<PackEditMedia | null> {
  const stored = await listStoredPacks();
  const s = stored.find((p) => p.id === packId);
  if (s) {
    const video = s.videoKey ? await loadBlob(s.videoKey) : null;
    const thumb = await loadBlob(s.thumbKey);

    let backingFile: File | null = null;
    if (s.backingKey) {
      const backing = await loadBlob(s.backingKey);
      if (backing) {
        backingFile = blobToFile(backing, "_backing_track.wav", "audio/wav");
      }
    }

    let vocalsFile: File | null = null;
    if (s.vocalsKey) {
      const vocals = await loadBlob(s.vocalsKey);
      if (vocals) {
        vocalsFile = blobToFile(vocals, "_vocals.wav", "audio/wav");
      }
    }

    const lineRefBlobs: Record<string, Blob> = {};
    if (s.lineRefKeys) {
      for (const [lineId, key] of Object.entries(s.lineRefKeys)) {
        const ref = await loadBlob(key);
        if (ref) lineRefBlobs[lineId] = ref;
      }
    }

    // Voice packs may have no video — still editable via line clips.
    if (!video && Object.keys(lineRefBlobs).length === 0 && s.lines.length === 0) {
      return null;
    }

    return {
      videoFile: video
        ? blobToFile(video, `${s.title || "pack"}.mp4`, "video/mp4")
        : null,
      backingFile,
      vocalsFile,
      lineRefBlobs:
        Object.keys(lineRefBlobs).length > 0 ? lineRefBlobs : undefined,
      thumbBlob: thumb,
    };
  }

  return loadCloudPackMediaForEdit(packId);
}

/**
 * Local packs + community cloud packs (deduped).
 * Prefer local copy when the same id exists (faster, editable offline).
 */
export async function loadBrowsablePacks(): Promise<DubPack[]> {
  const local = await loadUserDubPacks();
  let cloud: DubPack[] = [];
  try {
    cloud = await listCloudDubPacks();
  } catch {
    cloud = [];
  }

  const localIds = new Set(local.map((p) => p.id));
  const merged = [...local];
  for (const pack of cloud) {
    if (!localIds.has(pack.id)) merged.push(pack);
  }
  return merged;
}

/**
 * Remove a pack the current user owns — local IndexedDB copy and/or cloud row.
 * Published packs often show as `source: "user"` (local preferred), so UUID ids
 * also attempt a cloud delete (no-op when the row is missing).
 */
export async function deleteBrowsablePack(pack: DubPack): Promise<void> {
  await deleteStoredPack(pack.id);

  if (pack.source !== "cloud" && !isUuid(pack.id)) return;

  try {
    await deleteCloudDubPack(pack.id);
  } catch (e) {
    if (pack.source === "cloud") throw e;
  }
}

export { hydratePackLineReferences };

export async function persistUploadedPack(input: {
  title: string;
  description: string;
  creator: string;
  tags: string[];
  nsfw: boolean;
  lines: DubLine[];
  /** Omit for studio-style voice packs (no dub video). */
  videoBlob?: Blob | null;
  thumbBlob: Blob;
  backingBlob?: Blob | null;
  vocalsBlob?: Blob | null;
  /** Pre-built per-line reference audio (CV import); used when no vocals stem. */
  lineRefBlobs?: Record<string, Blob>;
  /** When set, overwrite this user pack instead of creating a new one. */
  existingId?: string;
  /** When set, also publish/update the pack in Supabase for everyone. */
  publish?: { userId: string } | null;
}): Promise<DubPack & { published?: boolean; publishError?: string }> {
  const existing = input.existingId
    ? (await listStoredPacks()).find((p) => p.id === input.existingId)
    : undefined;

  if (input.existingId && !existing && !isUuid(input.existingId)) {
    throw new Error("That pack could not be found to update.");
  }

  // Prefer UUID when publishing so local + cloud share one id.
  let id: string;
  if (existing?.id && (!input.publish || isUuid(existing.id))) {
    id = existing.id;
  } else if (input.existingId && isUuid(input.existingId)) {
    id = input.existingId;
  } else if (input.publish) {
    id = crypto.randomUUID();
  } else {
    id =
      existing?.id ??
      `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  // Migrating a legacy local id → UUID: drop the old IndexedDB row after save.
  const legacyLocalId =
    existing && existing.id !== id ? existing.id : undefined;

  const videoKey = input.videoBlob ? `${id}:video` : undefined;
  const thumbKey = `${id}:thumb`;
  const backingKey = input.backingBlob ? `${id}:backing` : undefined;
  const vocalsKey = input.vocalsBlob ? `${id}:vocals` : undefined;
  const createdAt = existing?.createdAt ?? new Date().toISOString().slice(0, 10);
  const playCount = existing?.playCount ?? 0;

  // Drop old line slices / unused stems before rewriting.
  if (existing?.lineRefKeys) {
    for (const key of Object.values(existing.lineRefKeys)) {
      await deleteBlob(key);
    }
  }
  if (existing?.backingKey && !backingKey) {
    await deleteBlob(existing.backingKey);
  }
  if (existing?.vocalsKey && !vocalsKey) {
    await deleteBlob(existing.vocalsKey);
  }

  if (videoKey && input.videoBlob) {
    await saveBlob(videoKey, input.videoBlob);
  } else if (existing?.videoKey) {
    await deleteBlob(existing.videoKey);
  }
  await saveBlob(thumbKey, input.thumbBlob);
  if (backingKey && input.backingBlob) {
    await saveBlob(backingKey, input.backingBlob);
  }
  if (vocalsKey && input.vocalsBlob) {
    await saveBlob(vocalsKey, input.vocalsBlob);
  }

  const lineRefKeys: Record<string, string> = {};
  const hydratedLines: DubLine[] = [];

  for (const line of input.lines) {
    let referenceAudioUrl: string | undefined;
    const importedRef = input.lineRefBlobs?.[line.id];
    if (importedRef && importedRef.size > 0) {
      const refKey = `${id}:line:${line.id}`;
      await saveBlob(refKey, importedRef);
      lineRefKeys[line.id] = refKey;
      referenceAudioUrl = URL.createObjectURL(importedRef);
    } else if (input.vocalsBlob) {
      try {
        const slice = await sliceAudioBlob(
          input.vocalsBlob,
          line.startMs,
          line.endMs
        );
        const refKey = `${id}:line:${line.id}`;
        await saveBlob(refKey, slice);
        lineRefKeys[line.id] = refKey;
        referenceAudioUrl = URL.createObjectURL(slice);
      } catch {
        /* skip slice on decode failure */
      }
    }
    hydratedLines.push({ ...line, referenceAudioUrl });
  }

  const stored: StoredUserPack = {
    id,
    title: input.title.trim() || "Untitled pack",
    description: input.description.trim(),
    creator: input.creator.trim() || "You",
    tags: input.tags.length ? input.tags : ["upload"],
    nsfw: input.nsfw,
    playCount,
    createdAt,
    thumbnailColor: existing?.thumbnailColor ?? PALETTE.coral,
    lines: stripLineUrls(hydratedLines),
    videoKey,
    thumbKey,
    backingKey,
    vocalsKey,
    lineRefKeys:
      Object.keys(lineRefKeys).length > 0 ? lineRefKeys : undefined,
  };

  await saveStoredPack(stored);

  if (legacyLocalId) {
    await deleteStoredPack(legacyLocalId);
  }

  let published = false;
  let publishError: string | undefined;

  if (input.publish) {
    try {
      let publishVideo = input.videoBlob ?? null;
      if (!publishVideo) {
        const { createPlaceholderVideoBlob } = await import("./packImport");
        publishVideo = await createPlaceholderVideoBlob();
      }
      await publishPackToCloud({
        packId: id,
        ownerId: input.publish.userId,
        title: stored.title,
        description: stored.description,
        creatorName: stored.creator,
        tags: stored.tags,
        nsfw: stored.nsfw,
        thumbnailColor: stored.thumbnailColor,
        lines: hydratedLines,
        videoBlob: publishVideo,
        thumbBlob: input.thumbBlob,
        backingBlob: input.backingBlob,
        vocalsBlob: input.vocalsBlob,
        playCount,
        createdAt: new Date(createdAt).toISOString(),
      });
      published = true;
    } catch (e) {
      publishError =
        e instanceof Error ? e.message : "Could not publish to the library.";
    }
  }

  return {
    id,
    title: stored.title,
    description: stored.description,
    creator: stored.creator,
    clipCount: hydratedLines.length,
    tags: stored.tags,
    nsfw: stored.nsfw,
    playCount: stored.playCount,
    createdAt,
    thumbnailColor: stored.thumbnailColor,
    thumbnailUrl: URL.createObjectURL(input.thumbBlob),
    videoUrl: input.videoBlob
      ? URL.createObjectURL(input.videoBlob)
      : undefined,
    backingTrackUrl: input.backingBlob
      ? URL.createObjectURL(input.backingBlob)
      : undefined,
    vocalsStemUrl: input.vocalsBlob
      ? URL.createObjectURL(input.vocalsBlob)
      : undefined,
    lines: hydratedLines,
    source: "user",
    ownerId: input.publish?.userId,
    published,
    publishError,
  };
}

export function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas unavailable"));
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not capture frame"));
      },
      "image/jpeg",
      0.85
    );
  });
}

export function formatTimecode(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** CV Pack Maker style: 00:01.748 */
export function formatTimecodePrecise(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = clamped / 1000;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  const whole = Math.floor(s);
  const frac = Math.round((s - whole) * 1000);
  return `${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(frac).padStart(3, "0")}`;
}

export function parseTimecodeToMs(value: string): number {
  const v = value.trim();
  if (v.includes(":")) {
    const [a, b] = v.split(":");
    const min = Number(a) || 0;
    const sec = Number(b) || 0;
    return Math.round((min * 60 + sec) * 1000);
  }
  return Math.round((Number(v) || 0) * 1000);
}
