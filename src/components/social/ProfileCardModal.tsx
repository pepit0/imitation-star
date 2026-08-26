"use client";

import { useEffect, useId, useRef } from "react";
import type { UserProfile } from "@/lib/types/social";
import ProfileAvatar from "@/components/profile/ProfileAvatar";

type ProfileCardModalProps = {
  profile: UserProfile;
  isFollowing: boolean;
  isSelf: boolean;
  onFollowToggle: () => void;
  onClose: () => void;
};

export default function ProfileCardModal({
  profile,
  isFollowing,
  isSelf,
  onFollowToggle,
  onClose,
}: ProfileCardModalProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canFollow = !isSelf;

  return (
    <div
      className="forum-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="forum-profile-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="forum-profile-card__close"
          onClick={onClose}
          aria-label="Close profile"
        >
          ×
        </button>

        <ProfileAvatar
          icon={profile.avatarIcon}
          color={profile.avatarColor}
          name={profile.displayName}
          className="forum-profile-card__avatar"
        />

        <h2 id={titleId} className="forum-profile-card__name">
          {profile.displayName}
        </h2>
        {profile.handle ? (
          <p className="forum-profile-card__handle">{profile.handle}</p>
        ) : null}
        <p className="forum-profile-card__bio">{profile.bio}</p>

        <div className="forum-profile-card__stats">
          <div>
            <span className="forum-profile-card__stat-value">
              {profile.followersCount}
            </span>
            <span className="forum-profile-card__stat-label">Followers</span>
          </div>
          <div>
            <span className="forum-profile-card__stat-value">
              {profile.totalStars}
            </span>
            <span className="forum-profile-card__stat-label">Total stars</span>
          </div>
        </div>

        {canFollow ? (
          <button
            type="button"
            className={`brutal-btn brutal-btn-sm forum-profile-card__follow ${
              isFollowing ? "forum-profile-card__follow--on" : ""
            }`}
            onClick={onFollowToggle}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>
        ) : (
          <p className="forum-profile-card__you">That&apos;s you</p>
        )}
      </div>
    </div>
  );
}
