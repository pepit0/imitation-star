import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const destDir = path.join(root, "public", "ffmpeg");

const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

if (!fs.existsSync(srcDir)) {
  console.warn("[copy-ffmpeg] @ffmpeg/core not installed, skipping");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log(`[copy-ffmpeg] Copied ${files.length} files to public/ffmpeg`);
