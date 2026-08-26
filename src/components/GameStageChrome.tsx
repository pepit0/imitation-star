"use client";

interface GameStageChromeProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

function FullscreenIcon({ exit }: { exit: boolean }) {
  if (exit) {
    return (
      <svg
        viewBox="0 0 16 16"
        width="12"
        height="12"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          fill="currentColor"
          d="M5 1H1v4h2V3h2V1zm10 0H11v2h2v2h2V1zM3 11H1v4h4v-2H3v-2zm12 0h-2v2h-2v2h4v-4z"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="currentColor"
        d="M1 1h5v2H3v3H1V1zm9 0h5v5h-2V3h-3V1zM1 10h2v3h3v2H1v-5zm12 0h2v5h-5v-2h3v-3z"
      />
    </svg>
  );
}

export default function GameStageChrome({
  isFullscreen,
  onToggleFullscreen,
}: GameStageChromeProps) {
  return (
    <div className="bg-white px-3 py-2 flex items-center justify-between border-b-3 border-black shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="recording-pulse shrink-0 inline-flex items-center justify-center text-es-error"
          aria-hidden="true"
        >
          <svg viewBox="0 0 12 12" width="14" height="14">
            <path fill="currentColor" d="M2.5 1.2v9.6L11 6 2.5 1.2z" />
          </svg>
        </span>
        <span className="font-title text-[10px] sm:text-xs text-black uppercase tracking-[0.2em] truncate">
          Recording in Session
        </span>
      </div>
      <button
        type="button"
        onClick={onToggleFullscreen}
        className="brutal-btn brutal-btn-sm bg-es-brand text-white px-3 py-1.5 text-[10px] shrink-0 inline-flex items-center gap-1.5"
      >
        <FullscreenIcon exit={isFullscreen} />
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>
    </div>
  );
}
