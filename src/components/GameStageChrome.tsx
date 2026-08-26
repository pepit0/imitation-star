"use client";

interface GameStageChromeProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export default function GameStageChrome({
  isFullscreen,
  onToggleFullscreen,
}: GameStageChromeProps) {
  return (
    <div className="bg-es-dark px-3 py-2 flex items-center justify-between border-b-3 border-es-lilac shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2.5 h-2.5 bg-es-error shrink-0 recording-pulse" />
        <span className="font-title text-[10px] sm:text-xs text-es-phosphor uppercase tracking-[0.2em] truncate">
          Recording in Session
        </span>
      </div>
      <button
        type="button"
        onClick={onToggleFullscreen}
        className="brutal-btn brutal-btn-sm bg-es-brand text-white px-3 py-1.5 text-[10px] shrink-0"
      >
        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      </button>
    </div>
  );
}
