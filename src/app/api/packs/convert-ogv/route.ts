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

async function writeBlobToFile(blob: Blob, destPath: string): Promise<void> {
  const nodeReadable = Readable.fromWeb(
    blob.stream() as import("node:stream/web").ReadableStream
  );
  await pipeline(nodeReadable, createWriteStream(destPath));
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
  // Skip duration probe — an extra FFmpeg pass isn't worth it for progress alone.
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
  try {
    const ffmpegPath = await resolveFfmpegPath();
    await runFfmpegVersion(ffmpegPath);
    const encoder = await getPreviewEncoder(ffmpegPath);
    return NextResponse.json({
      available: true,
      maxDirectBytes,
      maxBytes: MAX_STORAGE_BYTES,
      storageConvert: hasAdminClient(),
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
      localDirectLarge: !isVercelRuntime(),
    });
  }
}

/**
 * Convert Choicer Voicer OGV → MP4.
 *
 * Modes:
 * 1) multipart `file` — direct upload (≤ ~80 MB on Vercel, ≤ ~250 MB on localhost)
 * 2) JSON `{ action: "prepare-upload" }` — signed URL for large OGV (Vercel)
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
      const admin = createAdminClient();
      if (!admin) {
        return NextResponse.json(
          {
            error:
              "Large OGV convert needs SUPABASE_SERVICE_ROLE_KEY on the server. Add it in Vercel env, or convert to MP4 offline.",
          },
          { status: 503 }
        );
      }

      const storagePath = `${CONVERT_PREFIX}${crypto.randomUUID()}.ogv`;
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

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "Large OGV convert needs SUPABASE_SERVICE_ROLE_KEY on the server.",
        },
        { status: 503 }
      );
    }

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imitation-ogv-"));
    const inputPath = path.join(tmp, "input.ogv");

    try {
      const { data: blob, error: dlError } = await admin.storage
        .from(DUB_PACKS_BUCKET)
        .download(storagePath);

      if (dlError || !blob) {
        return NextResponse.json(
          { error: dlError?.message ?? "Could not download uploaded OGV." },
          { status: 404 }
        );
      }

      if (blob.size > MAX_STORAGE_BYTES) {
        return NextResponse.json(
          {
            error: `Video is ${(blob.size / (1024 * 1024)).toFixed(0)} MB — max ${Math.floor(MAX_STORAGE_BYTES / (1024 * 1024))} MB.`,
          },
          { status: 413 }
        );
      }

      await writeBlobToFile(blob, inputPath);

      const response = await convertPathToMp4Response(
        ffmpegPath,
        inputPath,
        tmp
      );

      void admin.storage
        .from(DUB_PACKS_BUCKET)
        .remove([storagePath])
        .catch(() => undefined);

      return response;
    } catch (e) {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
      void admin.storage
        .from(DUB_PACKS_BUCKET)
        .remove([storagePath])
        .catch(() => undefined);
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
