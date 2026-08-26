import {
  clearCloudPackProgress,
  getCloudPackProgressSummary,
  loadCloudPackProgress,
  listCloudPackProgressSummaries,
  saveCloudPackProgress,
} from "@/lib/cloudPackProgress";
import {
  clearLocalPackProgress,
  getLocalPackProgressSummary,
  listAllLocalPackProgressSummaries,
  loadLocalPackProgress,
  saveLocalPackProgress,
  type PackProgress,
  type PackProgressSummary,
} from "@/lib/offline/packProgress";
import type { RecordedLine } from "@/lib/types";

export type { PackProgress, PackProgressSummary };

export type PackProgressContext = {
  userId?: string;
  online?: boolean;
  packTitle?: string;
};

function isOnline(ctx?: PackProgressContext): boolean {
  if (ctx?.online === false) return false;
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function canSyncCloud(ctx?: PackProgressContext): boolean {
  return Boolean(ctx?.userId && isOnline(ctx));
}

async function mirrorProgressToLocal(
  packId: string,
  progress: PackProgress
): Promise<void> {
  await saveLocalPackProgress(packId, progress.lineIndex, progress.recordings);
}

/** Save pack progress locally; sync to profile when signed in and online. */
export async function savePackProgress(
  packId: string,
  lineIndex: number,
  recordings: RecordedLine[],
  ctx?: PackProgressContext
): Promise<void> {
  await saveLocalPackProgress(packId, lineIndex, recordings);

  if (!canSyncCloud(ctx) || !ctx?.userId) return;

  try {
    await saveCloudPackProgress({
      userId: ctx.userId,
      packId,
      packTitle: ctx.packTitle ?? "",
      lineIndex,
      recordings,
    });
  } catch (e) {
    console.warn("Could not sync pack progress to profile:", e);
  }
}

/** Load progress — merges cloud profile save with local cache (newest wins). */
export async function loadPackProgress(
  packId: string,
  ctx?: PackProgressContext
): Promise<PackProgress | null> {
  const local = await loadLocalPackProgress(packId);

  if (!canSyncCloud(ctx) || !ctx?.userId) {
    return local;
  }

  try {
    const cloud = await loadCloudPackProgress(ctx.userId, packId);
    if (!cloud && !local) return null;
    if (!cloud) return local;
    if (!local) {
      await mirrorProgressToLocal(packId, cloud);
      return cloud;
    }

    const cloudTime = new Date(cloud.updatedAt).getTime();
    const localTime = new Date(local.updatedAt).getTime();

    if (cloudTime >= localTime) {
      await mirrorProgressToLocal(packId, cloud);
      return cloud;
    }

    void saveCloudPackProgress({
      userId: ctx.userId,
      packId,
      packTitle: ctx.packTitle ?? "",
      lineIndex: local.lineIndex,
      recordings: local.recordings,
    }).catch((e) => {
      console.warn("Could not push newer local progress to profile:", e);
    });

    return local;
  } catch (e) {
    console.warn("Could not load cloud pack progress:", e);
    return local;
  }
}

export async function getPackProgressSummary(
  packId: string,
  ctx?: PackProgressContext
): Promise<PackProgressSummary | null> {
  const local = await getLocalPackProgressSummary(packId);

  if (!canSyncCloud(ctx) || !ctx?.userId) {
    return local;
  }

  try {
    const cloud = await getCloudPackProgressSummary(ctx.userId, packId);
    if (!cloud) return local;
    if (!local) return cloud;

    return new Date(cloud.updatedAt) >= new Date(local.updatedAt)
      ? cloud
      : local;
  } catch {
    return local;
  }
}

/** Summaries for many packs — used by pack browser / menu. */
export async function listPackProgressSummaries(
  packIds: string[],
  ctx?: PackProgressContext
): Promise<Map<string, PackProgressSummary>> {
  const packIdSet = new Set(packIds);
  const allLocal = await listAllLocalPackProgressSummaries();
  const map = new Map<string, PackProgressSummary>();

  for (const [packId, summary] of allLocal) {
    if (packIdSet.has(packId)) map.set(packId, summary);
  }

  if (!canSyncCloud(ctx) || !ctx?.userId) {
    return map;
  }

  try {
    const cloudMap = await listCloudPackProgressSummaries(ctx.userId);
    for (const [packId, cloud] of cloudMap) {
      if (!packIdSet.has(packId)) continue;
      const local = map.get(packId);
      if (!local || new Date(cloud.updatedAt) >= new Date(local.updatedAt)) {
        map.set(packId, cloud);
      }
    }
  } catch (e) {
    console.warn("Could not list cloud pack progress:", e);
  }

  return map;
}

/** Patch one pack's summary into an existing map (after save/clear). */
export async function refreshPackProgressSummary(
  packId: string,
  ctx?: PackProgressContext
): Promise<PackProgressSummary | null> {
  return getPackProgressSummary(packId, ctx);
}

export async function clearPackProgress(
  packId: string,
  ctx?: PackProgressContext
): Promise<void> {
  await clearLocalPackProgress(packId);

  if (!canSyncCloud(ctx) || !ctx?.userId) return;

  try {
    await clearCloudPackProgress(ctx.userId, packId);
  } catch (e) {
    console.warn("Could not clear cloud pack progress:", e);
  }
}
