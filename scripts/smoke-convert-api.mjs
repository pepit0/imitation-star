/**
 * Hit local convert-ogv API with a tiny Theora OGV (pack-maker production path).
 * Usage: node scripts/smoke-convert-api.mjs [baseUrl]
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";

const base = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

async function resolveFfmpeg() {
  const candidates = [
    ffmpegStatic,
    path.join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(root, "node_modules", "ffmpeg-static", "ffmpeg"),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* next */
    }
  }
  throw new Error("ffmpeg not found");
}

async function main() {
  const ffmpeg = await resolveFfmpeg();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imitation-api-"));
  const ogvPath = path.join(tmp, "clip.ogv");

  const gen = await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x240:rate=24:duration=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:v",
    "libtheora",
    "-q:v",
    "5",
    "-c:a",
    "libvorbis",
    "-q:a",
    "3",
    "-shortest",
    "-y",
    ogvPath,
  ]);
  if (gen.code !== 0) {
    throw new Error(`OGV generate failed: ${gen.stderr}`);
  }

  const probe = await fetch(`${base}/api/packs/convert-ogv`);
  if (!probe.ok) throw new Error(`GET convert-ogv failed: ${probe.status}`);
  const info = await probe.json();
  console.log("✓ GET convert-ogv:", info);
  if (!info.available) {
    throw new Error("Server reports FFmpeg unavailable");
  }

  const bytes = await fs.readFile(ogvPath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: "video/ogg" }),
    "clip.ogv"
  );

  const res = await fetch(`${base}/api/packs/convert-ogv`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST convert-ogv ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  const encoder = res.headers.get("x-preview-encoder") || "(none)";
  const mp4 = Buffer.from(await res.arrayBuffer());
  if (!ct.includes("video/mp4")) {
    throw new Error(`Expected video/mp4, got ${ct}`);
  }
  if (mp4.length < 500) throw new Error(`MP4 too small (${mp4.length})`);
  // ISO BMFF 'ftyp' box
  const ftyp = mp4.subarray(4, 8).toString("ascii");
  if (ftyp !== "ftyp") {
    throw new Error(`Not a valid MP4 (box=${ftyp})`);
  }

  console.log(
    `✓ POST convert-ogv → MP4 ${mp4.length} bytes, encoder=${encoder}`
  );
  await fs.rm(tmp, { recursive: true, force: true });
  console.log("\nConvert API smoke passed — pack maker can load OGV previews.");
}

main().catch((err) => {
  console.error("\nAPI SMOKE FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
