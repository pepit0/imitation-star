/**
 * Diagnose production large-OGV preview path.
 * 1) Confirm API policy for large files
 * 2) Try public Storage upload sizes (the usual failure point)
 * 3) Optionally hit convert after a small upload
 *
 * Usage:
 *   node scripts/diagnose-prod-ogv.mjs
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";

const BASE = process.env.PROD_URL || "https://www.imitation.site";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://uhjijvhxdzwzrouzjbho.supabase.co";
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

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

async function makeOgv(ffmpeg, dest, seconds) {
  const r = await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=640x360:rate=24:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${seconds}`,
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
    dest,
  ]);
  if (r.code !== 0) throw new Error(r.stderr || "ogv gen failed");
  const st = await fs.stat(dest);
  return st.size;
}

async function prepareUpload() {
  const res = await fetch(`${BASE}/api/packs/convert-ogv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepare-upload" }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`prepare ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function uploadPublic(storagePath, bytes, contentType) {
  // Load env from .env.local if present
  let key = ANON;
  if (!key) {
    try {
      const envText = await fs.readFile(path.join(root, ".env.local"), "utf8");
      const m =
        envText.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/) ||
        envText.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)/);
      key = m?.[1]?.trim().replace(/^"|"$/g, "") || "";
    } catch {
      /* ignore */
    }
  }
  if (!key) throw new Error("No anon/publishable key for storage upload test");

  const url = `${SUPABASE_URL}/storage/v1/object/dub-packs/${storagePath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: bytes,
  });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 500) };
}

async function convert(storagePath) {
  const res = await fetch(`${BASE}/api/packs/convert-ogv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath }),
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, detail: text.slice(0, 400) };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ftyp = buf.subarray(4, 8).toString("ascii");
  return {
    ok: true,
    status: res.status,
    bytes: buf.length,
    ftyp,
    ct,
    encoder: res.headers.get("x-preview-encoder"),
  };
}

async function main() {
  console.log("Base:", BASE);
  const probe = await (await fetch(`${BASE}/api/packs/convert-ogv`)).json();
  console.log("GET convert-ogv:", probe);

  const ffmpeg = await resolveFfmpeg();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "imitation-diag-"));

  // ~1s small OGV
  const smallPath = path.join(tmp, "small.ogv");
  const smallSize = await makeOgv(ffmpeg, smallPath, 1);
  console.log(`\nSmall OGV: ${(smallSize / 1024).toFixed(1)} KB`);

  const prep1 = await prepareUpload();
  console.log("prepare:", prep1);
  const smallBytes = await fs.readFile(smallPath);
  for (const ct of ["video/ogg", "application/ogg", "video/ogv"]) {
    const prep = await prepareUpload();
    const up = await uploadPublic(prep.storagePath, smallBytes, ct);
    console.log(`upload contentType=${ct} → ${up.status} ${up.text}`);
    if (up.status === 200 || up.status === 201) {
      const conv = await convert(prep.storagePath);
      console.log("convert small:", conv);
      break;
    }
  }

  // Longer clip aiming for several MB (not full 120MB — still exercises storage path)
  const medPath = path.join(tmp, "med.ogv");
  console.log("\nGenerating ~30s OGV (multi-MB)…");
  const medSize = await makeOgv(ffmpeg, medPath, 30);
  console.log(`Medium OGV: ${(medSize / (1024 * 1024)).toFixed(2)} MB`);
  const prepMed = await prepareUpload();
  const medBytes = await fs.readFile(medPath);
  const upMed = await uploadPublic(prepMed.storagePath, medBytes, "video/ogg");
  console.log(`upload medium → ${upMed.status} ${upMed.text}`);
  if (upMed.status === 200 || upMed.status === 201) {
    console.log("Converting medium on production (may take a bit)…");
    const convMed = await convert(prepMed.storagePath);
    console.log("convert medium:", convMed);
  }

  await fs.rm(tmp, { recursive: true, force: true });
}

main().catch((e) => {
  console.error("DIAG FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
