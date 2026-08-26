/**
 * Verify TUS resumable upload clears the ~50 MB standard-upload ceiling.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as tus from "tus-js-client";

const BASE = "https://www.imitation.site";
const SUPABASE_URL = "https://uhjijvhxdzwzrouzjbho.supabase.co";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const envText = await fs.readFile(path.join(root, ".env.local"), "utf8");
  const key = (
    envText.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/) ||
    envText.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)/)
  )[1]
    .trim()
    .replace(/^["']|["']$/g, "");

  const prep = await (
    await fetch(`${BASE}/api/packs/convert-ogv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare-upload" }),
    })
  ).json();
  console.log("prep", prep);

  const size = 90 * 1024 * 1024;
  const bytes = Buffer.alloc(size, 3);
  console.log("TUS uploading", size, "bytes…");
  const t0 = Date.now();

  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(bytes, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        authorization: `Bearer ${key}`,
        apikey: key,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: "dub-packs",
        objectName: prep.storagePath,
        contentType: "video/ogg",
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: (u, t) => {
        if (u === t || u % (12 * 1024 * 1024) < 6 * 1024 * 1024) {
          console.log(`  progress ${Math.round((u / t) * 100)}%`);
        }
      },
      onSuccess: () => resolve(undefined),
    });
    upload.start();
  });

  console.log("TUS upload OK in", Date.now() - t0, "ms");

  await fetch(`${SUPABASE_URL}/storage/v1/object/dub-packs/${prep.storagePath}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  console.log("cleaned up");
}

main().catch((e) => {
  console.error("TUS FAIL:", e);
  process.exit(1);
});
