"use client";

import MenuModeIcon from "@/components/MenuModeIcon";
import MenuShootingStar from "@/components/MenuShootingStar";
import type { DubPack, GameMode } from "@/lib/types";

interface MainMenuProps {
  packCount: number;
  activePack: DubPack;
  onSelectMode: (mode: GameMode) => void;
}

export default function MainMenu({
  packCount,
  activePack,
  onSelectMode,
}: MainMenuProps) {
  return (
    <div className="flex flex-col sm:flex-row h-full bg-es-screen retro-pixel-grid overflow-hidden">
      {/* Left — branding & active pack */}
      <div className="flex-1 flex flex-col p-4 sm:p-6 min-w-0 min-h-0 border-b-3 sm:border-b-0 sm:border-r-3 border-black">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-es-brand">
          <span className="inline-flex gap-0.5" aria-hidden="true">
            <span className="w-1 h-3 bg-es-brand" />
            <span className="w-1 h-3 bg-es-brand opacity-70" />
            <span className="w-1 h-3 bg-es-brand opacity-40" />
          </span>
          Dub Stage
        </div>

        <div className="mt-4 sm:mt-6">
          <h1 className="font-title text-7xl sm:text-8xl lg:text-[7.5rem] leading-[0.85] tracking-tight uppercase">
            <span className="text-white block">Imitation</span>
            <span className="text-es-yellow block cv-menu-brand-star">
              <span className="cv-menu-brand-star__word">Star</span>
              <MenuShootingStar />
            </span>
          </h1>
          <p className="mt-3 text-[10px] sm:text-xs text-es-text-secondary uppercase tracking-[0.25em]">
            Listen · Dub · Share · Rate
          </p>
        </div>

        <div className="mt-auto pt-6">
          <div className="cv-active-pack">
            <div
              className="cv-active-pack-thumb overflow-hidden"
              style={{ backgroundColor: activePack.thumbnailColor }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activePack.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-[10px] sm:text-xs uppercase tracking-wider text-es-brand">
                Active Pack
              </p>
              <p className="text-base sm:text-xl font-title truncate normal-case text-white mt-1 leading-tight">
                {activePack.title}
              </p>
              <p className="text-[11px] sm:text-sm text-es-text-secondary normal-case mt-1.5">
                {activePack.lines.length} playable lines · by {activePack.creator}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right — mode buttons */}
      <div className="w-full sm:w-[min(42%,320px)] shrink-0 flex flex-col p-3 sm:p-4 gap-2 sm:gap-3 bg-es-darker overflow-y-auto">
        <button
          type="button"
          onClick={() => onSelectMode("single")}
          className="cv-menu-btn cv-menu-btn-primary flex-1 min-h-[5rem]"
        >
          <span className="cv-menu-btn-head">
            <MenuModeIcon mode="single" />
            <span className="cv-menu-btn-title">
              <span className="block">Single Player /</span>
              <span className="block">Couch Party</span>
            </span>
          </span>
          <span className="cv-menu-btn-sub">
            Solo or pass the device — start with the selected pack
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectMode("multiplayer")}
          className="cv-menu-btn cv-menu-btn-warm flex-1 min-h-[5rem]"
        >
          <span className="cv-menu-btn-head">
            <MenuModeIcon mode="multiplayer" />
            <span className="cv-menu-btn-title">Multiplayer</span>
          </span>
          <span className="cv-menu-btn-sub">
            Assign lines to friends and dub together online
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectMode("packs")}
          className="cv-menu-btn cv-menu-btn-dark flex-1 min-h-[5rem]"
        >
          <span className="cv-menu-btn-head">
            <MenuModeIcon mode="packs" />
            <span className="cv-menu-btn-title">Community Packs</span>
          </span>
          <span className="cv-menu-btn-sub">
            Browse all {packCount} Dub Packs
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectMode("upload")}
          className="cv-menu-btn cv-menu-btn-outline flex-1 min-h-[5rem]"
        >
          <span className="cv-menu-btn-head">
            <MenuModeIcon mode="upload" />
            <span className="cv-menu-btn-title">Create a Dub</span>
          </span>
          <span className="cv-menu-btn-sub normal-case">
            Upload a clip · mark lines · save as a pack
          </span>
        </button>
      </div>
    </div>
  );
}
