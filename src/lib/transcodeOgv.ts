import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { loadBlob, saveBlob } from "./packStore";

/** Browser wasm struggles above this; prefer native FFmpeg API instead. */
export const WASM_MAX_BYTES = 40 * 1024 * 1024;

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let serverFfmpegAvailable: boolean | null = null;

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
    const data = (await res.json()) as { available?: boolean };
    serverFfmpegAvailable = Boolean(data.available);
    return serverFfmpegAvailable;
  } catch {
    serverFfmpegAvailable = false;
    return false;
  }
}

export type TranscodeOgvOptions = {
  onProgress?: (pct: number, label: string) => void;
  signal?: AbortSignal;
};

async function transcodeViaServer(
  input: Blob,
  inputName: string,
  options: TranscodeOgvOptions
): Promise<Blob> {
  const { onProgress, signal } = options;
  onProgress?.(5, "Converting with system FFmpeg…");

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

  if (!res.ok) {
    let detail = `Server convert failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) detail = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  onProgress?.(95, "Downloading MP4 preview…");
  return await res.blob();
}

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
      /* ignore cleanup errors */
    }
  }
}

/**
 * Convert CV OGV dub video to a browser-friendly MP4 proxy.
 * Prefers system FFmpeg via API (same as built-in packs). Falls back to
 * ffmpeg.wasm only for smaller files.
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
  } else if (input.size > WASM_MAX_BYTES) {
    throw new Error(
      `This OGV is ${(input.size / (1024 * 1024)).toFixed(0)} MB — too large for in-browser conversion, and system FFmpeg is unavailable. Install FFmpeg or replace the video with an MP4.`
    );
  } else {
    blob = await transcodeViaWasm(input, options);
  }

  await saveBlob(cacheKey, blob);
  onProgress?.(100, "MP4 preview ready");
  return blob;
}
