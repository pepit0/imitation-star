"use client";

import { createClient } from "@/lib/supabase/client";
import { profileFromRow, PROFILE_SELECT, type ProfileRow } from "@/lib/supabase/profile";
import type { UserProfile } from "@/lib/types/social";
import { getFollowingUserIds } from "@/lib/follows";

export async function searchProfiles(
  query: string,
  options?: {
    followingOnly?: boolean;
    currentUserId?: string;
    limit?: number;
  }
): Promise<UserProfile[]> {
  const trimmed = query.trim();
  const limit = options?.limit ?? 20;
  const supabase = createClient();

  let followingSet: Set<string> | null = null;
  if (options?.followingOnly && options.currentUserId) {
    const ids = await getFollowingUserIds(options.currentUserId);
    followingSet = new Set(ids);
    if (followingSet.size === 0) return [];
  }

  let dbQuery = supabase
    .from("profiles")
    .select(
      PROFILE_SELECT
    )
    .limit(limit);

  if (trimmed) {
    const pattern = `%${trimmed.replace(/[%_]/g, "")}%`;
    dbQuery = dbQuery.or(
      `handle.ilike.${pattern},display_name.ilike.${pattern}`
    );
  }

  if (followingSet) {
    dbQuery = dbQuery.in("id", [...followingSet]);
  }

  if (options?.currentUserId) {
    dbQuery = dbQuery.neq("id", options.currentUserId);
  }

  const { data, error } = await dbQuery;
  if (error) throw error;

  return ((data as ProfileRow[] | null) ?? []).map(profileFromRow);
}

export async function getProfileById(
  userId: string
): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      PROFILE_SELECT
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return profileFromRow(data as ProfileRow);
}
