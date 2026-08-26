"use client";

import ProfileMultiplayer from "@/components/profile/ProfileMultiplayer";
import { ProfilePosts } from "@/components/profile/ProfilePosts";

type ProfileTabsProps = {
  authorId: string;
  tab: "posts" | "multiplayer";
  onTabChange: (tab: "posts" | "multiplayer") => void;
};

export function ProfileTabs({
  authorId,
  tab,
  onTabChange,
}: ProfileTabsProps) {
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
      </div>

      <div role="tabpanel">
        {tab === "posts" ? (
          <ProfilePosts authorId={authorId} hideTitle />
        ) : (
          <ProfileMultiplayer userId={authorId} />
        )}
      </div>
    </section>
  );
}
