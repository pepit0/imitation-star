/** Client helpers for /api/packs/jobs */

export type PackJobPublic = {
  id: string;
  status:
    | "queued"
    | "separating"
    | "transcribing"
    | "succeeded"
    | "failed";
  error?: string;
  vocalsUrl?: string;
  backingUrl?: string;
  durationMs?: number;
  segments?: { startMs: number; endMs: number; text: string }[];
  sourceName?: string;
  updatedAt?: number;
  configured?: boolean;
};

export async function checkPackJobsConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/packs/jobs");
    if (!res.ok) return false;
    const json = (await res.json()) as { configured?: boolean };
    return Boolean(json.configured);
  } catch {
    return false;
  }
}

export async function startPackJob(
  file: File,
  opts?: { transcribe?: boolean }
): Promise<PackJobPublic> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.transcribe !== false) {
    form.append("transcribe", "true");
  }
  const res = await fetch("/api/packs/jobs", { method: "POST", body: form });
  const json = (await res.json()) as PackJobPublic & { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `Job start failed (${res.status})`);
  }
  return json;
}

export async function fetchPackJob(id: string): Promise<PackJobPublic> {
  const res = await fetch(`/api/packs/jobs/${id}`);
  const json = (await res.json()) as PackJobPublic & { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `Job poll failed (${res.status})`);
  }
  return json;
}

export async function pollPackJob(
  id: string,
  opts?: {
    intervalMs?: number;
    onStatus?: (job: PackJobPublic) => void;
    signal?: AbortSignal;
  }
): Promise<PackJobPublic> {
  const interval = opts?.intervalMs ?? 2500;
  for (;;) {
    if (opts?.signal?.aborted) {
      throw new Error("Separation cancelled");
    }
    const job = await fetchPackJob(id);
    opts?.onStatus?.(job);
    if (job.status === "succeeded" || job.status === "failed") {
      return job;
    }
    await sleep(interval, opts?.signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Separation cancelled"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("Separation cancelled"));
      },
      { once: true }
    );
  });
}

export async function fetchStemAsFile(
  url: string,
  filename: string
): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not download stem (${res.status})`);
  }
  const blob = await res.blob();
  const type = blob.type || "audio/wav";
  return new File([blob], filename, { type });
}
