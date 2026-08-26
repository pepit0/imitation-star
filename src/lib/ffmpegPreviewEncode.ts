import { spawn } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

/** Preview-only: lean settings so large CV OGVs convert faster. */
const PREVIEW_VF = "fps=24,scale=640:-2:flags=fast_bilinear";

type EncoderKind = "nvenc" | "amf" | "qsv" | "x264";

let cachedFfmpegPath: string | null = null;
let cachedEncoder: EncoderKind | null = null;
let encoderProbe: Promise<EncoderKind> | null = null;

function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(bin: string): Promise<string | null> {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(cmd, [bin], {
      windowsHide: true,
      timeout: 5000,
    });
    const first = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    return first && (await pathExists(first)) ? first : null;
  } catch {
    return null;
  }
}

/**
 * Prefer a full system FFmpeg on localhost (often has NVENC/AMF/QSV).
 * On Vercel, stick to the bundled static binary.
 */
export async function resolveFfmpegPath(): Promise<string> {
  if (cachedFfmpegPath) return cachedFfmpegPath;

  const candidates: string[] = [];
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) candidates.push(envPath);

  if (!isVercelRuntime()) {
    const fromPath = await findOnPath("ffmpeg");
    if (fromPath) candidates.push(fromPath);
  }

  if (ffmpegStatic) candidates.push(ffmpegStatic);
  candidates.push(
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe")
  );

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      cachedFfmpegPath = candidate;
      return candidate;
    }
  }

  throw new Error(
    "FFmpeg is not available on this server. Replace OGV with MP4 or use the built-in OGV player preview."
  );
}

function runProcess(
  ffmpegPath: string,
  args: string[],
  opts?: { timeoutMs?: number }
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    const timer =
      opts?.timeoutMs != null
        ? setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("FFmpeg probe timed out"));
          }, opts.timeoutMs)
        : null;
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
  });
}

export async function runFfmpegVersion(ffmpegPath: string): Promise<void> {
  const { code } = await runProcess(ffmpegPath, ["-version"], {
    timeoutMs: 8000,
  });
  if (code !== 0) throw new Error(`FFmpeg probe failed with code ${code}`);
}

async function listEncoderNames(ffmpegPath: string): Promise<Set<string>> {
  try {
    const { stdout } = await execFileAsync(
      ffmpegPath,
      ["-hide_banner", "-encoders"],
      { windowsHide: true, timeout: 10000, maxBuffer: 2 * 1024 * 1024 }
    );
    const names = new Set<string>();
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(/^\s*[V\.].\s+(\S+)/);
      if (m?.[1]) names.add(m[1]);
    }
    return names;
  } catch {
    return new Set();
  }
}

async function canUseEncoder(
  ffmpegPath: string,
  encoder: string,
  extraArgs: string[]
): Promise<boolean> {
  const { code } = await runProcess(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=64x64:d=0.2",
      "-c:v",
      encoder,
      ...extraArgs,
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: 12000 }
  );
  return code === 0;
}

async function probeBestEncoder(ffmpegPath: string): Promise<EncoderKind> {
  // Bundled ffmpeg-static is software-only; skip HW probe on Vercel.
  if (isVercelRuntime()) return "x264";

  const names = await listEncoderNames(ffmpegPath);

  if (
    names.has("h264_nvenc") &&
    (await canUseEncoder(ffmpegPath, "h264_nvenc", [
      "-preset",
      "p1",
      "-tune",
      "ll",
    ]))
  ) {
    return "nvenc";
  }
  if (
    names.has("h264_amf") &&
    (await canUseEncoder(ffmpegPath, "h264_amf", ["-quality", "speed"]))
  ) {
    return "amf";
  }
  if (
    names.has("h264_qsv") &&
    (await canUseEncoder(ffmpegPath, "h264_qsv", ["-preset", "veryfast"]))
  ) {
    return "qsv";
  }
  return "x264";
}

export async function getPreviewEncoder(
  ffmpegPath: string
): Promise<EncoderKind> {
  if (cachedEncoder) return cachedEncoder;
  if (!encoderProbe) {
    encoderProbe = probeBestEncoder(ffmpegPath)
      .then((kind) => {
        cachedEncoder = kind;
        return kind;
      })
      .catch(() => {
        cachedEncoder = "x264";
        return "x264" as const;
      });
  }
  return encoderProbe;
}

