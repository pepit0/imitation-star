import JSZip from "jszip";
import { readConfigData } from "./godotConfig";
import { getAudioDurationMs } from "./audioDuration";
import type { PackJson } from "./packExport";

const AUDIO_EXT = /\.(wav|mp3|ogg|oga|flac|m4a)$/i;
const META_EXT = /\.(txt|ini)$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|webp|gif)$/i;
const VIDEO_NAMES = [
  "dub_video.ogv",
  "dub_video.webm",
  "dub_video.mp4",
  "video.mp4",
  "video.webm",
];
const PACK_META = "_pack_info.ini";
const BACKING_NAMES = [
  "_backing_track.ogg",
  "_backing_track.mp3",
  "_backing_track.wav",
];

export type CvImportClip = {
  id: string;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  audioBlob: Blob;
  audioFile: File;
  imageBlob?: Blob;
};

export type CvImportResult = {
  kind: "dub" | "voice" | "imitation";
  title: string;
  creator: string;
  description: string;
  videoFile: File | null;
  backingFile: File | null;
  thumbBlob: Blob | null;
  clips: CvImportClip[];
  /** True when video is OGV and may not play in all browsers. */
  ogvVideo: boolean;
};

type ZipEntry = {
  path: string;
  name: string;
  dir: string;
  blob: Blob;
};

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

function dirname(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}

function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(0, dot) : name;
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function blobToFile(blob: Blob, name: string, fallbackType: string): File {
  const type = blob.type || fallbackType;
  return new File([blob], name, { type });
}

function mimeForExt(name: string, fallback: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  if (lower.endsWith(".ogv")) return "video/ogg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return fallback;
}

function newClipId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Natural sort for CV clip prefixes like 01_, 201_, section1. */
function compareClipNames(a: string, b: string): number {
  const numA = a.match(/^(\d+)/)?.[1];
  const numB = b.match(/^(\d+)/)?.[1];
  if (numA && numB && numA !== numB) {
    return Number(numA) - Number(numB);
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function loadZipEntries(file: File): Promise<ZipEntry[]> {
  const zip = await JSZip.loadAsync(file);
  const entries: ZipEntry[] = [];

  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const path = normalizeZipPath(rawPath);
    const blob = await entry.async("blob");
    entries.push({
      path,
      name: basename(path),
      dir: dirname(path),
      blob,
    });
  }

  return entries;
}

/** Find the folder that contains pack contents (unwrap single wrapper folder). */
function findPackRootDir(entries: ZipEntry[]): string {
  const dirs = new Set(entries.map((e) => e.dir).filter(Boolean));
  if (dirs.size === 1) {
    return [...dirs][0]!;
  }

  for (const e of entries) {
    if (
      VIDEO_NAMES.includes(e.name.toLowerCase()) ||
      e.name === PACK_META ||
      e.name === "pack.json"
    ) {
      return e.dir;
    }
  }

  const audioDirs = entries
    .filter((e) => AUDIO_EXT.test(e.name))
    .map((e) => e.dir);
  if (audioDirs.length) {
    const counts = new Map<string, number>();
    for (const d of audioDirs) counts.set(d, (counts.get(d) ?? 0) + 1);
    let best = "";
    let bestCount = 0;
    for (const [d, c] of counts) {
      if (c > bestCount) {
        best = d;
        bestCount = c;
      }
    }
    return best;
  }

  return entries[0]?.dir ?? "";
}

function entriesInRoot(entries: ZipEntry[], root: string): ZipEntry[] {
  const prefix = root ? `${root}/` : "";
  return entries.filter((e) => e.path === root || e.path.startsWith(prefix));
}

function findEntry(
  scoped: ZipEntry[],
  names: string[] | ((name: string) => boolean)
): ZipEntry | undefined {
  const match =
    typeof names === "function"
      ? (n: string) => names(n)
      : (n: string) => names.includes(n.toLowerCase());
  return scoped.find((e) => match(e.name.toLowerCase()));
}

function findByStem(
  scoped: ZipEntry[],
  baseStem: string,
  extTest: RegExp
): ZipEntry | undefined {
  const lower = baseStem.toLowerCase();
  return scoped.find(
    (e) => extTest.test(e.name) && stem(e.name).toLowerCase() === lower
  );
}

function parseAuthors(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean).join(", ") || "Unknown";
  }
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "Unknown";
}

