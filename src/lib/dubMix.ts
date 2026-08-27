import type { DubLine, RecordedLine } from "./types";

export interface DubMixOptions {
  video: HTMLVideoElement;
  /** Optional no-dialogue stem (CV `_backing_track`) */
  backingUrl?: string | null;
  lines: DubLine[];
  recordings: RecordedLine[];
  onStatus?: (msg: string) => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentMs: number, durationMs: number) => void;
}

type PreparedTake = {
  lineId: string;
  startMs: number;
  endMs: number;
  audio: HTMLAudioElement;
};

/**
 * Choicer Voicer–style final mix:
 * muted video + optional backing track + user takes at line timestamps.
 * Supports pause / resume / seek for the end-screen timeline.
 */
export class DubMixer {
  private video: HTMLVideoElement;
  private backing: HTMLAudioElement | null = null;
  private preparedTakes: PreparedTake[] = [];
  private timers: number[] = [];
  private rafId = 0;
  private playing = false;
  private startedAtPerf = 0;
  private startedFromMs = 0;
  private durationMs = 0;
  private onStatus?: (msg: string) => void;
  private onEnded?: () => void;
  private onTimeUpdate?: (currentMs: number, durationMs: number) => void;
  private lines: DubLine[];
  private recordings: RecordedLine[];
  private backingUrl?: string | null;
  private ready = false;
  private volume = 1;

  constructor(options: DubMixOptions) {
    this.video = options.video;
    this.backingUrl = options.backingUrl;
    this.lines = options.lines;
    this.recordings = options.recordings;
    this.onStatus = options.onStatus;
    this.onEnded = options.onEnded;
    this.onTimeUpdate = options.onTimeUpdate;
  }

  get isPlaying() {
    return this.playing;
  }

  getDurationMs() {
    return this.durationMs;
  }

  getCurrentMs() {
    if (this.playing) {
      return Math.min(
        this.durationMs,
        this.startedFromMs + (performance.now() - this.startedAtPerf)
      );
    }
    return Math.min(
      this.durationMs,
      Math.max(0, (this.video.currentTime || 0) * 1000)
    );
  }

