/**
 * Test production storage upload at ~90MB (limit regression).
 * Does not need a valid OGV — only exercises Storage + size policy.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const bytes = Buffer.alloc(size, 1);
  console.log("uploading", size, "bytes…");
  const t0 = Date.now();
  const up = await fetch(
    `${SUPABASE_URL}/storage/v1/object/dub-packs/${prep.storagePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "video/ogg",
        "x-upsert": "false",
      },
      body: bytes,
    }
  );
  const text = await up.text();
  console.log("upload", up.status, `${Date.now() - t0}ms`, text.slice(0, 300));

  // cleanup
  await fetch(
    `${SUPABASE_URL}/storage/v1/object/dub-packs/${prep.storagePath}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    }
  ).catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