/** Output args after `-i <input>` (output path appended by caller). */
export function previewEncodeArgs(encoder: EncoderKind): string[] {
  const audio = ["-c:a", "aac", "-b:a", "64k", "-ac", "1", "-ar", "32000"];
  // No +faststart: saves a full remux pass; we download the whole blob before play.
  const commonTail = [...audio, "-y"];

  switch (encoder) {
    case "nvenc":
      return [
        "-hide_banner",
        "-loglevel",
        "error",
        "-vf",
        PREVIEW_VF,
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p1",
        "-tune",
        "ll",
        "-rc",
        "constqp",
        "-qp",
        "28",
        ...commonTail,
      ];
    case "amf":
      return [
        "-hide_banner",
        "-loglevel",
        "error",
        "-vf",
        PREVIEW_VF,
        "-c:v",
        "h264_amf",
        "-quality",
        "speed",
        "-rc",
        "cqp",
        "-qp_i",
        "28",
        "-qp_p",
        "28",
        ...commonTail,
      ];
    case "qsv":
      return [
        "-hide_banner",
        "-loglevel",
        "error",
        "-vf",
        PREVIEW_VF,
        "-c:v",
        "h264_qsv",
        "-preset",
        "veryfast",
        "-global_quality",
        "28",
        ...commonTail,
      ];
    default:
      return [
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "0",
        "-vf",
        PREVIEW_VF,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "fastdecode",
        "-crf",
        "32",
        "-x264-params",
        "ref=1:bframes=0:me=dia:subme=0:trellis=0:weightp=0:aq-mode=0",
        ...commonTail,
      ];
  }
}

export type FfmpegProgress = {
  /** 0–1 based on out_time vs duration when known */
  ratio: number;
  label: string;
};

/**
 * Encode input → output MP4 for editor preview.
 * Parses `-progress pipe:1` when onProgress is provided.
 */
export async function runPreviewEncode(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  opts?: {
    onProgress?: (p: FfmpegProgress) => void;
    signal?: AbortSignal;
    durationSec?: number;
  }
): Promise<EncoderKind> {
  const encoder = await getPreviewEncoder(ffmpegPath);
  const args = [
    "-i",
    inputPath,
    ...previewEncodeArgs(encoder),
    "-progress",
    "pipe:1",
    "-nostats",
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let stdoutBuf = "";
    let lastRatio = 0;

    const onAbort = () => {
      child.kill("SIGKILL");
      reject(Object.assign(new Error("Transcode aborted"), { name: "AbortError" }));
    };
    opts?.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString("utf8");
      const parts = stdoutBuf.split(/\r?\n/);
      stdoutBuf = parts.pop() ?? "";
      let outTimeUs: number | null = null;
      for (const line of parts) {
        if (line.startsWith("out_time_us=")) {
          const n = Number(line.slice("out_time_us=".length));
          if (Number.isFinite(n)) outTimeUs = n;
        } else if (line.startsWith("out_time_ms=")) {
          // Some builds use ms (actually microseconds historically named ms)
          const n = Number(line.slice("out_time_ms=".length));
          if (Number.isFinite(n) && outTimeUs == null) outTimeUs = n;
        }
      }
      if (outTimeUs != null && opts?.onProgress) {
        const sec = outTimeUs / 1_000_000;
        const dur = opts.durationSec;
        const ratio =
          dur && dur > 0
            ? Math.max(0, Math.min(0.99, sec / dur))
            : Math.max(lastRatio, Math.min(0.95, lastRatio + 0.01));
        lastRatio = ratio;
        opts.onProgress({
          ratio,
          label: `Encoding preview… ${Math.round(ratio * 100)}%`,
        });
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });

    child.on("error", (err) => {
      opts?.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      opts?.signal?.removeEventListener("abort", onAbort);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
    });
  });

  return encoder;
}

/** Probe media duration in seconds (best-effort). */
export async function probeDurationSec(
  ffmpegPath: string,
  inputPath: string
): Promise<number | undefined> {
  try {
    const { stderr } = await runProcess(
      ffmpegPath,
      ["-hide_banner", "-i", inputPath],
      { timeoutMs: 20000 }
    );
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return undefined;
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    const total = h * 3600 + min * 60 + sec;
    return Number.isFinite(total) && total > 0 ? total : undefined;
  } catch {
    return undefined;
  }
}
