import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const STAR_PATH =
  "M256 4 323.6 163 495.5 177.6 365.4 291.6 408.4 459.8 256 371 103.6 459.8 146.6 291.6 16.5 177.6 188.4 163Z";

function starLayerSvg({ transparent = false } = {}) {
  const background = transparent
    ? ""
    : '<rect width="512" height="512" fill="#FF595E"/>';
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${background}
  <path d="${STAR_PATH}" fill="#000" transform="translate(32 36)"/>
  <path d="${STAR_PATH}" fill="#FFCA3A" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
</svg>`);
}

const micPath = path.join(root, "public/images/logo-mic.png");

/** Match LogoMark mic inset (p-[22%] → mic fits in inner 56%). */
async function composeIcon(size, { transparent = false } = {}) {
  const base = await sharp(starLayerSvg({ transparent }))
    .resize(size, size)
    .png()
    .toBuffer();
  const micSize = Math.round(size * 0.56);
  const mic = await sharp(micPath)
    .resize(micSize, micSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(base)
    .composite([{ input: mic, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function write(rel, size, options = {}) {
  const buf = await composeIcon(size, options);
  const out = path.join(root, rel);
  await sharp(buf).png().toFile(out);
  console.log("Wrote", rel);
}

await write("mobile/assets/icon.png", 1024);
await write("mobile/assets/adaptive-icon.png", 1024);
await write("mobile/assets/splash-icon.png", 1024);
await write("mobile/assets/favicon.png", 48);
await write("public/icon-512.png", 512);
await write("public/icon-192.png", 192);
await write("public/email-icon.png", 512);
await write("public/favicon.png", 32);
await write("src/app/apple-icon.png", 180);

// Marketing / overlay use — not wired into the app or store builds.
await write("public/images/logo-mark-transparent.png", 1024, {
  transparent: true,
});
