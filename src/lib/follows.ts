"use client";

import { createClient } from "@/lib/supabase/client";

const FOLLOWING_KEY = "imitation-star:following";
const FOLLOWING_MIGRATED_KEY = "imitation-star:following-migrated";

function readLocalFollowing(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FOLLOWING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One-time migration of localStorage follows to Supabase. */
export async function migrateLocalFollows(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(FOLLOWING_MIGRATED_KEY) === userId) return;

  const local = readLocalFollowing().filter(
    (id) => UUID_RE.test(id) && id !== userId
  );
  if (local.length === 0) {
    localStorage.setItem(FOLLOWING_MIGRATED_KEY, userId);
    return;
  }

  const supabase = createClient();
  const rows = local.map((followingId) => ({
    follower_id: userId,
    following_id: followingId,
  }));

  await supabase
    .from("follows")
    .upsert(rows, { onConflict: "follower_id,following_id", ignoreDuplicates: true });

  localStorage.removeItem(FOLLOWING_KEY);
  localStorage.setItem(FOLLOWING_MIGRATED_KEY, userId);
}

export async function getFollowingUserIds(userId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (error) throw error;
  return (data ?? []).map((row) => row.following_id as string);
}

export async function isFollowing(
  followerId: string,
  followingId: string
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function toggleFollow(
  followerId: string,
  followingId: string
): Promise<boolean> {
  if (followerId === followingId) return false;

  const supabase = createClient();
  const already = await isFollowing(followerId, followingId);

  if (already) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase.from("follows").insert({
    follower_id: followerId,
    following_id: followingId,
  });
  if (error) throw error;
  return true;
}
