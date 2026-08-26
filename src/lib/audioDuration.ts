/** Measure audio duration in milliseconds via Web Audio decode. */

export async function getAudioDurationMs(blob: Blob): Promise<number> {
  const ctx = new AudioContext();
  try {
    const buf = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    return Math.max(1, Math.round((decoded.duration || 0) * 1000));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
