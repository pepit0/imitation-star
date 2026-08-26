/** Supabase-shaped social types (mock store now; API later). */

export type UserProfile = {
  id: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  avatarIcon: string;
  followersCount: number;
  totalStars: number;
  /** Optional handle for display */
  handle?: string;
};

export type DubPostTake = {
  lineId: string;
  audioPath: string;
  startMs: number;
  endMs: number;
};

export type DubPost = {
  id: string;
  authorId: string;
  packId: string;
  packTitle: string;
  caption: string;
  starCount: number;
  createdAt: string;
  /** Optional cover for community posts (cloud packs / published takes). */
  packThumbnailUrl?: string;
  packThumbnailColor?: string;
  /** Recorded takes for forum playback (cloud posts). */
  takes?: DubPostTake[];
  videoUrl?: string;
  backingUrl?: string;
  /** Set when the author archived the post (hidden from forum feed). */
  archivedAt?: string;
};
