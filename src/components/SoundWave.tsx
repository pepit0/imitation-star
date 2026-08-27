"use client";

interface SoundWaveProps {
  peaks: number[];
  /** Highlight / animate as active (recording or playing) */
  active?: boolean;
  /** Empty second row style for user take */
  muted?: boolean;
  /**
   * 0–1 scrub position. Bars at/before progress are lit; bars ahead stay dim.
   * Omit to show the full wave at normal brightness.
   */
  progress?: number;
  /**
   * When scrubbing, collapse bars ahead of the playhead (height ~0) so a live
   * take “draws” left→right instead of showing a flat dim rail.
   */
  reveal?: boolean;
  label?: string;
  className?: string;
}

/** Choicer Voicer–style yellow bar waveform. */
export default function SoundWave({
  peaks,
  active = false,
  muted = false,
  progress,
  reveal = false,
  label,
  className = "",
}: SoundWaveProps) {
  const bars = peaks.length ? peaks : Array.from({ length: 32 }, () => 18);
  const scrubbing = typeof progress === "number";
  const p = scrubbing ? Math.max(0, Math.min(1, progress)) : 1;
  const playhead = scrubbing
    ? Math.min(bars.length - 1, Math.floor(p * Math.max(bars.length, 1)))
    : -1;

  return (
    <div className={`cv-wave-block ${className}`.trim()}>
      {label ? <p className="cv-wave-label">{label}</p> : null}
      <div
        className={`cv-waveform ${muted ? "cv-waveform--muted" : ""} ${
          active && !scrubbing ? "cv-waveform--live" : ""
        } ${scrubbing ? "cv-waveform--scrub" : ""} ${
          reveal ? "cv-waveform--reveal" : ""
        }`}
        aria-hidden="true"
      >
        <div className="cv-waveform__track">
          {bars.map((h, i) => {
            const lit = !scrubbing || i <= playhead;
            const isHead = scrubbing && i === playhead;
            const height = !scrubbing
              ? h
              : lit
                ? Math.max(reveal ? 10 : 4, h)
                : reveal
                  ? 3
                  : h;
            return (
              <span
                key={i}
                className={[
                  "cv-waveform-bar",
                  lit ? "cv-waveform-bar--lit" : "cv-waveform-bar--dim",
                  isHead ? "cv-waveform-bar--head" : "",
                  active && !scrubbing ? "cv-waveform-bar-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ height: `${Math.max(2, Math.min(100, height))}%` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
