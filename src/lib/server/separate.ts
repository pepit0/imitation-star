import Replicate from "replicate";

/** Pinned Demucs v4 on Replicate (cjwbw/demucs). Override with REPLICATE_DEMUCS_VERSION. */
export const DEFAULT_DEMUCS_VERSION =
  "abf8fe28e407afa6d8e41e86a759caccc0af8e49c3c68016006b62cb0968441e";

export type StemResult = {
  vocalsUrl: string;
  backingUrl: string;
  predictionId?: string;
};

function getClient(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error(
      "REPLICATE_API_TOKEN is not set. Add it to .env.local to enable auto-separate."
    );
  }
  return new Replicate({ auth: token });
}

function versionRef(): string {
  const v = process.env.REPLICATE_DEMUCS_VERSION || DEFAULT_DEMUCS_VERSION;
  return v.includes(":") ? v : `cjwbw/demucs:${v}`;
}

function asUrl(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("http")) return value;
  if (value && typeof value === "object" && "url" in value) {
    const u = (value as { url?: unknown }).url;
    if (typeof u === "string") return u;
  }
  return null;
}

/** Normalize Demucs output into vocals + backing (no_vocals / other). */
export function parseDemucsOutput(output: unknown): {
  vocalsUrl: string;
  backingUrl: string;
} {
  if (!output || typeof output !== "object") {
    throw new Error("Unexpected Demucs output shape");
  }
  const o = output as Record<string, unknown>;

  const vocalsUrl =
    asUrl(o.vocals) ??
    asUrl(o.Vocals) ??
    (Array.isArray(output) ? asUrl(output[0]) : null);

  const backingUrl =
    asUrl(o.no_vocals) ??
    asUrl(o.noVocals) ??
    asUrl(o.other) ??
    asUrl(o.accompaniment) ??
    asUrl(o.instrumental) ??
    (Array.isArray(output) ? asUrl(output[1]) : null);

  if (!vocalsUrl || !backingUrl) {
    throw new Error(
      `Demucs did not return vocals+backing. Keys: ${Object.keys(o).join(", ")}`
    );
  }
  return { vocalsUrl, backingUrl };
}

/**
 * Run Demucs two-stem separation.
 * `audio` may be a public URL, data URI, or File/Blob/Buffer (SDK uploads it).
 */
export async function separateStems(audio: unknown): Promise<StemResult> {
  const replicate = getClient();
  const model = versionRef();

  const output = await replicate.run(model as `${string}/${string}`, {
    input: {
      audio,
      stem: "vocals",
      model_name: "htdemucs",
    },
  });

  const stems = parseDemucsOutput(output);
  return { ...stems };
}

/** Start async prediction; returns prediction id for polling. */
export async function startDemucsPrediction(
  audio: unknown
): Promise<{ predictionId: string }> {
  const replicate = getClient();
  const version =
    process.env.REPLICATE_DEMUCS_VERSION || DEFAULT_DEMUCS_VERSION;

  const prediction = await replicate.predictions.create({
    version,
    input: {
      audio,
      stem: "vocals",
      model_name: "htdemucs",
    },
  });

  return { predictionId: prediction.id };
}

export async function getDemucsPrediction(predictionId: string): Promise<{
  status: string;
  vocalsUrl?: string;
  backingUrl?: string;
  error?: string;
}> {
  const replicate = getClient();
  const prediction = await replicate.predictions.get(predictionId);
  const status = prediction.status;

  if (status === "succeeded") {
    const stems = parseDemucsOutput(prediction.output);
    return { status, ...stems };
  }
  if (status === "failed" || status === "canceled") {
    return {
      status,
      error:
        typeof prediction.error === "string"
          ? prediction.error
          : "Demucs prediction failed",
    };
  }
  return { status };
}

export function isReplicateConfigured(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}
