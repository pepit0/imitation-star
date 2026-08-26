/** Local XP / rank for session HUD (Supabase later). */

const STORAGE_KEY = "imitation-star:xp";
const XP_PER_PACK = 120;

export type XpState = {
  xp: number;
  packsCompleted: number;
};

export type RankInfo = {
  title: string;
  minXp: number;
  nextMinXp: number | null;
  /** 0–1 progress within current rank band */
  progress: number;
};

const RANKS: { title: string; minXp: number }[] = [
  { title: "Rookie Dubber", minXp: 0 },
  { title: "Rising Voice", minXp: 120 },
  { title: "Stage Regular", minXp: 360 },
  { title: "Crowd Favorite", minXp: 720 },
  { title: "Headliner", minXp: 1200 },
];

function emptyState(): XpState {
  return { xp: 0, packsCompleted: 0 };
}

export function loadXp(): XpState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<XpState>;
    return {
      xp: Math.max(0, Number(parsed.xp) || 0),
      packsCompleted: Math.max(0, Number(parsed.packsCompleted) || 0),
    };
  } catch {
    return emptyState();
  }
}

export function saveXp(state: XpState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("imitation-star:xp"));
}

export function getRank(xp: number): RankInfo {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.minXp) current = rank;
  }
  const idx = RANKS.findIndex((r) => r.title === current.title);
  const next = RANKS[idx + 1] ?? null;
  const nextMinXp = next?.minXp ?? null;
  const span = next ? next.minXp - current.minXp : 1;
  const into = xp - current.minXp;
  const progress = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    title: current.title,
    minXp: current.minXp,
    nextMinXp,
    progress,
  };
}

/**
 * Award XP once per pack completion session.
 * `sessionKey` should be unique per finished run (e.g. packId + timestamp bucket).
 */
export function awardPackComplete(sessionKey: string): XpState {
  const awardedKey = "imitation-star:xp-awarded";
  let awarded: string[] = [];
  try {
    awarded = JSON.parse(localStorage.getItem(awardedKey) || "[]") as string[];
  } catch {
    awarded = [];
  }
  if (awarded.includes(sessionKey)) {
    return loadXp();
  }
  const next = loadXp();
  next.xp += XP_PER_PACK;
  next.packsCompleted += 1;
  saveXp(next);
  awarded = [...awarded.slice(-49), sessionKey];
  localStorage.setItem(awardedKey, JSON.stringify(awarded));
  return next;
}

export { XP_PER_PACK, RANKS };
