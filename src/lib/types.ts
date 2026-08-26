export interface DubLine {
  id: string;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  /** Per-line vocal slice for RecordingStudio Replay */
  referenceAudioUrl?: string;
}

export interface DubPack {
  id: string;
  title: string;
  description: string;
  creator: string;
  clipCount: number;
  tags: string[];
  popular?: boolean;
  nsfw?: boolean;
  playCount: number;
  createdAt: string;
  thumbnailColor: string;
  thumbnailUrl: string;
  lines: DubLine[];
  videoUrl?: string;
  /**
   * CV-style `_backing_track`: music/SFX with dialogue removed.
   * Played under user takes; video audio is muted during final mix.
   */
  backingTrackUrl?: string;
  /** Full vocals stem (Demucs) for waveform / slicing */
  vocalsStemUrl?: string;
  /** Built-in sample, local IndexedDB, or community cloud pack */
  source?: "builtin" | "user" | "cloud";
  /** Set for cloud packs (and mirrored on published local packs) */
  ownerId?: string;
}

export type GameMode = "single" | "multiplayer" | "packs" | "upload";

export type GamePhase =
  | "splash"
  | "menu"
  | "pack-select"
  | "scene-preview"
  | "recording"
  | "line-review"
  | "final-preview"
  | "complete"
  | "collab-setup"
  | "collab-sent";

export interface RecordedLine {
  lineId: string;
  blob: Blob;
  durationMs: number;
  score?: LineScore;
}

export interface LineScore {
  timing: number;
  energy: number;
  overall: number;
}

export interface GameSession {
  packId: string;
  mode: GameMode;
  currentLineIndex: number;
  recordings: RecordedLine[];
  players?: string[];
}

export type SortOption = "newest" | "most-played";
