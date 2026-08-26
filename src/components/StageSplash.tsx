"use client";

import Image from "next/image";

interface StageSplashProps {
  onPlayNow: () => void;
}

export default function StageSplash({ onPlayNow }: StageSplashProps) {
  return (
    <div className="stage-hero flex flex-col h-full relative overflow-hidden">
      <div className="stage-hero-art" aria-hidden="true">
        <Image
          src="/images/stage-microphone.png"
          alt=""
          fill
          priority
          className="object-cover object-[center_40%]"
          sizes="(max-width: 896px) 100vw, 896px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-es-dark/95 via-es-dark/45 to-es-dark/20" />
        <div className="absolute inset-0 bg-es-brand/10 mix-blend-multiply" />
      </div>

      <div className="relative z-10 flex flex-col justify-end h-full p-5 sm:p-8 pb-6 sm:pb-8 max-w-lg">
        <span className="stage-badge">Voice Dubbing Game</span>

        <h1 className="stage-title-wrap">
          <span className="stage-title-star" aria-hidden="true">
            <svg viewBox="0 0 100 100" className="stage-title-star-svg">
              <polygon
                points="50,4 61,38 97,38 68,59 79,93 50,72 21,93 32,59 3,38 39,38"
              />
            </svg>
          </span>
          <span className="stage-title font-title">Imitation Star</span>
        </h1>

        <button
          type="button"
          onClick={onPlayNow}
          className="brutal-btn-play w-fit"
        >
          <span aria-hidden="true">▶</span>
          Play Now
        </button>

        <p className="mt-3 text-[10px] sm:text-xs text-es-text-secondary normal-case tracking-normal max-w-xs">
          Microphone access is requested only after you press Record.
        </p>
      </div>
    </div>
  );
}
