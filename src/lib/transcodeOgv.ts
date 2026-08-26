import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { DUB_PACKS_BUCKET } from "@/lib/cloudPacks";
import { loadBlob, saveBlob } from "./packStore";

/** Matches convert-ogv direct multipart limit. */
export const SERVER_DIRECT_MAX_BYTES = 80 * 1024 * 1024;

/** Matches convert-ogv storage convert ceiling (~120–200 MB packs). */
export const SERVER_MAX_BYTES = 250 * 1024 * 1024;

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let serverFfmpegAvailable: boolean | null = null;
let serverStorageConvert = false;
let serverDirectMaxBytes = SERVER_DIRECT_MAX_BYTES;
let serverMaxBytes = SERVER_MAX_BYTES;

async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
        wasmURL: await toBlobURL(
          "/ffmpeg/ffmpeg-core.wasm",
          "application/wasm"
        ),
      });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
  }

  return ffmpegLoadPromise;
}

/** Stable cache key for a source OGV blob. */
export function ogvProxyCacheKey(file: Blob, name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "video";
  return `ogv-proxy:${base}:${file.size}`;
}

export async function loadCachedOgvProxy(key: string): Promise<Blob | null> {
  return loadBlob(key);
}

export async function checkServerOgvConvertAvailable(): Promise<boolean> {
  if (serverFfmpegAvailable !== null) return serverFfmpegAvailable;
  try {
    const res = await fetch("/api/packs/convert-ogv", { method: "GET" });
    if (!res.ok) {
      serverFfmpegAvailable = false;
      return false;
    }
    const data = (await res.json()) as {
      available?: boolean;
      maxBytes?: number;
      maxDirectBytes?: number;
      storageConvert?: boolean;
    };
    serverFfmpegAvailable = Boolean(data.available);
    serverStorageConvert = Boolean(data.storageConvert);
    if (typeof data.maxBytes === "number" && data.maxBytes > 0) {
      serverMaxBytes = data.maxBytes;
    }
    if (typeof data.maxDirectBytes === "number" && data.maxDirectBytes > 0) {
      serverDirectMaxBytes = data.maxDirectBytes;
    }
    return serverFfmpegAvailable;
  } catch {
    serverFfmpegAvailable = false;
    return false;
  }
}

export function getServerOgvMaxBytes(): number {
  return serverMaxBytes;
}

export type TranscodeOgvOptions = {
  onProgress?: (pct: number, label: string) => void;
  signal?: AbortSignal;
};

async function parseError(res: Response): Promise<string> {
  let detail = `Server convert failed (${res.status})`;
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) detail = data.error;
  } catch {
    /* ignore */
  }
  return detail;
}

async function transcodeViaDirectUpload(
  input: Blob,
  inputName: string,
  options: TranscodeOgvOptions
): Promise<Blob> {
  const { onProgress, signal } = options;
  onProgress?.(5, "Uploading OGV for conversion…");

  const form = new FormData();
  form.append(
    "file",
    new File([input], inputName || "dub_video.ogv", {
      type: input.type || "video/ogg",
    })
  );

  const res = await fetch("/api/packs/convert-ogv", {
    method: "POST",
    body: form,
    signal,
  });

  if (!res.ok) throw new Error(await parseError(res));

  onProgress?.(95, "Downloading MP4 preview…");
  return await res.blob();
}

/**
 * Large OGV path: signed upload to Supabase → server converts from storage.
 * Bypasses Vercel’s ~100 MB request body limit (needed for ~120 MB packs).
 */
async function transcodeViaStorage(
  input: Blob,
  options: TranscodeOgvOptions
): Promise<Blob> {
  const { onProgress, signal } = options;

  if (input.size > serverMaxBytes) {
    throw new Error(
      `This OGV is ${(input.size / (1024 * 1024)).toFixed(0)} MB — max is ${Math.floor(serverMaxBytes / (1024 * 1024))} MB. Convert to MP4 offline or use the OGV preview player.`
    );
  }

  onProgress?.(3, "Preparing large-file upload…");

  const prepareRes = await fetch("/api/packs/convert-ogv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepare-upload" }),
    signal,
  });

  if (!prepareRes.ok) throw new Error(await parseError(prepareRes));

  const prepared = (await prepareRes.json()) as {
    storagePath: string;
    signedUrl: string;
    token?: string;
  };

  if (!prepared.storagePath || !prepared.signedUrl) {
    throw new Error("Server did not return an upload URL for large OGV convert.");
  }

  onProgress?.(
    8,
    `Uploading ${(input.size / (1024 * 1024)).toFixed(0)} MB OGV…`
  );

  if (!prepared.token) {
    throw new Error("Server did not return an upload token for large OGV convert.");
  }

  // Prefer Supabase helper (FormData + token query) over raw PUT.
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from(DUB_PACKS_BUCKET)
    .uploadToSignedUrl(prepared.storagePath, prepared.token, input, {
      contentType: input.type || "video/ogg",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `Could not upload OGV to storage: ${uploadError.message}. Check Supabase storage / service role.`
    );
  }

  if (signal?.aborted) {
    throw new DOMException("Transcode aborted", "AbortError");
  }

  onProgress?.(45, "Converting OGV on server…");

  const convertRes = await fetch("/api/packs/convert-ogv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath: prepared.storagePath }),
    signal,
  });

  if (!convertRes.ok) throw new Error(await parseError(convertRes));

  onProgress?.(95, "Downloading MP4 preview…");
  return await convertRes.blob();
}

