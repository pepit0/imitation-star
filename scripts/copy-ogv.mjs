import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "node_modules", "ogv", "dist");
const destDir = path.join(root, "public", "ogv");

const files = [
  "ogv.js",
  "ogv-support.js",
  "ogv-demuxer-ogg-wasm.js",
  "ogv-demuxer-ogg-wasm.wasm",
  "ogv-decoder-video-theora-wasm.js",
  "ogv-decoder-video-theora-wasm.wasm",
  "ogv-decoder-audio-vorbis-wasm.js",
  "ogv-decoder-audio-vorbis-wasm.wasm",
  "ogv-worker-video.js",
  "ogv-worker-audio.js",
];

if (!fs.existsSync(srcDir)) {
  console.warn("[copy-ogv] ogv package not installed, skipping");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log(`[copy-ogv] Copied ${files.length} files to public/ogv`);
