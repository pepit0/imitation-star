import { spawn } from "node:child_process";
import { createReadStream, constants as fsConstants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import ffmpegStatic from "ffmpeg-static";
import { NextResponse } from "next/server";
import { DUB_PACKS_BUCKET } from "@/lib/cloudPacks";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Direct multipart POST body limit (Vercel function request body ~100 MB).
 * Larger files use Supabase Storage upload + convert-by-path.
 */
export const MAX_DIRECT_BYTES = 80 * 1024 * 1024;

/** Absolute ceiling for OGV convert via storage (covers ~120–200 MB CV packs). */
export const MAX_STORAGE_BYTES = 250 * 1024 * 1024;

const CONVERT_PREFIX = "ogv-convert/";

const FFMPEG_FILE_ARGS = [
  "-hide_banner",
  "-loglevel",
  "error",
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
] as const;

function isSafeConvertPath(storagePath: string): boolean {
  return (
    storagePath.startsWith(CONVERT_PREFIX) &&
    !storagePath.includes("..") &&
    /^ogv-convert\/[0-9a-f-]{36}\.ogv$/i.test(storagePath)
  );
}

async function resolveFfmpegPath(): Promise<string> {
  const candidates = [
    ffmpegStatic,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate, fsConstants.F_OK);
      return candidate;
    } catch {
      /* try next */
    }
  }

  throw new Error(
    "FFmpeg is not available on this server. Replace OGV with MP4 or use the built-in OGV player preview."
  );
}

function runFfmpegVersion(ffmpegPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-version"], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg probe failed with code ${code}`));
    });
  });
}

function runFfmpegToFile(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-i", inputPath, ...FFMPEG_FILE_ARGS, outputPath],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
    });
  });
}

function streamFileResponse(
  filePath: string,
  onFinished: () => void
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
    },
  });
}

async function convertPathToMp4Response(
  ffmpegPath: string,
  inputPath: string,
  tmpDir: string
): Promise<NextResponse> {
  const outputPath = path.join(tmpDir, "output.mp4");
  await runFfmpegToFile(ffmpegPath, inputPath, outputPath);

  const cleanup = () => {
    void fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  };

  return streamFileResponse(outputPath, cleanup);
}

/** Probe: FFmpeg + whether large (storage) converts are available. */
export async function GET() {
  try {
    const ffmpegPath = await resolveFfmpegPath();
    await runFfmpegVersion(ffmpegPath);
    return NextResponse.json({
      available: true,
      maxDirectBytes: MAX_DIRECT_BYTES,
      maxBytes: MAX_STORAGE_BYTES,
      storageConvert: hasAdminClient(),
    });
  } catch {
    return NextResponse.json({
      available: false,
      maxDirectBytes: MAX_DIRECT_BYTES,
      maxBytes: MAX_STORAGE_BYTES,
      storageConvert: false,
    });
  }
}

/**
 * Convert Choicer Voicer OGV → MP4.
 *
 * Modes:
 * 1) multipart `file` — direct upload (≤ ~80 MB)
 * 2) JSON `{ action: "prepare-upload" }` — signed URL for large OGV
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

      const bytes = Buffer.from(await blob.arrayBuffer());
      await fs.writeFile(inputPath, bytes);

      const response = await convertPathToMp4Response(
        ffmpegPath,
        inputPath,
        tmp
      );

      // Best-effort: remove temp OGV from storage after convert starts streaming.
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

  // —— Direct multipart (smaller files) ——
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing OGV file." }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty OGV file." }, { status: 400 });
  }
  if (file.size > MAX_DIRECT_BYTES) {
    return NextResponse.json(
      {
        error: `Video is ${(file.size / (1024 * 1024)).toFixed(0)} MB — use storage convert for files over ${Math.floor(MAX_DIRECT_BYTES / (1024 * 1024))} MB.`,
        useStorage: true,
      },
      { status: 413 }
    );
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imitation-ogv-"));
  const inputPath = path.join(tmp, "input.ogv");

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, bytes);
    return await convertPathToMp4Response(ffmpegPath, inputPath, tmp);
  } catch (e) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    const message =
      e instanceof Error ? e.message : "Could not convert OGV to MP4.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
