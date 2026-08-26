import {
  createReadStream,
  createWriteStream,
  promises as fs,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { DUB_PACKS_BUCKET } from "@/lib/cloudPacks";
import {
  resolveFfmpegPath,
  runFfmpegVersion,
  runPreviewEncode,
  getPreviewEncoder,
} from "@/lib/ffmpegPreviewEncode";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Direct multipart POST body limit on Vercel (function request body ~100 MB).
 * Larger files use Supabase Storage upload + convert-by-path.
 * Localhost has no Vercel body cap — allow up to MAX_STORAGE_BYTES directly.
 */
export const MAX_DIRECT_BYTES = 80 * 1024 * 1024;

/** Absolute ceiling for OGV convert (covers ~120–250 MB CV packs). */
export const MAX_STORAGE_BYTES = 250 * 1024 * 1024;

/** True when running on Vercel (stricter request body limits). */
function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

/** Max size accepted as a direct multipart upload on this host. */
function maxDirectUploadBytes(): number {
  return isVercelRuntime() ? MAX_DIRECT_BYTES : MAX_STORAGE_BYTES;
}

const CONVERT_PREFIX = "ogv-convert/";

function isSafeConvertPath(storagePath: string): boolean {
  return (
    storagePath.startsWith(CONVERT_PREFIX) &&
    !storagePath.includes("..") &&
    /^ogv-convert\/[0-9a-f-]{36}\.ogv$/i.test(storagePath)
  );
}

function publicObjectUrl(storagePath: string): string {
  const base = getSupabaseUrl().replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${DUB_PACKS_BUCKET}/${storagePath}`;
}

async function writeBlobToFile(blob: Blob, destPath: string): Promise<void> {
  const nodeReadable = Readable.fromWeb(
    blob.stream() as import("node:stream/web").ReadableStream
  );
  await pipeline(nodeReadable, createWriteStream(destPath));
}

/** Stream a remote OGV to disk — avoids holding ~120 MB twice in RAM on Hobby. */
async function downloadStoragePathToFile(
  storagePath: string,
  destPath: string
): Promise<number> {
  const admin = createAdminClient();
  if (admin) {
    const { data: blob, error: dlError } = await admin.storage
      .from(DUB_PACKS_BUCKET)
      .download(storagePath);
    if (dlError || !blob) {
      throw new Error(dlError?.message ?? "Could not download uploaded OGV.");
    }
    await writeBlobToFile(blob, destPath);
    return blob.size;
  }

  const res = await fetch(publicObjectUrl(storagePath));
  if (!res.ok || !res.body) {
    throw new Error(
      `Could not download uploaded OGV (${res.status}). Check that the file was uploaded to storage.`
    );
  }
  const nodeReadable = Readable.fromWeb(
    res.body as import("node:stream/web").ReadableStream
  );
  await pipeline(nodeReadable, createWriteStream(destPath));
  const st = await fs.stat(destPath);
  return st.size;
}

async function removeStoragePath(storagePath: string): Promise<void> {
  const admin = createAdminClient();
  if (admin) {
    await admin.storage
      .from(DUB_PACKS_BUCKET)
      .remove([storagePath])
      .catch(() => undefined);
    return;
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(getSupabaseUrl(), getSupabasePublishableKey());
    await client.storage.from(DUB_PACKS_BUCKET).remove([storagePath]);
  } catch {
    /* ignore — client also cleans up */
  }
}

function streamFileResponse(
  filePath: string,
  onFinished: () => void,
  extraHeaders?: Record<string, string>
): NextResponse {
  const nodeStream = createReadStream(filePath);
  nodeStream.on("close", onFinished);
  nodeStream.on("error", onFinished);

  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": 'inline; filename="preview.mp4"',
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function convertPathToMp4Response(
  ffmpegPath: string,
  inputPath: string,
  tmpDir: string
): Promise<NextResponse> {
  const outputPath = path.join(tmpDir, "output.mp4");
  const encoder = await runPreviewEncode(ffmpegPath, inputPath, outputPath);

  const cleanup = () => {
    void fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  };

  return streamFileResponse(outputPath, cleanup, {
    "X-Preview-Encoder": encoder,
  });
}

/** Probe: FFmpeg + whether large (storage) converts are available. */
export async function GET() {
  const maxDirectBytes = maxDirectUploadBytes();
  const storageConvert = hasSupabaseConfig();
  try {
    const ffmpegPath = await resolveFfmpegPath();
    await runFfmpegVersion(ffmpegPath);
    const encoder = await getPreviewEncoder(ffmpegPath);
    return NextResponse.json({
      available: true,
      maxDirectBytes,
      maxBytes: MAX_STORAGE_BYTES,
      storageConvert,
      signedUpload: hasAdminClient(),
      localDirectLarge: !isVercelRuntime(),
      previewEncoder: encoder,
      previewProfile: "640p24-fast",
    });
  } catch {
    return NextResponse.json({
      available: false,
      maxDirectBytes,
      maxBytes: MAX_STORAGE_BYTES,
      storageConvert: false,
      signedUpload: false,
      localDirectLarge: !isVercelRuntime(),
    });
  }
}

/**
 * Convert Choicer Voicer OGV → MP4.
 *
 * Modes:
 * 1) multipart `file` — direct upload (≤ ~80 MB on Vercel, ≤ ~250 MB on localhost)
 * 2) JSON `{ action: "prepare-upload" }` — path (+ optional signed URL) for large OGV
 * 3) JSON `{ storagePath }` — convert a previously uploaded temp OGV
 */
export async function POST(request: Request) {
  let ffmpegPath: string;
  try {
    ffmpegPath = await resolveFfmpegPath();
  } catch (e) {
    const message = e instanceof Error ? e.message : "FFmpeg unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  // —— JSON modes (large-file storage path) ——
  if (contentType.includes("application/json")) {
    let body: { action?: string; storagePath?: string };
    try {
      body = (await request.json()) as { action?: string; storagePath?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (body.action === "prepare-upload") {
      if (!hasSupabaseConfig()) {
        return NextResponse.json(
          {
            error:
              "Large OGV convert needs Supabase storage. Configure NEXT_PUBLIC_SUPABASE_URL.",
          },
          { status: 503 }
        );
      }

      const storagePath = `${CONVERT_PREFIX}${crypto.randomUUID()}.ogv`;
      const admin = createAdminClient();
      if (admin) {
        const { data, error } = await admin.storage
          .from(DUB_PACKS_BUCKET)
          .createSignedUploadUrl(storagePath);

        if (error || !data) {
          return NextResponse.json(
            {
              error:
                error?.message ??
                "Could not create upload URL. Check dub-packs storage policies.",
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          storagePath,
          signedUrl: data.signedUrl,
          token: data.token,
          mode: "signed",
          maxBytes: MAX_STORAGE_BYTES,
        });
      }

      // No service role: client uploads with the anon key into ogv-convert/.
      return NextResponse.json({
        storagePath,
        mode: "public",
        maxBytes: MAX_STORAGE_BYTES,
      });
    }

    const storagePath = body.storagePath?.trim() ?? "";
    if (!isSafeConvertPath(storagePath)) {
      return NextResponse.json(
        { error: "Invalid or missing storagePath." },
        { status: 400 }
      );
    }

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imitation-ogv-"));
    const inputPath = path.join(tmp, "input.ogv");

    try {
      const size = await downloadStoragePathToFile(storagePath, inputPath);

      if (size > MAX_STORAGE_BYTES) {
        await fs
          .rm(tmp, { recursive: true, force: true })
          .catch(() => undefined);
        void removeStoragePath(storagePath);
        return NextResponse.json(
          {
            error: `Video is ${(size / (1024 * 1024)).toFixed(0)} MB — max ${Math.floor(MAX_STORAGE_BYTES / (1024 * 1024))} MB.`,
          },
          { status: 413 }
        );
      }

      const response = await convertPathToMp4Response(
        ffmpegPath,
        inputPath,
        tmp
      );

      void removeStoragePath(storagePath);

      return response;
    } catch (e) {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
      void removeStoragePath(storagePath);
      const message =
        e instanceof Error ? e.message : "Could not convert OGV to MP4.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // —— Direct multipart ——
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing OGV file." }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty OGV file." }, { status: 400 });
  }
  const directLimit = maxDirectUploadBytes();
  if (file.size > directLimit) {
    return NextResponse.json(
      {
        error: `Video is ${(file.size / (1024 * 1024)).toFixed(0)} MB — max direct upload is ${Math.floor(directLimit / (1024 * 1024))} MB.${
          isVercelRuntime()
            ? " Use storage convert for larger files, or convert to MP4 offline."
            : ""
        }`,
        useStorage: isVercelRuntime(),
      },
      { status: 413 }
    );
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imitation-ogv-"));
  const inputPath = path.join(tmp, "input.ogv");

  try {
    await writeBlobToFile(file, inputPath);
    return await convertPathToMp4Response(ffmpegPath, inputPath, tmp);
  } catch (e) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    const message =
      e instanceof Error ? e.message : "Could not convert OGV to MP4.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
