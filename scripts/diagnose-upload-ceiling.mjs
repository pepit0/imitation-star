/**
 * Binary-search Supabase Storage max upload size for dub-packs / ogv-convert.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://www.imitation.site";
const SUPABASE_URL = "https://uhjijvhxdzwzrouzjbho.supabase.co";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function key() {
  const envText = await fs.readFile(path.join(root, ".env.local"), "utf8");
  return (
    envText.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/) ||
    envText.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)/)
  )[1]
    .trim()
    .replace(/^["']|["']$/g, "");
}

async function trySize(anon, mb) {
  const prep = await (
    await fetch(`${BASE}/api/packs/convert-ogv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare-upload" }),
    })
  ).json();
  const size = Math.floor(mb * 1024 * 1024);
  const body = Buffer.alloc(size, 2);
  const up = await fetch(
    `${SUPABASE_URL}/storage/v1/object/dub-packs/${prep.storagePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anon}`,
        apikey: anon,
        "Content-Type": "video/ogg",
        "x-upsert": "false",
      },
      body,
    }
  );
  const text = await up.text();
  if (up.ok) {
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/dub-packs/${prep.storagePath}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${anon}`, apikey: anon },
      }
    ).catch(() => undefined);
  }
  return { mb, status: up.status, text: text.slice(0, 160) };
}

async function main() {
  const anon = await key();
  for (const mb of [5, 20, 40, 50, 55, 60, 70, 80]) {
    const r = await trySize(anon, mb);
    console.log(`${r.mb} MB → ${r.status} ${r.text}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
