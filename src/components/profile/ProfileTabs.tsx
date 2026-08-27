"use client";

import { useEffect, useState } from "react";
import ProfileMultiplayer from "@/components/profile/ProfileMultiplayer";
import ProfileInvites from "@/components/profile/ProfileInvites";
import { ProfilePosts } from "@/components/profile/ProfilePosts";
import { countPendingInvites } from "@/lib/collabDubs";

export type ProfileTab = "posts" | "multiplayer" | "invites";

type ProfileTabsProps = {
  authorId: string;
  tab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
};

function MailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v.01L12 13l8-6.99V6H4zm16 12V8.5l-8 6.5-8-6.5V18h16z"
      />
    </svg>
  );
}

export function ProfileTabs({
  authorId,
  tab,
  onTabChange,
}: ProfileTabsProps) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void countPendingInvites(authorId).then((count) => {
      if (!cancelled) setPendingCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [authorId, tab]);

  return (
    <section className="profile-posts profile-panel" aria-labelledby="profile-panel-heading">
      <div className="profile-panel__tabs-row">
        <div className="profile-panel__tabs" role="tablist" aria-label="Profile sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "posts"}
            className={`profile-panel__tab ${tab === "posts" ? "profile-panel__tab--active" : ""}`}
            onClick={() => onTabChange("posts")}
          >
            Posts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "multiplayer"}
            className={`profile-panel__tab ${tab === "multiplayer" ? "profile-panel__tab--active" : ""}`}
            onClick={() => onTabChange("multiplayer")}
          >
            Multiplayer
          </button>
        </div>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "invites"}
          className={`profile-mail-tab ${tab === "invites" ? "profile-mail-tab--active" : ""}`}
          title="Invites"
          aria-label={
            pendingCount > 0 ? `${pendingCount} pending invites` : "Invites"
          }
          onClick={() => onTabChange("invites")}
        >
          <MailIcon />
          {pendingCount > 0 ? (
            <span className="profile-mail-tab__badge" aria-hidden="true">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          ) : null}
        </button>
      </div>

      <div role="tabpanel">
        {tab === "posts" ? (
          <ProfilePosts authorId={authorId} hideTitle />
        ) : tab === "multiplayer" ? (
          <ProfileMultiplayer userId={authorId} />
        ) : (
          <ProfileInvites userId={authorId} />
        )}
      </div>
    </section>
  );
}
