import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", (err) => {
      reject(
        new Error(
          err.message.includes("ENOENT")
            ? "FFmpeg is not installed on this machine."
            : err.message
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
    });
  });
}

/** Quick probe so the client can prefer native FFmpeg when available. */
export async function GET() {
  try {
    await runFfmpeg(["-version"]);
    return NextResponse.json({ available: true });
  } catch {
    return NextResponse.json({ available: false });
  }
}

/**
 * Convert a Choicer Voicer OGV (Theora) dub video into a browser-friendly MP4 proxy.
 * Uses system FFmpeg (same approach used offline for the built-in packs).
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing OGV file." }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty OGV file." }, { status: 400 });
  }
  // ~200 MB ceiling keeps local convert workable without filling the disk.
  if (file.size > 200 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Video is larger than 200 MB — convert offline to MP4 first." },
      { status: 413 }
    );
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imitation-ogv-"));
  const inputPath = path.join(tmp, "input.ogv");
  const outputPath = path.join(tmp, "output.mp4");

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, bytes);

    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
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
      outputPath,
    ]);

    const out = await fs.readFile(outputPath);
    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'inline; filename="preview.mp4"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not convert OGV to MP4.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
