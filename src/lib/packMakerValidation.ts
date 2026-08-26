/** Pure helpers for dub pack maker validation (easy to unit/E2E assert). */

export type CaptionClip = {
  id: string;
  text: string;
  startMs?: number;
};

export function normalizeClipText(text: unknown): string {
  return String(text ?? "").trim();
}

export function clipsMissingCaptions<T extends CaptionClip>(clips: T[]): T[] {
  return clips.filter((c) => !normalizeClipText(c.text));
}

export function formatMissingCaptionsError(
  missing: CaptionClip[],
  allClips: CaptionClip[]
): string {
  if (missing.length === 0) return "";
  const sorted = [...allClips].sort(
    (a, b) => (a.startMs ?? 0) - (b.startMs ?? 0)
  );
  const indexes = missing.map((m) => {
    const i = sorted.findIndex((c) => c.id === m.id);
    return i >= 0 ? i + 1 : "?";
  });
  if (missing.length === 1) {
    return `Clip ${indexes[0]} still needs a caption. Fill it in, then continue.`;
  }
  return `${missing.length} clips still need captions (e.g. #${indexes
    .slice(0, 3)
    .join(", #")}). Fill them in, then continue.`;
}

export function canContinueToReview(clips: CaptionClip[]): {
  ok: boolean;
  error: string | null;
  firstMissingId: string | null;
} {
  if (clips.length === 0) {
    return {
      ok: false,
      error: "Add at least one clip before continuing.",
      firstMissingId: null,
    };
  }
  const missing = clipsMissingCaptions(clips);
  if (missing.length > 0) {
    return {
      ok: false,
      error: formatMissingCaptionsError(missing, clips),
      firstMissingId: missing[0]?.id ?? null,
    };
  }
  return { ok: true, error: null, firstMissingId: null };
}
