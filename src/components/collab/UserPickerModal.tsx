"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "@/lib/types/social";
import { searchProfiles, getProfileById } from "@/lib/profileSearch";
import { formatHandle } from "@/lib/handle";
import ProfileAvatar from "@/components/profile/ProfileAvatar";

type UserPickerModalProps = {
  currentUserId: string;
  currentUserProfile?: UserProfile | null;
  onSelect: (user: UserProfile) => void;
  onClose: () => void;
};

export default function UserPickerModal({
  currentUserId,
  currentUserProfile,
  onSelect,
  onClose,
}: UserPickerModalProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "following">("all");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profiles = await searchProfiles(query, {
        followingOnly: filter === "following",
        currentUserId,
        limit: 24,
      });
      setResults(profiles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, filter, currentUserId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch();
    }, 250);
    return () => clearTimeout(timer);
  }, [runSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pickSelf() {
    if (currentUserProfile) {
      onSelect(currentUserProfile);
      return;
    }
    setError(null);
    const me = await getProfileById(currentUserId);
    if (me) {
      onSelect(me);
      return;
    }
    setError("Couldn’t load your profile. Try again or pick another player.");
  }

  return (
    <div
      className="forum-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="user-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a player"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="user-picker__header">
          <h3 className="user-picker__title">Assign player</h3>
          <button
            type="button"
            className="user-picker__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="user-picker__filters">
          <button
            type="button"
            className={`user-picker__filter ${filter === "all" ? "user-picker__filter--active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All users
          </button>
          <button
            type="button"
            className={`user-picker__filter ${filter === "following" ? "user-picker__filter--active" : ""}`}
            onClick={() => setFilter("following")}
          >
            Following
          </button>
        </div>

        <input
          type="search"
          className="user-picker__search"
          placeholder="Search by @handle or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <button
          type="button"
          className="brutal-btn brutal-btn-sm user-picker__self"
          onClick={() => void pickSelf()}
        >
          Assign to me
        </button>

        {error ? (
          <p className="user-picker__error" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="user-picker__list">
          {loading ? (
            <li className="user-picker__empty">Searching…</li>
          ) : results.length === 0 ? (
            <li className="user-picker__empty">
              {filter === "following" && !query
                ? "Follow players on the forum to see them here."
                : "No users found."}
            </li>
          ) : (
            results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className="user-picker__row"
                  onClick={() => onSelect(user)}
                >
                  <ProfileAvatar
                    icon={user.avatarIcon}
                    color={user.avatarColor}
                    name={user.displayName}
                    className="user-picker__avatar"
                  />
                  <span className="user-picker__meta">
                    <span className="user-picker__name">{user.displayName}</span>
                    {user.handle ? (
                      <span className="user-picker__handle">
                        {formatHandle(user.handle)}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
