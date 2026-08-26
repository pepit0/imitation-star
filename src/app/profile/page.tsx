"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppBackButton from "@/components/AppBackButton";
import { useAuth } from "@/components/auth/AuthProvider";
import ProfileAvatar from "@/components/profile/ProfileAvatar";
import ProfileXpBar from "@/components/profile/ProfileXpBar";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { formatHandle } from "@/lib/handle";
import { validateDisplayName } from "@/lib/profanity";
import { updateProfile } from "@/app/profile/actions";
import {
  AVATAR_COLORS,
  DEFAULT_AVATAR_COLOR,
  DEFAULT_AVATAR_ICON,
  PROFILE_ICONS,
  type ProfileIconId,
} from "@/lib/profileIcons";

function ProfilePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const [tab, setTab] = useState<"posts" | "multiplayer">("posts");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarIcon, setAvatarIcon] = useState<ProfileIconId>(DEFAULT_AVATAR_ICON);
  const [avatarColor, setAvatarColor] = useState(DEFAULT_AVATAR_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "multiplayer") setTab("multiplayer");
  }, [searchParams]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/profile");
      return;
    }
    if (profile) {
      setDisplayName(profile.displayName);
      setBio(profile.bio);
      setAvatarIcon(profile.avatarIcon as ProfileIconId);
      setAvatarColor(profile.avatarColor);
    }
  }, [loading, user, profile, router]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    const nameError = validateDisplayName(displayName);
    if (nameError) {
      setBusy(false);
      setError(nameError);
      return;
    }

    const result = await updateProfile({
      displayName,
      bio,
      avatarIcon,
      avatarColor,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refreshProfile();
    setSaved(true);
  }

  async function onSignOut() {
    await signOut();
    router.replace("/");
    router.refresh();
  }

  if (loading || !user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-card__sub">Loading profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page profile-page">
      <div className="profile-page__layout">
        <div className="auth-card profile-page__info">
          <div className="profile-page__hero">
            <ProfileAvatar
              icon={avatarIcon}
              color={avatarColor}
              name={displayName}
              className="auth-avatar"
            />
            <ProfileXpBar />
          </div>
          <h1 className="auth-card__title">Your profile</h1>

          {error ? (
            <p className="auth-card__error" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="auth-card__info" role="status">
              Profile saved.
            </p>
          ) : null}

          <form className="auth-form" onSubmit={onSave}>
            <fieldset className="profile-avatar-picker">
              <legend className="profile-avatar-picker__legend">Profile icon</legend>
              <div className="profile-avatar-picker__icons" role="list">
                {PROFILE_ICONS.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    role="listitem"
                    className={`profile-avatar-picker__icon-btn ${
                      avatarIcon === icon.id
                        ? "profile-avatar-picker__icon-btn--active"
                        : ""
                    }`}
                    onClick={() => setAvatarIcon(icon.id)}
                    aria-pressed={avatarIcon === icon.id}
                    aria-label={icon.label}
                  >
                    <ProfileAvatar
                      icon={icon.id}
                      color={avatarColor}
                      name={icon.label}
                      className="profile-avatar-picker__icon-preview"
                    />
                  </button>
                ))}
              </div>
              <p className="profile-avatar-picker__colors-label">Background color</p>
              <div className="profile-avatar-picker__colors" role="list">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    role="listitem"
                    className={`profile-avatar-picker__color-btn ${
                      avatarColor === color.value
                        ? "profile-avatar-picker__color-btn--active"
                        : ""
                    }`}
                    style={{ background: color.value }}
                    onClick={() => setAvatarColor(color.value)}
                    aria-pressed={avatarColor === color.value}
                    aria-label={color.label}
                  />
                ))}
              </div>
            </fieldset>
            <div className="auth-field auth-field--readonly">
              <span>Handle</span>
              <div className="auth-handle auth-handle--readonly">
                <span className="auth-handle__at" aria-hidden="true">
                  @
                </span>
                <span className="auth-handle__value">
                  {formatHandle(profile?.handle)?.slice(1) ?? "—"}
                </span>
              </div>
              <span className="auth-field__hint">
                Set at signup — cannot be changed
              </span>
            </div>
            <label className="auth-field">
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
                required
              />
            </label>
            <label className="auth-field">
              <span>Bio</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={200}
              />
            </label>
            <button
              type="submit"
              className="brutal-btn bg-es-brand text-white w-full"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save profile"}
            </button>
          </form>

          <button
            type="button"
            className="brutal-btn brutal-btn-sm bg-white w-full mt-3"
            onClick={onSignOut}
          >
            Sign out
          </button>

          <AppBackButton href="/forum">← Back to forum</AppBackButton>
        </div>

        <ProfileTabs authorId={user.id} tab={tab} onTabChange={setTab} />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="auth-page">
          <div className="auth-card">
            <p className="auth-card__sub">Loading profile…</p>
          </div>
        </div>
      }
    >
      <ProfilePageInner />
    </Suspense>
  );
}
