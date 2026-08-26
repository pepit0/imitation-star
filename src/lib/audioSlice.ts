/** Slice a region from an audio blob (WAV output). */

export async function sliceAudioBlob(
  source: Blob,
  startMs: number,
  endMs: number
): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const arrayBuf = await source.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    const sampleRate = decoded.sampleRate;
    const startSample = Math.max(
      0,
      Math.floor((startMs / 1000) * sampleRate)
    );
    const endSample = Math.min(
      decoded.length,
      Math.ceil((endMs / 1000) * sampleRate)
    );
    const length = Math.max(1, endSample - startSample);
    const sliced = ctx.createBuffer(
      decoded.numberOfChannels,
      length,
      sampleRate
    );
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const src = decoded.getChannelData(ch).subarray(startSample, endSample);
      sliced.copyToChannel(src, ch);
    }
    return encodeWav(sliced);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
