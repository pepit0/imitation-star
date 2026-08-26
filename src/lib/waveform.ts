/** Extract peak heights (0–100) for waveform UI from an audio/video blob. */

const decodeCache = new WeakMap<Blob, Promise<AudioBuffer>>();

async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  let pending = decodeCache.get(blob);
  if (!pending) {
    pending = (async () => {
      const ctx = new AudioContext();
      try {
        const buf = await blob.arrayBuffer();
        return await ctx.decodeAudioData(buf.slice(0));
      } finally {
        await ctx.close();
      }
    })();
    decodeCache.set(blob, pending);
  }
  return pending;
}

export async function extractWaveformPeaks(
  blob: Blob,
  options: {
    startMs?: number;
    endMs?: number;
    barCount?: number;
  } = {}
): Promise<number[]> {
  const barCount = options.barCount ?? 48;
  try {
    const audio = await decodeBlob(blob);
    const sampleRate = audio.sampleRate;
    const channel = audio.getChannelData(0);
    const startSample = Math.max(
      0,
      Math.floor(((options.startMs ?? 0) / 1000) * sampleRate)
    );
    const endSample = Math.min(
      channel.length,
      Math.floor(((options.endMs ?? audio.duration * 1000) / 1000) * sampleRate)
    );
    const length = Math.max(1, endSample - startSample);
    const block = Math.max(1, Math.floor(length / barCount));
    const raw: number[] = [];

    for (let i = 0; i < barCount; i++) {
      const from = startSample + i * block;
      const to = Math.min(endSample, from + block);
      let max = 0;
      for (let j = from; j < to; j++) {
        const v = Math.abs(channel[j] ?? 0);
        if (v > max) max = v;
      }
      raw.push(max);
    }

    const peakMax = raw.reduce((m, v) => (v > m ? v : m), 0);
    if (peakMax <= 0) {
      return Array.from({ length: barCount }, () => 6);
    }

    // Normalize so the loudest bar hits ~100 — quiet CV/vocals stems stay readable.
    return raw.map((v) =>
      Math.max(6, Math.min(100, Math.round((v / peakMax) * 100)))
    );
  } catch {
    return Array.from({ length: barCount }, (_, i) => 20 + ((i * 17) % 50));
  }
}

export async function extractWaveformPeaksFromUrl(
  url: string,
  options: {
    startMs?: number;
    endMs?: number;
    barCount?: number;
  } = {}
): Promise<number[]> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return extractWaveformPeaks(blob, options);
  } catch {
    const barCount = options.barCount ?? 48;
    return Array.from({ length: barCount }, (_, i) => 20 + ((i * 17) % 50));
  }
}