async function readPackInfo(scoped: ZipEntry[]): Promise<{
  title: string;
  creator: string;
  description: string;
  iconName?: string;
}> {
  const infoEntry = findEntry(scoped, [PACK_META.toLowerCase()]);
  let title = "";
  let creator = "Unknown";
  let description = "";
  let iconName: string | undefined;

  if (infoEntry) {
    const text = await infoEntry.blob.text();
    const data = readConfigData(text);
    title = String(data.title ?? "").trim();
    creator = parseAuthors(data.authors ?? data.author);
    description = String(data.subtitle ?? data.readme ?? "").trim();
    if (typeof data.icon === "string" && data.icon.trim()) {
      iconName = data.icon.trim().replace(/^.*[/\\]/, "");
    }
  }

  const subtitleEntry = scoped.find(
    (e) => e.name.toLowerCase() === "_subtitle.txt"
  );
  if (subtitleEntry && !description) {
    description = (await subtitleEntry.blob.text()).trim();
  }

  return { title, creator, description, iconName };
}

function speakerFromFilename(name: string): string {
  const base = stem(name);
  const parts = base.split("_");
  if (parts.length >= 2 && /^\d+$/.test(parts[0]!)) {
    return parts.slice(1).join("_").replace(/_/g, " ").trim() || "Speaker";
  }
  return "Speaker";
}

