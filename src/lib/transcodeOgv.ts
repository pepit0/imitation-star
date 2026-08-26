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
let serverLocalDirectLarge = false;
let serverDirectMaxBytes = SERVER_DIRECT_MAX_BYTES;
let serverMaxBytes = SERVER_MAX_BYTES;

/** Thrown when the editor should play the source OGV locally (no MP4 proxy). */
export class UseOgvPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UseOgvPreviewError";
  }
}

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
      localDirectLarge?: boolean;
    };
    serverFfmpegAvailable = Boolean(data.available);
    serverStorageConvert = Boolean(data.storageConvert);
    serverLocalDirectLarge = Boolean(data.localDirectLarge);
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
    const text = await res.text();
    const data = JSON.parse(text) as { error?: string };
    if (data.error) detail = data.error;
  } catch {
    /* ignore */
  }
  return detail;
}

/** POST FormData with real upload progress (fetch has none). */
function postFormWithUploadProgress(
  url: string,
  form: FormData,
  options: {
    signal?: AbortSignal;
    onUploadProgress?: (pct: number) => void;
  }
): Promise<Response> {
  const { signal, onUploadProgress } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "blob";

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Transcode aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      onUploadProgress?.(Math.max(0, Math.min(100, pct)));
    };

    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      const headers = new Headers();
      const contentType = xhr.getResponseHeader("Content-Type");
      if (contentType) headers.set("Content-Type", contentType);
      const encoder = xhr.getResponseHeader("X-Preview-Encoder");
      if (encoder) headers.set("X-Preview-Encoder", encoder);
      resolve(
        new Response(xhr.response, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers,
        })
      );
    };

    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Network error while uploading OGV for conversion."));
    };

    xhr.onabort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Transcode aborted", "AbortError"));
    };

    xhr.send(form);
  });
}

async function transcodeViaDirectUpload(
  input: Blob,
  inputName: string,
  options: TranscodeOgvOptions
): Promise<Blob> {
  const { onProgress, signal } = options;
  const mb = (input.size / (1024 * 1024)).toFixed(0);
  const large = input.size > 40 * 1024 * 1024;

  onProgress?.(
    2,
    large
      ? `Uploading ${mb} MB OGV…`
      : "Uploading OGV for conversion…"
  );

  const form = new FormData();
  // Reuse the original File when possible — wrapping a 120+ MB Blob copies RAM.
  form.append(
    "file",
    input instanceof File
      ? input
      : new File([input], inputName || "dub_video.ogv", {
          type: input.type || "video/ogg",
        })
  );

  let encodePulse: ReturnType<typeof setInterval> | null = null;
  let encodePct = 48;

  try {
    const res = await postFormWithUploadProgress(
      "/api/packs/convert-ogv",
      form,
      {
        signal,
        onUploadProgress: (uploadPct) => {
          // Upload = 2% → 45% of overall bar
          const mapped = 2 + Math.round((uploadPct / 100) * 43);
          onProgress?.(
            mapped,
            uploadPct < 100
              ? `Uploading ${mb} MB OGV… ${uploadPct}%`
              : "Upload complete — encoding fast preview…"
          );
          if (uploadPct >= 100 && !encodePulse) {
            encodePct = 48;
            encodePulse = setInterval(() => {
              encodePct = Math.min(92, encodePct + 1);
              onProgress?.(
                encodePct,
                "Encoding 640p preview (this is the slow part)…"
              );
            }, 1200);
          }
        },
      }
    );

    if (!res.ok) throw new Error(await parseError(res));

    onProgress?.(94, "Downloading MP4 preview…");
    return await res.blob();
  } finally {
    if (encodePulse) clearInterval(encodePulse);
  }
}

