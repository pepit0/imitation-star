import type { UserProfile } from "@/lib/types/social";
import { formatHandle } from "@/lib/handle";
import {
  DEFAULT_AVATAR_ICON,
  normalizeAvatarIcon,
  resolveAvatarColor,
} from "@/lib/profileIcons";

/** Row shape for public.profiles */
export type ProfileRow = {
  id: string;
  display_name: string;
  bio: string;
  avatar_color: string;
  avatar_icon?: string | null;
  handle: string | null;
  followers_count: number;
  total_stars: number;
  xp?: number | null;
  packs_completed?: number | null;
};

export const PROFILE_SELECT =
  "id, display_name, bio, avatar_color, avatar_icon, handle, followers_count, total_stars, xp, packs_completed";

export function profileFromRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    bio: row.bio,
    avatarColor: resolveAvatarColor(row.avatar_color),
    avatarIcon: normalizeAvatarIcon(row.avatar_icon ?? DEFAULT_AVATAR_ICON),
    handle: formatHandle(row.handle),
    followersCount: row.followers_count,
    totalStars: row.total_stars,
    xp: Math.max(0, Number(row.xp) || 0),
    packsCompleted: Math.max(0, Number(row.packs_completed) || 0),
  };
}
