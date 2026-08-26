import JSZip from "jszip";
import type { DubLine, DubPack } from "./types";
import { sliceAudioBlob } from "./audioSlice";

export type PackExportCharacter = {
  id: string;
  name: string;
  color: string;
};

export type PackExportInput = {
  title: string;
  creator: string;
  createdAt?: string;
  characters: PackExportCharacter[];
  lines: Array<{
    id: string;
    characterId: string;
    speaker: string;
    text: string;
    startMs: number;
    endMs: number;
  }>;
  videoBlob: Blob;
  thumbBlob?: Blob | null;
  backingBlob?: Blob | null;
  vocalsBlob?: Blob | null;
  /** Pre-sliced line references; if missing and vocalsBlob set, slices on export */
  lineRefBlobs?: Record<string, Blob>;
};

export type PackJson = {
  id: string;
  title: string;
  creator: string;
  createdAt: string;
  video: string;
  backingTrack?: string;
  vocalsStem?: string;
  thumbnail?: string;
  characters: PackExportCharacter[];
  lines: Array<{
    id: string;
    characterId: string;
    speaker: string;
    text: string;
    startMs: number;
    endMs: number;
    referenceAudio?: string;
  }>;
};

function safeFolderName(title: string): string {
  const base = title.trim() || "MyPack";
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 80);
}

function extForBlob(blob: Blob, fallback: string): string {
  const t = blob.type || "";
  if (t.includes("webm")) return "webm";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  if (t.includes("wav")) return "wav";
  if (t.includes("mp4")) return "mp4";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("png")) return "png";
  return fallback;
}

/** Build a CV-style pack ZIP (pack.json + media + lines/). */
export async function buildPackZip(input: PackExportInput): Promise<Blob> {
  const zip = new JSZip();
  const folderName = safeFolderName(input.title);
  const root = zip.folder(folderName);
  if (!root) throw new Error("Could not create ZIP folder");

  const id = `pack-${Date.now().toString(36)}`;
  const createdAt = input.createdAt || new Date().toISOString().slice(0, 10);

  const videoExt = extForBlob(input.videoBlob, "mp4");
  const videoName = `video.${videoExt}`;
  root.file(videoName, input.videoBlob);

  let backingName: string | undefined;
  if (input.backingBlob) {
    backingName = `_backing_track.${extForBlob(input.backingBlob, "ogg")}`;
    root.file(backingName, input.backingBlob);
  }

  let vocalsName: string | undefined;
  if (input.vocalsBlob) {
    vocalsName = `vocals.${extForBlob(input.vocalsBlob, "ogg")}`;
    root.file(vocalsName, input.vocalsBlob);
  }

  let thumbName: string | undefined;
  if (input.thumbBlob) {
    thumbName = `thumb.${extForBlob(input.thumbBlob, "jpg")}`;
    root.file(thumbName, input.thumbBlob);
  }

  const linesFolder = root.folder("lines");
  if (!linesFolder) throw new Error("Could not create lines folder");

  const packLines: PackJson["lines"] = [];
  let lineIndex = 0;
  for (const line of input.lines) {
    lineIndex += 1;
    const pad = String(lineIndex).padStart(3, "0");
    let refName: string | undefined;
    let refBlob = input.lineRefBlobs?.[line.id];
    if (!refBlob && input.vocalsBlob) {
      try {
        refBlob = await sliceAudioBlob(
          input.vocalsBlob,
          line.startMs,
          line.endMs
        );
      } catch {
        refBlob = undefined;
      }
    }
    if (refBlob) {
      const ext = extForBlob(refBlob, "ogg");
      refName = `lines/line-${pad}.${ext}`;
      linesFolder.file(`line-${pad}.${ext}`, refBlob);
    }
    packLines.push({
      id: line.id,
      characterId: line.characterId,
      speaker: line.speaker,
      text: line.text,
      startMs: line.startMs,
      endMs: line.endMs,
      referenceAudio: refName,
    });
  }

  const packJson: PackJson = {
    id,
    title: input.title.trim() || "Untitled pack",
    creator: input.creator.trim() || "You",
    createdAt,
    video: videoName,
    backingTrack: backingName,
    vocalsStem: vocalsName,
    thumbnail: thumbName,
    characters: input.characters,
    lines: packLines,
  };

  root.file("pack.json", JSON.stringify(packJson, null, 2));

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export a hydrated DubPack when blobs are available via fetch of object URLs. */
export async function exportDubPackZip(
  pack: DubPack,
  characters: PackExportCharacter[]
): Promise<Blob> {
  if (!pack.videoUrl) throw new Error("Pack has no video");
  const videoBlob = await (await fetch(pack.videoUrl)).blob();
  const thumbBlob = pack.thumbnailUrl
    ? await (await fetch(pack.thumbnailUrl)).blob().catch(() => null)
    : null;
  const backingBlob = pack.backingTrackUrl
    ? await (await fetch(pack.backingTrackUrl)).blob().catch(() => null)
    : null;
  const vocalsBlob = pack.vocalsStemUrl
    ? await (await fetch(pack.vocalsStemUrl)).blob().catch(() => null)
    : null;

  const lineRefBlobs: Record<string, Blob> = {};
  for (const line of pack.lines) {
    if (!line.referenceAudioUrl) continue;
    try {
      lineRefBlobs[line.id] = await (await fetch(line.referenceAudioUrl)).blob();
    } catch {
      /* skip */
    }
  }

  const charByName = new Map(characters.map((c) => [c.name, c]));
  const lines = pack.lines.map((line: DubLine) => {
    const ch =
      charByName.get(line.speaker) ??
      characters[0] ?? {
        id: "char-a",
        name: line.speaker,
        color: "#375F57",
      };
    return {
      id: line.id,
      characterId: ch.id,
      speaker: line.speaker,
      text: line.text,
      startMs: line.startMs,
      endMs: line.endMs,
    };
  });

  return buildPackZip({
    title: pack.title,
    creator: pack.creator,
    createdAt: pack.createdAt,
    characters:
      characters.length > 0
        ? characters
        : [
            {
              id: "char-a",
              name: pack.lines[0]?.speaker || "Character A",
              color: "#375F57",
            },
          ],
    lines,
    videoBlob,
    thumbBlob,
    backingBlob,
    vocalsBlob,
    lineRefBlobs,
  });
}
