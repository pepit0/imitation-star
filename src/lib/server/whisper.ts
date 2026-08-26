import Replicate from "replicate";
import type { WhisperSegment } from "./jobStore";

function getClient(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is not set");
  }
  return new Replicate({ auth: token });
}

/**
 * Transcribe vocals stem.
 * Prefers OpenAI Whisper when OPENAI_API_KEY is set; otherwise Replicate.
 */
export async function transcribeVocals(
  audioUrl: string
): Promise<WhisperSegment[]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return transcribeWithOpenAI(audioUrl, openaiKey);
  }
  if (!process.env.REPLICATE_API_TOKEN) {
    return [];
  }
  return transcribeWithReplicate(audioUrl);
}

async function transcribeWithOpenAI(
  audioUrl: string,
  apiKey: string
): Promise<WhisperSegment[]> {
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error("Could not download vocals for Whisper");
  const blob = await res.blob();
  const form = new FormData();
  form.append("file", blob, "vocals.wav");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!tr.ok) {
    const text = await tr.text();
    throw new Error(`OpenAI Whisper failed: ${text.slice(0, 200)}`);
  }
  const json = (await tr.json()) as {
    segments?: { start: number; end: number; text: string }[];
  };
  return (json.segments ?? [])
    .map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: (s.text || "").trim(),
    }))
    .filter((s) => s.text && s.endMs > s.startMs);
}

async function transcribeWithReplicate(
  audioUrl: string
): Promise<WhisperSegment[]> {
  const replicate = getClient();
  try {
    const version =
      process.env.REPLICATE_WHISPER_VERSION ||
      "3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c";
    const model = (
      version.includes("/")
        ? version
        : `vaibhavs10/incredibly-fast-whisper:${version}`
    ) as `${string}/${string}`;
    const output = await replicate.run(model, {
      input: {
        audio: audioUrl,
        task: "transcribe",
        timestamp: "chunk",
      },
    });
    return parseWhisperOutput(output);
  } catch (err) {
    console.warn("Whisper failed; returning no segments", err);
    return [];
  }
}

function parseWhisperOutput(output: unknown): WhisperSegment[] {
  if (!output) return [];

  if (typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    if (Array.isArray(o.chunks)) {
      return o.chunks
        .map((chunk) => {
          const c = chunk as {
            text?: string;
            timestamp?: [number, number];
          };
          const [start, end] = c.timestamp ?? [0, 0];
          return {
            startMs: Math.round(Number(start) * 1000),
            endMs: Math.round(Number(end) * 1000),
            text: (c.text || "").trim(),
          };
        })
        .filter((s) => s.text && s.endMs > s.startMs);
    }
    if (Array.isArray(o.segments)) {
      return (o.segments as { start: number; end: number; text: string }[])
        .map((s) => ({
          startMs: Math.round(s.start * 1000),
          endMs: Math.round(s.end * 1000),
          text: (s.text || "").trim(),
        }))
        .filter((s) => s.text && s.endMs > s.startMs);
    }
  }
  return [];
}
