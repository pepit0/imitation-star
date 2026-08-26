export type PackJobStatus =
  | "queued"
  | "separating"
  | "transcribing"
  | "succeeded"
  | "failed";

export interface WhisperSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface PackJob {
  id: string;
  status: PackJobStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  /** Replicate prediction id for Demucs */
  demucsPredictionId?: string;
  vocalsUrl?: string;
  backingUrl?: string;
  durationMs?: number;
  segments?: WhisperSegment[];
  /** Original filename for debugging */
  sourceName?: string;
  /** Run Whisper after Demucs */
  wantTranscribe?: boolean;
}

const globalStore = globalThis as typeof globalThis & {
  __imitationStarJobs?: Map<string, PackJob>;
};

function store(): Map<string, PackJob> {
  if (!globalStore.__imitationStarJobs) {
    globalStore.__imitationStarJobs = new Map();
  }
  return globalStore.__imitationStarJobs;
}

export function createJob(partial?: Partial<PackJob>): PackJob {
  const id = `job-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const now = Date.now();
  const job: PackJob = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
  store().set(id, job);
  return job;
}

export function getJob(id: string): PackJob | undefined {
  return store().get(id);
}

export function updateJob(id: string, patch: Partial<PackJob>): PackJob | undefined {
  const job = store().get(id);
  if (!job) return undefined;
  const next = { ...job, ...patch, updatedAt: Date.now() };
  store().set(id, next);
  return next;
}

/** Drop jobs older than 2 hours to avoid unbounded memory. */
export function pruneOldJobs(): void {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of store()) {
    if (job.createdAt < cutoff) store().delete(id);
  }
}
