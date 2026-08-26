"use client";

import Link from "next/link";
import { useState } from "react";
import PlayIcon from "./PlayIcon";

const NAV_ITEMS = [
  {
    href: "/forum",
    label: "Forum",
    className: "bg-es-brand text-white",
  },
  {
    href: "/packs",
    label: "Dub Packs",
    className: "bg-es-green text-white",
  },
  {
    href: "/how-to-play",
    label: "How to Play",
    className: "bg-es-blue text-white",
  },
] as const;

export default function LandingHeroNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="landing-hero-nav safe-top">
      <div className="landing-hero-nav-inner">
        <nav className="hidden md:flex items-center gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`brutal-btn brutal-btn-sm px-3 py-2 text-xs ${item.className}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          <Link
            href="/play"
            className="brutal-btn brutal-btn-sm bg-es-pollen text-black px-4 py-2 text-xs sm:text-sm"
          >
            <PlayIcon className="shrink-0" />
            Play Now
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="header-mobile-only brutal-btn brutal-btn-sm landing-hero-nav-link px-3 py-2 text-xs min-w-[4.5rem]"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="header-mobile-only px-4 pb-3 space-y-2 animate-slide-up">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`brutal-btn brutal-btn-sm block w-full px-4 py-3 text-xs text-left ${item.className}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
