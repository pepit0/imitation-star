"use client";

import type { DubPost, UserProfile } from "@/lib/types/social";
import {
  getFollowingUserIds as fetchFollowingIds,
  isFollowing as checkFollowing,
  migrateLocalFollows,
  toggleFollow as toggleFollowDb,
} from "@/lib/follows";
import { togglePostStar, listStarredPostIds } from "@/lib/postStars";
import { emitNotificationEvent } from "@/lib/pushNotifications";
import {
  LOCAL_USER_ID,
  SEED_POSTS,
  SEED_USERS,
} from "@/lib/social/seed";

const STARRED_KEY = "imitation-star:starred-posts";
export const SOCIAL_EVENT = "imitation-star:social";

/** Active account id for follow/self checks (auth user or local mock). */
let currentUserId: string = LOCAL_USER_ID;
let followingCache: string[] = [];
let followingLoadedFor: string | null = null;
let starredCache: string[] = [];
let starredLoadedFor: string | null = null;

export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId ?? LOCAL_USER_ID;
  if (!userId) {
    followingCache = [];
    followingLoadedFor = null;
    starredCache = [];
    starredLoadedFor = null;
  }
}

export function getCurrentUserId(): string {
  return currentUserId;
}

function dispatchSocialChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SOCIAL_EVENT));
}

type PersistedIds = string[];

function readIds(key: string): PersistedIds {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: PersistedIds): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(ids));
  dispatchSocialChange();
}

export function getStarredPostIds(): string[] {
  if (starredLoadedFor && starredLoadedFor === currentUserId) {
    return starredCache;
  }
  return readIds(STARRED_KEY);
}

export async function loadStarredIds(userId: string): Promise<string[]> {
  try {
    const ids = await listStarredPostIds();
    starredCache = ids;
    starredLoadedFor = userId;
    writeIds(STARRED_KEY, ids);
    dispatchSocialChange();
    return ids;
  } catch {
    const local = readIds(STARRED_KEY);
    starredCache = local;
    starredLoadedFor = userId;
    return local;
  }
}

/** Cached following ids — call loadFollowingIds first when signed in. */
export function getFollowingUserIds(): string[] {
  return followingCache;
}

export async function loadFollowingIds(userId: string): Promise<string[]> {
  await migrateLocalFollows(userId);
  const ids = await fetchFollowingIds(userId);
  followingCache = ids;
  followingLoadedFor = userId;
  dispatchSocialChange();
  return ids;
}

export function isPostStarred(postId: string): boolean {
  return getStarredPostIds().includes(postId);
}

export function isFollowing(userId: string): boolean {
  return followingCache.includes(userId);
}

export async function toggleStar(postId: string): Promise<boolean> {
  if (!currentUserId || currentUserId === LOCAL_USER_ID) {
    // Guest: keep local-only behavior
    const starred = getStarredPostIds();
    const next = starred.includes(postId)
      ? starred.filter((id) => id !== postId)
      : [...starred, postId];
    writeIds(STARRED_KEY, next);
    starredCache = next;
    return next.includes(postId);
  }

  const result = await togglePostStar(postId);
  const next = result.starred
    ? [...new Set([...getStarredPostIds(), postId])]
    : getStarredPostIds().filter((id) => id !== postId);
  starredCache = next;
  starredLoadedFor = currentUserId;
  writeIds(STARRED_KEY, next);
  return result.starred;
}

export async function toggleFollow(
  targetUserId: string,
  followerId?: string
): Promise<boolean> {
  const follower = followerId ?? currentUserId;
  if (!follower || follower === LOCAL_USER_ID) return false;
  if (targetUserId === follower) return false;

  const next = await toggleFollowDb(follower, targetUserId);
  if (followingLoadedFor === follower) {
    followingCache = next
      ? [...new Set([...followingCache, targetUserId])]
      : followingCache.filter((id) => id !== targetUserId);
  }
  dispatchSocialChange();
  if (next) {
    emitNotificationEvent({
      type: "follow",
      targetUserId,
    });
  }
  return next;
}

export async function refreshFollowing(userId: string): Promise<string[]> {
  return loadFollowingIds(userId);
}

export function getProfile(userId: string): UserProfile | undefined {
  const base = SEED_USERS.find((u) => u.id === userId);
  if (!base) return undefined;
  const following = followingCache;
  const starred = getStarredPostIds();
  const authorPosts = SEED_POSTS.filter((p) => p.authorId === userId);

  let followersCount = base.followersCount;
  if (userId !== getCurrentUserId()) {
    const locallyFollowed = following.includes(userId);
    followersCount = base.followersCount + (locallyFollowed ? 1 : 0);
  }

  const extraStars = authorPosts.reduce(
    (sum, p) => sum + (starred.includes(p.id) ? 1 : 0),
    0
  );

  return {
    ...base,
    followersCount,
    totalStars: base.totalStars + extraStars,
  };
}

export function getLocalUser(): UserProfile {
  return getProfile(LOCAL_USER_ID) ?? SEED_USERS[0];
}

export function listPosts(): DubPost[] {
  const starred = getStarredPostIds();
  return [...SEED_POSTS]
    .map((post) => ({
      ...post,
      starCount: post.starCount + (starred.includes(post.id) ? 1 : 0),
    }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export function subscribeSocial(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(SOCIAL_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(SOCIAL_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export { LOCAL_USER_ID };