/**
 * Large OGV path: upload to Supabase Storage → server converts from storage.
 * Bypasses Vercel’s ~100 MB request body limit (needed for ~120 MB packs).
 * Works with signed upload (service role) or public ogv-convert/ policy.
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
    signedUrl?: string;
    token?: string;
    mode?: "signed" | "public";
  };

  if (!prepared.storagePath) {
    throw new Error("Server did not return a storage path for large OGV convert.");
  }

  const mb = (input.size / (1024 * 1024)).toFixed(0);
  onProgress?.(8, `Uploading ${mb} MB OGV to storage…`);

  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const contentType = input.type || "video/ogg";

  if (prepared.mode === "signed" && prepared.token) {
    const { error: uploadError } = await supabase.storage
      .from(DUB_PACKS_BUCKET)
      .uploadToSignedUrl(prepared.storagePath, prepared.token, input, {
        contentType,
        upsert: false,
      });
    if (uploadError) {
      throw new Error(
        `Could not upload OGV to storage: ${uploadError.message}`
      );
    }
  } else {
    const { error: uploadError } = await supabase.storage
      .from(DUB_PACKS_BUCKET)
      .upload(prepared.storagePath, input, {
        contentType,
        upsert: false,
      });
    if (uploadError) {
      throw new Error(
        `Could not upload OGV to storage: ${uploadError.message}. If this persists, check dub-packs size limit (≥250 MB) and video/ogg mime types.`
      );
    }
  }

  if (signal?.aborted) {
    void supabase.storage
      .from(DUB_PACKS_BUCKET)
      .remove([prepared.storagePath])
      .catch(() => undefined);
    throw new DOMException("Transcode aborted", "AbortError");
  }

  onProgress?.(45, "Converting OGV on server…");

  let encodePulse: ReturnType<typeof setInterval> | null = null;
  let encodePct = 48;
  encodePulse = setInterval(() => {
    encodePct = Math.min(90, encodePct + 1);
    onProgress?.(encodePct, "Encoding 640p preview on server…");
  }, 1500);

  try {
    const convertRes = await fetch("/api/packs/convert-ogv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath: prepared.storagePath }),
      signal,
    });

    if (!convertRes.ok) throw new Error(await parseError(convertRes));

    onProgress?.(95, "Downloading MP4 preview…");
    return await convertRes.blob();
  } finally {
    if (encodePulse) clearInterval(encodePulse);
    // Server also deletes; client best-effort cleanup for orphans.
    void supabase.storage
      .from(DUB_PACKS_BUCKET)
      .remove([prepared.storagePath])
      .catch(() => undefined);
  }
}

async function transcodeViaServer(
  input: Blob,
  inputName: string,
  options: TranscodeOgvOptions
): Promise<Blob> {
  // Production (Vercel) cannot accept ~120 MB POST bodies. Shipping that OGV to
  // Storage just for a local pack-maker preview fights "edit locally until publish".
  // Use the in-browser OGV player instead; localhost still converts directly.
  if (input.size > serverDirectMaxBytes && !serverLocalDirectLarge) {
    throw new UseOgvPreviewError(
      `This OGV is ${(input.size / (1024 * 1024)).toFixed(0)} MB — using the local OGV player for editing (no upload until you publish).`
    );
  }

  if (input.size > serverDirectMaxBytes) {
    if (!serverStorageConvert) {
      throw new UseOgvPreviewError(
        `This OGV is ${(input.size / (1024 * 1024)).toFixed(0)} MB — using the local OGV player for editing.`
      );
    }
    return transcodeViaStorage(input, options);
  }

  try {
    return await transcodeViaDirectUpload(input, inputName, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (
      serverStorageConvert &&
      serverLocalDirectLarge &&
      /use storage|413|too large|over \d+ MB|Entity Too Large|Payload/i.test(
        message
      )
    ) {
      return transcodeViaStorage(input, options);
    }
    if (/use storage|413|too large|over \d+ MB|Entity Too Large|Payload/i.test(message)) {
      throw new UseOgvPreviewError(
        "File is too large for a fast MP4 preview here — using the local OGV player for editing."
      );
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
      "fps=24,scale=640:-2:flags=fast_bilinear",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "32",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-ac",
      "1",
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
 * Localhost: direct POST up to ~250 MB (no Vercel body cap).
 * Vercel: small direct POST; large (e.g. 120 MB) via Supabase signed upload → FFmpeg.
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

  // Always probe first so maxDirectBytes reflects localhost vs Vercel.
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
    throw new UseOgvPreviewError(
      `This OGV is ${(input.size / (1024 * 1024)).toFixed(0)} MB and server FFmpeg is unavailable — using the local OGV player for editing.`
    );
  }

  try {
    await saveBlob(cacheKey, blob);
  } catch {
    // Large MP4 previews can exceed IndexedDB quotas — still return the blob.
  }
  onProgress?.(100, "MP4 preview ready");
  return blob;
}