function textFromFilename(name: string): string {
  const base = stem(name);
  const parts = base.split("_");
  const label =
    parts.length >= 2 && /^\d+$/.test(parts[0]!)
      ? parts.slice(1).join(" ")
      : base.replace(/_/g, " ");
  return label.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function isClipAudio(name: string): boolean {
  if (!AUDIO_EXT.test(name)) return false;
  const lower = name.toLowerCase();
  if (lower.startsWith("_backing")) return false;
  return true;
}

async function parseImitationPack(
  scoped: ZipEntry[],
  packJson: PackJson,
  fallbackTitle: string
): Promise<CvImportResult> {
  const findRel = (rel?: string) =>
    rel
      ? scoped.find((e) => e.path.endsWith(`/${rel}`) || e.name === rel)
      : undefined;

  const videoEntry = findRel(packJson.video);
  const backingEntry = findRel(packJson.backingTrack);
  const thumbEntry = findRel(packJson.thumbnail);

  const clips: CvImportClip[] = [];
  for (const line of packJson.lines) {
    let audioBlob: Blob | null = null;
    let audioName = `line-${line.id}.wav`;
    if (line.referenceAudio) {
      const refEntry = findRel(line.referenceAudio);
      if (refEntry) {
        audioBlob = refEntry.blob;
        audioName = refEntry.name;
      }
    }
    if (!audioBlob) {
      audioBlob = new Blob([], { type: "audio/wav" });
    }
    clips.push({
      id: line.id || newClipId("clip"),
      speaker: line.speaker || "Speaker",
      text: line.text || "",
      startMs: line.startMs,
      endMs: line.endMs,
      audioBlob,
      audioFile: blobToFile(audioBlob, audioName, "audio/wav"),
    });
  }

  return {
    kind: "imitation",
    title: packJson.title || fallbackTitle,
    creator: packJson.creator || "Unknown",
    description: "",
    videoFile: videoEntry
      ? blobToFile(
          videoEntry.blob,
          videoEntry.name,
          mimeForExt(videoEntry.name, "video/mp4")
        )
      : null,
    backingFile: backingEntry
      ? blobToFile(
          backingEntry.blob,
          backingEntry.name,
          mimeForExt(backingEntry.name, "audio/ogg")
        )
      : null,
    thumbBlob: thumbEntry?.blob ?? null,
    clips,
    ogvVideo: videoEntry?.name.toLowerCase().endsWith(".ogv") ?? false,
  };
}

async function parseCvDubPack(
  scoped: ZipEntry[],
  meta: {
    title: string;
    creator: string;
    description: string;
    iconName?: string;
  },
  fallbackTitle: string
): Promise<CvImportResult> {
  const videoEntry =
    findEntry(
      scoped,
      VIDEO_NAMES.map((n) => n.toLowerCase())
    ) ?? scoped.find((e) => /^dub_video\./i.test(e.name));

  const backingEntry =
    findEntry(
      scoped,
      BACKING_NAMES.map((n) => n.toLowerCase())
    ) ?? scoped.find((e) => /^_backing_track\./i.test(e.name));

  const iconEntry =
    (meta.iconName
      ? scoped.find(
          (e) => e.name.toLowerCase() === meta.iconName!.toLowerCase()
        )
      : undefined) ?? findEntry(scoped, ["icon.png", "icon.jpg", "icon.jpeg"]);

  const audioEntries = scoped
    .filter((e) => isClipAudio(e.name))
    .sort((a, b) => compareClipNames(stem(a.name), stem(b.name)));

  type Draft = {
    entry: ZipEntry;
    speaker: string;
    text: string;
    startMs: number;
    durationMs: number;
    imageBlob?: Blob;
  };

  const drafts: Draft[] = [];

  for (const entry of audioEntries) {
    const baseStem = stem(entry.name);
    const metaEntry =
      findByStem(scoped, baseStem, META_EXT) ??
      scoped.find(
        (e) =>
          META_EXT.test(e.name) &&
          stem(e.name).toLowerCase() === baseStem.toLowerCase()
      );

    let speaker = speakerFromFilename(entry.name);
    let text = "";
    let startMs = 0;

    if (metaEntry) {
      const data = readConfigData(await metaEntry.blob.text());
      if (typeof data.caption === "string") text = data.caption;
      const chars = data.dub_characters;
      if (Array.isArray(chars) && chars[0]) speaker = String(chars[0]);
      const stamps = data.dub_timestamps;
      if (Array.isArray(stamps) && stamps.length > 0) {
        startMs = Math.round(Number(stamps[0]) * 1000);
      }
    }

    if (!text) text = textFromFilename(entry.name);

    const imageEntry = findByStem(scoped, baseStem, IMAGE_EXT);
    const durationMs = await getAudioDurationMs(entry.blob);

    drafts.push({
      entry,
      speaker,
      text,
      startMs,
      durationMs,
      imageBlob: imageEntry?.blob,
    });
  }

  drafts.sort(
    (a, b) =>
      a.startMs - b.startMs ||
      compareClipNames(stem(a.entry.name), stem(b.entry.name))
  );

  const clips: CvImportClip[] = drafts.map((d, i) => {
    const next = drafts[i + 1];
    const endMs = next
      ? Math.max(d.startMs + 400, next.startMs - 50)
      : d.startMs + d.durationMs;

    return {
      id: newClipId("clip"),
      speaker: d.speaker,
      text: d.text,
      startMs: d.startMs,
      endMs: Math.max(d.startMs + 400, endMs),
      audioBlob: d.entry.blob,
      audioFile: blobToFile(
        d.entry.blob,
        d.entry.name,
        mimeForExt(d.entry.name, "audio/mpeg")
      ),
      imageBlob: d.imageBlob,
    };
  });

  const videoName = videoEntry?.name ?? "dub_video.ogv";
  const ogvVideo = videoName.toLowerCase().endsWith(".ogv");

  return {
    kind: "dub",
    title: meta.title || fallbackTitle,
    creator: meta.creator,
    description: meta.description,
    videoFile: videoEntry
      ? blobToFile(
          videoEntry.blob,
          videoName,
          mimeForExt(videoName, "video/ogg")
        )
      : null,
    backingFile: backingEntry
      ? blobToFile(
          backingEntry.blob,
          backingEntry.name,
          mimeForExt(backingEntry.name, "audio/mpeg")
        )
      : null,
    thumbBlob: iconEntry?.blob ?? drafts[0]?.imageBlob ?? null,
    clips,
    ogvVideo,
  };
}

async function parseCvVoicePack(
  scoped: ZipEntry[],
  meta: {
    title: string;
    creator: string;
    description: string;
    iconName?: string;
  },
  fallbackTitle: string
): Promise<CvImportResult> {
  const iconEntry =
    (meta.iconName
      ? scoped.find(
          (e) => e.name.toLowerCase() === meta.iconName!.toLowerCase()
        )
      : undefined) ?? findEntry(scoped, ["icon.png", "icon.jpg"]);

  const audioEntries = scoped
    .filter((e) => isClipAudio(e.name))
    .sort((a, b) => compareClipNames(stem(a.name), stem(b.name)));

  let cursorMs = 0;
  const clips: CvImportClip[] = [];

  for (const entry of audioEntries) {
    const baseStem = stem(entry.name);
    const metaEntry = findByStem(scoped, baseStem, META_EXT);
    const imageEntry = findByStem(scoped, baseStem, IMAGE_EXT);

    let speaker = speakerFromFilename(entry.name);
    let text = textFromFilename(entry.name);

    if (metaEntry) {
      const data = readConfigData(await metaEntry.blob.text());
      if (typeof data.caption === "string" && data.caption.trim()) {
        text = data.caption;
      }
      const chars = data.dub_characters;
      if (Array.isArray(chars) && chars[0]) speaker = String(chars[0]);
    }

    const durationMs = await getAudioDurationMs(entry.blob);
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    cursorMs = endMs + 300;

    clips.push({
      id: newClipId("clip"),
      speaker,
      text,
      startMs,
      endMs,
      audioBlob: entry.blob,
      audioFile: blobToFile(
        entry.blob,
        entry.name,
        mimeForExt(entry.name, "audio/wav")
      ),
      imageBlob: imageEntry?.blob,
    });
  }

  return {
    kind: "voice",
    title: meta.title || fallbackTitle,
    creator: meta.creator,
    description: meta.description,
    videoFile: null,
    backingFile: null,
    thumbBlob: iconEntry?.blob ?? clips[0]?.imageBlob ?? null,
    clips,
    ogvVideo: false,
  };
}

/**
 * Import a Choicer Voicer or Imitation Star pack ZIP for the dub pack maker.
 */
export async function importCvPackZip(file: File): Promise<CvImportResult> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new Error("Please choose a .zip pack file.");
  }

  const entries = await loadZipEntries(file);
  if (!entries.length) throw new Error("That ZIP file is empty.");

  const root = findPackRootDir(entries);
  const scoped = entriesInRoot(entries, root);
  const fallbackTitle =
    (root ? basename(root) : file.name).replace(/\.zip$/i, "") ||
    "Imported pack";

  const packJsonEntry = scoped.find((e) => e.name === "pack.json");
  if (packJsonEntry) {
    const packJson = JSON.parse(await packJsonEntry.blob.text()) as PackJson;
    return parseImitationPack(scoped, packJson, fallbackTitle);
  }

  const meta = await readPackInfo(scoped);
  const hasDubVideo = scoped.some(
    (e) =>
      VIDEO_NAMES.includes(e.name.toLowerCase()) ||
      /^dub_video\./i.test(e.name)
  );

  if (hasDubVideo) {
    return parseCvDubPack(scoped, meta, fallbackTitle);
  }

  const audioCount = scoped.filter((e) => isClipAudio(e.name)).length;
  if (audioCount === 0) {
    throw new Error(
      "Could not find dub_video.ogv or voice clips in this ZIP. Is it a Choicer Voicer pack?"
    );
  }

  return parseCvVoicePack(scoped, meta, fallbackTitle);
}

/** Build a short silent WebM placeholder for voice-only cloud publish. */
export async function createPlaceholderVideoBlob(
  width = 640,
  height = 360
): Promise<Blob> {
  if (typeof document === "undefined") {
    return new Blob([], { type: "video/webm" });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, width, height);
  }

  const stream = canvas.captureStream(1);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";

  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: mime.split(";")[0] }));
    };
    rec.onerror = () => reject(new Error("Could not create placeholder video"));
    rec.start();
    setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, 500);
  });
}
