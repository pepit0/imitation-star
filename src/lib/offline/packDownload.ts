import { hydratePackLineReferences } from "@/lib/cloudPacks";
import {
  cachePackForOffline,
  hasLocalPackCopy,
  loadUserDubPacks,
} from "@/lib/packStore";
import type { DubPack } from "@/lib/types";

async function fetchBlob(
  url: string | undefined,
  label: string
): Promise<Blob | null> {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not download ${label}.`);
  }
  return res.blob();
}

/** Download pack media to IndexedDB for offline singleplayer. */
export async function downloadPackForOffline(
  pack: DubPack,
  onProgress?: (message: string) => void
): Promise<DubPack> {
  if (await hasLocalPackCopy(pack.id)) {
    const local = await loadUserDubPacks();
    const found = local.find((p) => p.id === pack.id);
    if (found) return found;
  }

  onProgress?.("Preparing audio…");
  const hydrated = await hydratePackLineReferences(pack);

  onProgress?.("Downloading cover…");
  const thumbBlob = await fetchBlob(hydrated.thumbnailUrl, "cover art");
  if (!thumbBlob) throw new Error("Could not download cover art.");

  onProgress?.("Downloading video…");
  const videoBlob = await fetchBlob(hydrated.videoUrl, "video");

  onProgress?.("Downloading stems…");
  const backingBlob = await fetchBlob(
    hydrated.backingTrackUrl,
    "backing track"
  );
  const vocalsBlob = await fetchBlob(hydrated.vocalsStemUrl, "vocals stem");

  const lineRefBlobs: Record<string, Blob> = {};
  for (const line of hydrated.lines) {
    if (!line.referenceAudioUrl) continue;
    onProgress?.(`Downloading line ${line.id}…`);
    const blob = await fetchBlob(line.referenceAudioUrl, `line ${line.id}`);
    if (blob) lineRefBlobs[line.id] = blob;
  }

  onProgress?.("Saving to device…");
  return cachePackForOffline({
    pack: hydrated,
    thumbBlob,
    videoBlob,
    backingBlob,
    vocalsBlob,
    lineRefBlobs,
  });
}

export function canDownloadPack(pack: DubPack): boolean {
  return pack.source === "cloud" || pack.source === "builtin";
}
