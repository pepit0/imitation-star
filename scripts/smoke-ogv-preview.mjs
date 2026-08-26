/**
 * Smoke test: pack-maker OGV→MP4 preview encode (production settings).
 * Run: node scripts/smoke-ogv-preview.mjs
 */
import { spawn } from "node:child_process";
import { createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import ffmpegStatic from "ffmpeg-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const PREVIEW_ARGS = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-threads",
  "0",
  "-vf",
  "fps=24,scale=640:-2:flags=fast_bilinear",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-tune",
  "fastdecode",
  "-crf",
  "32",
  "-x264-params",
  "ref=1:bframes=0:me=dia:subme=0:trellis=0:weightp=0:aq-mode=0",
  "-c:a",
  "aac",
  "-b:a",
  "64k",
  "-ac",
  "1",
  "-ar",
  "32000",
  "-y",
];

function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stderr = "";
    let stdout = "";
    child.stderr?.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.stdout?.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

async function resolveFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    ffmpegStatic,
    path.join(root, "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* next */
    }
  }
  throw new Error("ffmpeg-static binary not found — Vercel convert would fail");
}

async function main() {
  const ffmpeg = await resolveFfmpeg();
  console.log("✓ ffmpeg binary:", ffmpeg);

  const ver = await run(ffmpeg, ["-version"]);
  if (ver.code !== 0) throw new Error("ffmpeg -version failed");
  console.log("✓ ffmpeg runs:", ver.stdout.split("\n")[0]);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imitation-smoke-"));
  const inputMp4 = path.join(tmp, "sample.mp4");
  const inputOgv = path.join(tmp, "sample.ogv");
  const outFromMp4 = path.join(tmp, "preview-from-mp4.mp4");
  const outFromOgv = path.join(tmp, "preview-from-ogv.mp4");

  // Synthetic 2s clip (stands in for pack video).
  const gen = await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=854x480:rate=30:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    inputMp4,
  ]);
  if (gen.code !== 0) {
    throw new Error(`Could not generate sample: ${gen.stderr}`);
  }
  console.log("✓ generated sample MP4");

  const enc1 = await run(ffmpeg, ["-i", inputMp4, ...PREVIEW_ARGS, outFromMp4]);
  if (enc1.code !== 0) {
    throw new Error(`Preview encode failed: ${enc1.stderr}`);
  }
  const st1 = await fs.stat(outFromMp4);
  if (st1.size < 1000) throw new Error("Preview MP4 too small");
  console.log(`✓ preview encode OK (${st1.size} bytes) — same profile as production`);

  // Prefer real Theora/OGV when the binary can encode it (CV packs).
  const ogvGen = await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputMp4,
    "-c:v",
    "libtheora",
    "-q:v",
    "7",
    "-c:a",
    "libvorbis",
    "-q:a",
    "4",
    "-y",
    inputOgv,
  ]);

  if (ogvGen.code === 0) {
    const enc2 = await run(ffmpeg, [
      "-i",
      inputOgv,
      ...PREVIEW_ARGS,
      outFromOgv,
    ]);
    if (enc2.code !== 0) {
      throw new Error(`OGV→MP4 preview failed: ${enc2.stderr}`);
    }
    const st2 = await fs.stat(outFromOgv);
    if (st2.size < 1000) throw new Error("OGV preview MP4 too small");
    console.log(`✓ OGV/Theora → MP4 preview OK (${st2.size} bytes)`);
  } else {
    console.log(
      "⚠ bundled ffmpeg lacks libtheora encode — skipping OGV generate (decode still OK on typical CV files; Vercel uses same binary for decode)"
    );
    // Confirm Theora decoder is present (what production needs for CV packs).
    const encoders = await run(ffmpeg, ["-hide_banner", "-decoders"]);
    const hasTheora = /theora/i.test(encoders.stdout + encoders.stderr);
    if (!hasTheora) {
      throw new Error("ffmpeg binary has no Theora decoder — OGV packs would fail on Vercel");
    }
    console.log("✓ Theora decoder present (OGV import decode path OK)");
  }

  // Simulate convert-ogv streaming write path (Blob → disk).
  const bytes = await fs.readFile(inputMp4);
  const blobPath = path.join(tmp, "from-blob.mp4");
  const nodeReadable = Readable.from(bytes);
  await pipeline(nodeReadable, createWriteStream(blobPath));
  const stBlob = await fs.stat(blobPath);
  if (stBlob.size !== bytes.length) throw new Error("blob write mismatch");
  console.log("✓ stream-to-disk write path OK");

  // Confirm vercel includeFiles target exists.
  const staticDir = path.join(root, "node_modules", "ffmpeg-static");
  await fs.access(staticDir);
  console.log("✓ node_modules/ffmpeg-static present (vercel.json includeFiles)");

  await fs.rm(tmp, { recursive: true, force: true });
  console.log("\nAll pack-maker preview smoke checks passed.");
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
