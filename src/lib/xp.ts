/** Per-user XP / ranks (Supabase profiles). Guests stay at 0 until signed in. */

import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";

/** Finish a singleplayer dub (Dub Complete screen). */
export const XP_PACK_COMPLETE = 80;
/** First publish of a community dub pack. */
export const XP_PACK_PUBLISH = 200;
/** Each participant when a multiplayer collab is posted to the forum. */
export const XP_COLLAB_PUBLISH = 150;
/** Author receives this when someone else stars their forum post. */
export const XP_STAR_RECEIVED = 15;

/** @deprecated use XP_PACK_COMPLETE */
export const XP_PER_PACK = XP_PACK_COMPLETE;

const LEGACY_XP_KEY = "imitation-star:xp";
const LEGACY_AWARDED_KEY = "imitation-star:xp-awarded";

export type XpState = {
  xp: number;
  packsCompleted: number;
};

export type RankDef = {
  level: number;
  title: string;
  minXp: number;
};

export type RankInfo = RankDef & {
  nextMinXp: number | null;
  /** 0–1 progress within current rank band */
  progress: number;
  /** e.g. "LVL 1 - ROOKIE DUBBER" */
  label: string;
};

/**
 * 24 ranks. Early levels come quickly; later ones need a mix of
 * completes, publishes, collabs, and stars.
 */
export const RANKS: RankDef[] = [
  { level: 1, title: "Rookie Dubber", minXp: 0 },
  { level: 2, title: "Fresh Mic", minXp: 80 },
  { level: 3, title: "Warm-Up Act", minXp: 180 },
  { level: 4, title: "Rising Voice", minXp: 300 },
  { level: 5, title: "Line Reader", minXp: 450 },
  { level: 6, title: "Take Taker", minXp: 620 },
  { level: 7, title: "Booth Buddy", minXp: 820 },
  { level: 8, title: "Stage Regular", minXp: 1050 },
  { level: 9, title: "Scene Stealer", minXp: 1320 },
  { level: 10, title: "Crowd Favorite", minXp: 1620 },
  { level: 11, title: "Sync Specialist", minXp: 1980 },
  { level: 12, title: "Dub Dynamo", minXp: 2400 },
  { level: 13, title: "Vocal Ace", minXp: 2900 },
  { level: 14, title: "Timing Titan", minXp: 3500 },
  { level: 15, title: "Headliner", minXp: 4200 },
  { level: 16, title: "Marquee Voice", minXp: 5000 },
  { level: 17, title: "Studio Legend", minXp: 6000 },
  { level: 18, title: "Soundboard Sage", minXp: 7200 },
  { level: 19, title: "Iconic Impression", minXp: 8600 },
  { level: 20, title: "Platinum Playback", minXp: 10200 },
  { level: 21, title: "Golden Reel", minXp: 12200 },
  { level: 22, title: "Mythic Mixer", minXp: 14600 },
  { level: 23, title: "Immortal Mic", minXp: 17500 },
  { level: 24, title: "Eternal Star", minXp: 21000 },
];

let cache: XpState = { xp: 0, packsCompleted: 0 };
let cacheUserId: string | null = null;

function emptyState(): XpState {
  return { xp: 0, packsCompleted: 0 };
}

function clearLegacyLocalXp(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_XP_KEY);
    localStorage.removeItem(LEGACY_AWARDED_KEY);
  } catch {
    /* private mode */
  }
}

function emitXpChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("imitation-star:xp"));
}

export function getCachedXp(): XpState {
  return { ...cache };
}

/** Synchronous snapshot for UI; prefer refreshXp() after auth changes. */
export function loadXp(): XpState {
  return getCachedXp();
}

export function setXpCache(state: XpState, userId: string | null): void {
  cache = {
    xp: Math.max(0, state.xp),
    packsCompleted: Math.max(0, state.packsCompleted),
  };
  cacheUserId = userId;
  emitXpChange();
}

export function clearXpCache(): void {
  cache = emptyState();
  cacheUserId = null;
  clearLegacyLocalXp();
  emitXpChange();
}

/** Load XP for the signed-in user from profiles. Guests → 0. */
export async function refreshXp(): Promise<XpState> {
  clearLegacyLocalXp();

  if (!hasSupabaseConfig() || typeof window === "undefined") {
    clearXpCache();
    return emptyState();
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    clearXpCache();
    return emptyState();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("xp, packs_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    setXpCache(emptyState(), user.id);
    return emptyState();
  }

  const next: XpState = {
    xp: Math.max(0, Number(data.xp) || 0),
    packsCompleted: Math.max(0, Number(data.packs_completed) || 0),
  };
  setXpCache(next, user.id);
  return next;
}

export function formatRankLabel(level: number, title: string): string {
  return `LVL ${level} - ${title.toUpperCase()}`;
}

export function getRank(xp: number): RankInfo {
  let current = RANKS[0]!;
  for (const rank of RANKS) {
    if (xp >= rank.minXp) current = rank;
  }
  const idx = RANKS.findIndex((r) => r.level === current.level);
  const next = RANKS[idx + 1] ?? null;
  const nextMinXp = next?.minXp ?? null;
  const span = next ? next.minXp - current.minXp : 1;
  const into = xp - current.minXp;
  const progress = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    ...current,
    nextMinXp,
    progress,
    label: formatRankLabel(current.level, current.title),
  };
}

async function awardSelfXp(input: {
  sessionKey: string;
  amount: number;
  countPack?: boolean;
}): Promise<XpState> {
  if (!hasSupabaseConfig() || typeof window === "undefined") {
    return getCachedXp();
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return emptyState();
  }

  const { data, error } = await supabase.rpc("award_xp", {
    p_session_key: input.sessionKey,
    p_amount: input.amount,
    p_count_pack: Boolean(input.countPack),
  });

  if (error) {
    console.warn("award_xp failed:", error.message);
    return refreshXp();
  }

  const row = data as {
    awarded?: boolean;
    xp?: number;
    packsCompleted?: number;
  };

  const next: XpState = {
    xp: Math.max(0, Number(row?.xp) || 0),
    packsCompleted: Math.max(0, Number(row?.packsCompleted) || 0),
  };
  setXpCache(next, user.id);
  return next;
}

/** Finish a singleplayer dub session (signed-in only). */
export async function awardPackComplete(sessionKey: string): Promise<XpState> {
  return awardSelfXp({
    sessionKey: `pack_complete:${sessionKey}`,
    amount: XP_PACK_COMPLETE,
    countPack: true,
  });
}

/** First-time community pack publish. */
export async function awardPackPublish(packId: string): Promise<XpState> {
  return awardSelfXp({
    sessionKey: `pack_publish:${packId}`,
    amount: XP_PACK_PUBLISH,
  });
}

/** Multiplayer forum publish — awards every participant server-side. */
export async function awardCollabPublish(collabId: string): Promise<void> {
  if (!hasSupabaseConfig() || typeof window === "undefined") return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.rpc("award_collab_publish_xp", {
    p_collab_id: collabId,
    p_amount: XP_COLLAB_PUBLISH,
  });

  if (error) {
    console.warn("award_collab_publish_xp failed:", error.message);
    return;
  }

  await refreshXp();
}

export { cacheUserId };
