export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime = 0;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private timeDomain = new Uint8Array(0);

  async requestPermission(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (!this.stream) {
      const ok = await this.requestPermission();
      if (!ok) throw new Error("Microphone permission denied");
    }

    this.chunks = [];
    this.startTime = Date.now();

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    this.mediaRecorder = new MediaRecorder(this.stream!, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(100);
    await this.ensureAnalyser();
  }

  /** Wire Web Audio analyser for live waveform metering (no speakers — no feedback). */
  async ensureAnalyser(): Promise<AnalyserNode | null> {
    if (!this.stream) return null;
    if (this.analyser) return this.analyser;

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.audioContext = new Ctx();
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.55;
    this.timeDomain = new Uint8Array(this.analyser.fftSize);
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.sourceNode.connect(this.analyser);
    return this.analyser;
  }

  /** Peak + RMS level 0–100 from the live mic stream. */
  getRmsLevel(): number {
    if (!this.analyser) return 0;
    if (this.timeDomain.length !== this.analyser.fftSize) {
      this.timeDomain = new Uint8Array(this.analyser.fftSize);
    }
    this.analyser.getByteTimeDomainData(this.timeDomain);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this.timeDomain.length; i++) {
      const v = (this.timeDomain[i] - 128) / 128;
      const a = Math.abs(v);
      sum += v * v;
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sum / this.timeDomain.length);
    // Bias toward peaks so spoken syllables read clearly on the take wave.
    return Math.min(100, Math.max(0, rms * 520 + peak * 55));
  }

  stop(): Promise<{ blob: Blob; durationMs: number }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        reject(new Error("Not recording"));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: "audio/webm" });
        const durationMs = Date.now() - this.startTime;
        resolve({ blob, durationMs });
      };

      this.mediaRecorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  release(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.mediaRecorder = null;
    try {
      this.sourceNode?.disconnect();
    } catch {
      /* ignore */
    }
    this.sourceNode = null;
    this.analyser = null;
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

export function playAudioBlob(
  blob: Blob,
  options?: { volume?: number }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    if (typeof options?.volume === "number") {
      audio.volume = Math.max(0, Math.min(1, options.volume));
    }
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = reject;
    audio.play().catch(reject);
  });
}

export async function analyzeEnergy(blob: Blob): Promise<number> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);

    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / channelData.length);
    await audioContext.close();
    return Math.min(100, Math.round(rms * 500));
  } catch {
    return 50;
  }
}

export function speakReference(text: string): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  return utterance;
}