  /** 0–1 gain applied to backing track and user takes (video stays muted). */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.backing) this.backing.volume = this.volume;
    for (const take of this.preparedTakes) {
      take.audio.volume = this.volume;
    }
  }

  async prepare(): Promise<number> {
    this.teardownTakes();
    this.video.muted = true;
    this.video.volume = 0;

    if (this.backingUrl) {
      this.backing = new Audio(this.backingUrl);
      this.backing.preload = "auto";
    }

    const byLine = new Map(this.recordings.map((r) => [r.lineId, r]));
    const ordered = [...this.lines].sort((a, b) => a.startMs - b.startMs);

    for (const line of ordered) {
      const rec = byLine.get(line.id);
      if (!rec) continue;
      const audio = new Audio(URL.createObjectURL(rec.blob));
      audio.preload = "auto";
      this.preparedTakes.push({
        lineId: line.id,
        startMs: line.startMs,
        endMs: line.endMs,
        audio,
      });
    }

    this.applyVolume();
    await this.waitForMedia();

    this.durationMs = Math.max(
      (this.video.duration || 0) * 1000,
      this.backing?.duration ? this.backing.duration * 1000 : 0,
      ...ordered.map((l) => l.endMs),
      ...this.recordings.map((r) => {
        const line = this.lines.find((l) => l.id === r.lineId);
        return (line?.startMs ?? 0) + r.durationMs;
      }),
      1000
    );

    this.ready = true;
    this.onTimeUpdate?.(0, this.durationMs);
    return this.durationMs;
  }

  async play(fromMs = 0): Promise<void> {
    if (!this.ready) await this.prepare();
    this.clearTimers();
    this.pauseAllAudio();

    const startMs = Math.max(0, Math.min(fromMs, Math.max(0, this.durationMs - 50)));
    this.playing = true;
    this.startedFromMs = startMs;
    this.startedAtPerf = performance.now();
    this.onStatus?.("Playing full dub…");

    this.video.muted = true;
    this.video.currentTime = startMs / 1000;
    if (this.backing) {
      this.backing.currentTime = Math.min(
        startMs / 1000,
        Math.max(0, (this.backing.duration || 0) - 0.05)
      );
    }

    for (const take of this.preparedTakes) {
      take.audio.pause();
      take.audio.currentTime = 0;

      if (take.endMs <= startMs) continue;

      if (take.startMs <= startMs) {
        // Mid-line seek: start take partway through.
        const offsetSec = (startMs - take.startMs) / 1000;
        take.audio.currentTime = Math.max(0, offsetSec);
        void take.audio.play().catch(() => undefined);
        continue;
      }

      const delay = take.startMs - startMs;
      const timer = window.setTimeout(() => {
        if (!this.playing) return;
        take.audio.currentTime = 0;
        void take.audio.play().catch(() => undefined);
      }, delay);
      this.timers.push(timer);
    }

    try {
      const starts: Promise<void>[] = [
        this.video.play().then(() => undefined),
      ];
      if (this.backing) {
        starts.push(this.backing.play().then(() => undefined));
      }
      await Promise.all(starts);
    } catch {
      this.onStatus?.("Could not start playback. Try again.");
      this.pause();
      return;
    }

    this.tick();
    const remaining = Math.max(200, this.durationMs - startMs + 150);
    const endTimer = window.setTimeout(() => {
      this.pause(true);
      this.onStatus?.("Dub finished.");
      this.onEnded?.();
    }, remaining);
    this.timers.push(endTimer);
  }

  pause(ended = false): void {
    if (!this.playing && !ended) return;
    const at = this.getCurrentMs();
    this.playing = false;
    this.clearTimers();
    this.video.pause();
    this.backing?.pause();
    for (const take of this.preparedTakes) take.audio.pause();
    if (!ended) {
      this.video.currentTime = at / 1000;
      this.onTimeUpdate?.(at, this.durationMs);
    } else {
      this.video.currentTime = 0;
      this.onTimeUpdate?.(this.durationMs, this.durationMs);
    }
  }

  async seek(ms: number): Promise<void> {
    const clamped = Math.max(0, Math.min(ms, this.durationMs));
    const wasPlaying = this.playing;
    this.pause();
    this.video.currentTime = clamped / 1000;
    if (this.backing) {
      this.backing.currentTime = Math.min(
        clamped / 1000,
        Math.max(0, (this.backing.duration || 0) - 0.05)
      );
    }
    this.onTimeUpdate?.(clamped, this.durationMs);
    if (wasPlaying) {
      await this.play(clamped);
    }
  }

  stop(): void {
    this.playing = false;
    this.clearTimers();
    this.video.pause();
    this.video.currentTime = 0;
    this.backing?.pause();
    if (this.backing) this.backing.currentTime = 0;
    for (const take of this.preparedTakes) {
      take.audio.pause();
      take.audio.currentTime = 0;
    }
    this.onTimeUpdate?.(0, this.durationMs);
  }

  dispose(): void {
    this.stop();
    this.teardownTakes();
    this.backing = null;
    this.ready = false;
  }

  private tick = () => {
    if (!this.playing) return;
    const current = this.getCurrentMs();
    this.onTimeUpdate?.(current, this.durationMs);
    this.rafId = window.requestAnimationFrame(this.tick);
  };

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private pauseAllAudio(): void {
    this.backing?.pause();
    for (const take of this.preparedTakes) take.audio.pause();
  }

  private teardownTakes(): void {
    for (const take of this.preparedTakes) {
      take.audio.pause();
      const src = take.audio.src;
      take.audio.removeAttribute("src");
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    }
    this.preparedTakes = [];
  }

  private waitForMedia(): Promise<void> {
    const waits: Promise<void>[] = [];
    if (this.video.readyState < 1) {
      waits.push(
        new Promise((resolve) => {
          const done = () => {
            this.video.removeEventListener("loadedmetadata", done);
            resolve();
          };
          this.video.addEventListener("loadedmetadata", done);
        })
      );
    }
    if (this.backing && this.backing.readyState < 1) {
      waits.push(
        new Promise((resolve) => {
          const done = () => {
            this.backing?.removeEventListener("loadedmetadata", done);
            resolve();
          };
          this.backing?.addEventListener("loadedmetadata", done);
        })
      );
    }
    return Promise.all(waits).then(() => undefined);
  }
}
