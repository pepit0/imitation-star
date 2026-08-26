import { PALETTE } from "./colors";
import type { DubLine, LineScore } from "./types";

export function scoreLine(
  line: DubLine,
  recordedDurationMs: number,
  energyLevel: number
): LineScore {
  const expectedDuration = line.endMs - line.startMs;
  const timingDiff = Math.abs(recordedDurationMs - expectedDuration);
  const timingRatio = timingDiff / expectedDuration;

  let timing: number;
  if (timingRatio <= 0.15) timing = 95;
  else if (timingRatio <= 0.3) timing = 80;
  else if (timingRatio <= 0.5) timing = 65;
  else if (timingRatio <= 0.75) timing = 45;
  else timing = 25;

  const energy = Math.min(100, Math.max(20, energyLevel + Math.random() * 15));

  const overall = Math.round(timing * 0.55 + energy * 0.45);

  return { timing, energy: Math.round(energy), overall };
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return "PERFECT!";
  if (score >= 75) return "GREAT!";
  if (score >= 60) return "GOOD";
  if (score >= 40) return "OKAY";
  return "TRY AGAIN";
}

export function getScoreColor(score: number): string {
  if (score >= 90) return PALETTE.coral;
  if (score >= 75) return PALETTE.pollen;
  if (score >= 60) return PALETTE.green;
  if (score >= 40) return PALETTE.blue;
  return PALETTE.grape;
}
