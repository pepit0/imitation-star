"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/LogoMark";
import MenuModeIcon from "@/components/MenuModeIcon";
import { useAuth } from "@/components/auth/AuthProvider";
import ProfileAvatar from "@/components/profile/ProfileAvatar";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import type { PackProgressSummary } from "@/lib/packProgress";
import type { DubPack, GameMode } from "@/lib/types";

interface MainMenuProps {
  packCount: number;
  activePack: DubPack;
  packProgress?: PackProgressSummary;
  onSelectMode: (mode: GameMode) => void;
  online?: boolean;
  pendingUploadCount?: number;
  uploadingPending?: boolean;
  pendingMessage?: string | null;
  onUploadPending?: () => void;
  onDismissPendingMessage?: () => void;
}

export default function MainMenu({
  packCount,
  activePack,
  packProgress,
  onSelectMode,
  online = true,
  pendingUploadCount = 0,
  uploadingPending = false,
  pendingMessage,
  onUploadPending,
  onDismissPendingMessage,
}: MainMenuProps) {
  const isNativeApp = useIsNativeApp();
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  return (
    <div
      className={`cv-main-menu flex flex-col sm:flex-row h-full retro-pixel-grid overflow-hidden${
        isNativeApp ? " cv-main-menu--native" : " cv-main-menu--desktop"
      }`}
    >
      {/* Left — branding & active pack */}
      <div className="cv-main-menu__brand flex-1 flex flex-col p-4 sm:p-6 min-w-0 min-h-0 border-b-3 sm:border-b-0 sm:border-r-3 border-black">
        <div className="cv-main-menu__hero-lockup flex items-start justify-between gap-3">
          <div className="cv-main-menu__hero-brand flex items-center min-w-0">
            <LogoMark
              className={`object-contain shrink-0 ${
                isNativeApp
                  ? "w-10 h-10"
                  : "cv-main-menu__logo"
              }`}
              title="Imitation Star"
            />
            <div className="min-w-0">
              <p className="cv-main-menu__hero-eyebrow text-[10px] sm:text-xs uppercase tracking-[0.2em] text-es-lilac">
                The voice dubbing game
              </p>
              <h1
                className={`font-brand landing-hero__brand-title text-white ${
                  isNativeApp
                    ? "text-2xl sm:text-3xl"
                    : "cv-main-menu__title"
                }`}
              >
                {isNativeApp ? (
                  "Imitation Star"
                ) : (
                  <>
                    <span className="block">Imitation</span>
                    <span className="block">Star</span>
                  </>
                )}
              </h1>
            </div>
          </div>

          {isNativeApp && !loading ? (
            user ? (
              <Link
                href="/profile"
                className="header-account shrink-0"
                title={profile?.displayName ?? "Your profile"}
              >
                <ProfileAvatar
                  icon={profile?.avatarIcon}
                  color={profile?.avatarColor}
                  name={profile?.displayName ?? user.email ?? "?"}
                  className="header-account__avatar"
                />
                <span className="header-account__label">
                  {profile?.displayName ?? "Profile"}
                </span>
              </Link>
            ) : (
              <Link
                href="/login?next=/profile"
                className="brutal-btn brutal-btn-sm bg-white text-black px-3 py-2 text-xs shrink-0"
              >
                Sign in
              </Link>
            )
          ) : null}
        </div>

        {!isNativeApp ? (
          <div className="cv-main-menu__mascot" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/menu-singer.png"
              alt=""
              className="cv-main-menu__mascot-img"
              draggable={false}
            />
          </div>
        ) : null}

        <div
          className={`cv-main-menu__pack ${
            isNativeApp ? "mt-auto" : "pt-2"
          }`}
        >
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
              <p className="cv-main-menu__pack-label text-[10px] sm:text-xs uppercase tracking-wider">
                Active Pack{packProgress ? " — Resume in singleplayer" : ""}
              </p>
              <p className="text-base sm:text-xl font-title truncate normal-case text-white mt-1 leading-tight">
                {activePack.title}
              </p>
              <p className="cv-main-menu__pack-meta text-[11px] sm:text-sm normal-case mt-1.5">
                {activePack.lines.length} playable lines · by {activePack.creator}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right — mode buttons (desktop column ~1/3 wider; stage size unchanged) */}
      <div
        className={`cv-main-menu__modes w-full shrink-0 flex flex-col p-3 sm:p-4 gap-2 sm:gap-3 overflow-y-auto ${
          isNativeApp ? "" : "sm:w-[min(56%,427px)]"
        }`}
      >
        {!online ? (
          <p className="offline-banner offline-banner--menu" role="status">
            Offline mode — play downloaded packs only.
          </p>
        ) : null}

        {pendingUploadCount > 0 ? (
          <div className="pending-uploads-bar">
            <p>
              {pendingUploadCount} saved dub
              {pendingUploadCount === 1 ? "" : "s"} waiting to upload
            </p>
            <button
              type="button"
              className="brutal-btn brutal-btn-sm"
              disabled={!online || uploadingPending || !user}
              onClick={() => onUploadPending?.()}
            >
              {uploadingPending
                ? "Uploading…"
                : user
                  ? "Upload now"
                  : "Sign in to upload"}
            </button>
          </div>
        ) : null}

        {pendingMessage ? (
          <p className="pending-uploads-message" role="status">
            {pendingMessage}{" "}
            <button
              type="button"
              className="auth-link"
              onClick={() => onDismissPendingMessage?.()}
            >
              Dismiss
            </button>
          </p>
        ) : null}

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

        {isNativeApp ? (
          <>
            <button
              type="button"
              onClick={() => router.push("/forum")}
              className="cv-menu-btn cv-menu-btn-outline flex-1 min-h-[5rem]"
            >
              <span className="cv-menu-btn-head">
                <MenuModeIcon mode="forum" />
                <span className="cv-menu-btn-title">Forum</span>
              </span>
              <span className="cv-menu-btn-sub">
                Rate takes and see what the community posted
              </span>
            </button>

            <button
              type="button"
              disabled
              aria-disabled="true"
              className="cv-menu-btn cv-menu-btn-outline flex-1 min-h-[5rem] opacity-40 pointer-events-none grayscale"
            >
              <span className="cv-menu-btn-head">
                <MenuModeIcon mode="upload" />
                <span className="cv-menu-btn-title">Create a Dub Pack</span>
              </span>
              <span className="cv-menu-btn-sub normal-case">
                Create a dub pack is only available on PC
              </span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onSelectMode("upload")}
            className="cv-menu-btn cv-menu-btn-outline flex-1 min-h-[5rem]"
          >
            <span className="cv-menu-btn-head">
              <MenuModeIcon mode="upload" />
              <span className="cv-menu-btn-title">Create a Dub Pack</span>
            </span>
            <span className="cv-menu-btn-sub normal-case">
              Account required · upload a clip · mark lines · save as a pack
            </span>
          </button>
        )}
      </div>

      <span className="cv-main-menu__version" aria-hidden="true">
        1.0.0
      </span>
    </div>
  );
}
