import { DUB_PACKS } from "@/lib/packs";
import { createClient } from "@/lib/supabase/server";

/**
 * Pack total shown on marketing UI / menu: published cloud packs + built-in samples.
 * Matches GameStage `allPacks.length` for a visitor with no local-only IndexedDB packs.
 */
export async function getPublicDubPackCount(): Promise<number> {
  const builtin = DUB_PACKS.length;
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("dub_packs")
      .select("*", { count: "exact", head: true });
    if (error) return builtin;
    return builtin + (count ?? 0);
  } catch {
    return builtin;
  }
}