async function transcodeViaServer(
  input: Blob,
  inputName: string,
  options: TranscodeOgvOptions
): Promise<Blob> {
  if (input.size > serverDirectMaxBytes) {
    if (!serverStorageConvert) {
      throw new Error(
        `This OGV is ${(input.size / (1024 * 1024)).toFixed(0)} MB. Large-file convert needs SUPABASE_SERVICE_ROLE_KEY on Vercel (then redeploy). Until then, use the OGV preview player or convert to MP4 offline.`
      );
    }
    return transcodeViaStorage(input, options);
  }

  try {
    return await transcodeViaDirectUpload(input, inputName, options);
  } catch (err) {
    // If direct upload is rejected as too large, retry via storage when available.
    const message = err instanceof Error ? err.message : "";
    if (serverStorageConvert && /use storage|413|too large|over \d+ MB/i.test(message)) {
      return transcodeViaStorage(input, options);
    }
    throw err;
  }
}

/**
 * Browser ffmpeg.wasm cannot decode OGV/Theora reliably — last resort only.
 */
async function transcodeViaWasm(
  input: Blob,
  options: TranscodeOgvOptions
): Promise<Blob> {
  const { onProgress, signal } = options;

  onProgress?.(0, "Loading browser converter…");
  const ffmpeg = await getFfmpeg();

  if (signal?.aborted) {
    throw new DOMException("Transcode aborted", "AbortError");
  }

  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
    onProgress?.(pct, `Converting OGV to MP4… ${pct}%`);
  };
  ffmpeg.on("progress", progressHandler);

  try {
    onProgress?.(2, "Reading OGV file…");
    await ffmpeg.writeFile("input.ogv", await fetchFile(input));

    if (signal?.aborted) {
      throw new DOMException("Transcode aborted", "AbortError");
    }

    onProgress?.(5, "Converting OGV to MP4…");
    await ffmpeg.exec([
      "-i",
      "input.ogv",
      "-vf",
      "scale=854:-2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      "-y",
      "output.mp4",
    ]);

    if (signal?.aborted) {
      throw new DOMException("Transcode aborted", "AbortError");
    }

    onProgress?.(98, "Finalizing MP4…");
    const data = await ffmpeg.readFile("output.mp4");
    const bytes =
      data instanceof Uint8Array
        ? data
        : new TextEncoder().encode(String(data));
    return new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", progressHandler);
    try {
      await ffmpeg.deleteFile("input.ogv");
      await ffmpeg.deleteFile("output.mp4");
    } catch {
      /* ignore */
    }
  }
}

const WASM_FALLBACK_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Convert CV OGV → MP4 preview.
 * Small: direct POST. Large (e.g. 120 MB): Supabase signed upload → server FFmpeg.
 */
export async function transcodeOgvToMp4(
  input: Blob,
  inputName: string,
  options: TranscodeOgvOptions = {}
): Promise<Blob> {
  const { onProgress, signal } = options;
  const cacheKey = ogvProxyCacheKey(input, inputName);

  const cached = await loadCachedOgvProxy(cacheKey);
  if (cached) {
    onProgress?.(100, "Using cached MP4 preview");
    return cached;
  }

  if (signal?.aborted) {
    throw new DOMException("Transcode aborted", "AbortError");
  }

  const serverOk = await checkServerOgvConvertAvailable();
  let blob: Blob;

  if (serverOk) {
    blob = await transcodeViaServer(input, inputName, options);
  } else if (input.size <= WASM_FALLBACK_MAX_BYTES) {
    onProgress?.(1, "Server FFmpeg unavailable — trying browser converter…");
    try {
      blob = await transcodeViaWasm(input, options);
    } catch {
      throw new Error(
        "OGV conversion is unavailable on this deploy. Preview will use the OGV player — or replace the video with MP4."
      );
    }
  } else {
    throw new Error(
      `This OGV is ${(input.size / (1024 * 1024)).toFixed(0)} MB and server FFmpeg is unavailable. Preview will use the OGV player — or convert to MP4 offline.`
    );
  }

  await saveBlob(cacheKey, blob);
  onProgress?.(100, "MP4 preview ready");
  return blob;
}
