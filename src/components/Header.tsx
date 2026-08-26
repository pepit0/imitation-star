"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import ProfileAvatar from "@/components/profile/ProfileAvatar";
import LogoMark from "./LogoMark";
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

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, profile, loading } = useAuth();

  return (
    <header className="brutal-border border-t-0 border-x-0 bg-white safe-top sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-4 no-underline text-inherit">
          <LogoMark className="w-9 h-9 object-contain" title="Imitation Star" />
          <div className="hidden sm:block">
            <span className="font-brand text-xl">Imitation Star</span>
            <span className="block text-[10px] tracking-widest text-gray-600 uppercase">
              The voice dubbing game
            </span>
          </div>
        </Link>

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

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <Link
              href="/profile"
              className="header-account"
              title={profile?.displayName ?? "Your profile"}
            >
              <ProfileAvatar
                icon={profile?.avatarIcon}
                color={profile?.avatarColor}
                name={profile?.displayName ?? user.email ?? "?"}
                className="header-account__avatar"
              />
              <span className="header-account__label hidden sm:inline">
                {profile?.displayName ?? "Profile"}
              </span>
            </Link>
          ) : !loading ? (
            <Link
              href="/login"
              className="brutal-btn brutal-btn-sm bg-white px-3 py-2 text-xs"
            >
              Sign in
            </Link>
          ) : null}
          <Link
            href="/play"
            className="brutal-btn brutal-btn-sm bg-es-pollen text-black px-4 py-2 text-xs sm:text-sm font-bold"
          >
            <PlayIcon className="shrink-0" />
            Play Now
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="header-mobile-only brutal-btn brutal-btn-sm bg-white px-3 py-2 text-xs min-w-[4.5rem]"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="header-mobile-only brutal-border border-x-0 border-b-0 bg-white animate-slide-up p-2 space-y-2">
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
          {!loading && user ? (
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="brutal-btn brutal-btn-sm block w-full px-4 py-3 text-xs text-left bg-white"
            >
              Profile
            </Link>
          ) : !loading ? (
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="brutal-btn brutal-btn-sm block w-full px-4 py-3 text-xs text-left bg-white"
            >
              Sign in
            </Link>
          ) : null}
        </nav>
      )}
    </header>
  );
}
