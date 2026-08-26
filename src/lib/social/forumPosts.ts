import { listCloudDubPosts } from "@/lib/cloudPosts";
import { getStarredPostIds } from "@/lib/social/store";
import { SEED_POSTS } from "@/lib/social/seed";
import type { DubPost } from "@/lib/types/social";

export type ForumSort = "top" | "following" | "latest";

/** Merge cloud + seed posts and apply local star boosts. */
export async function loadMergedForumPosts(): Promise<DubPost[]> {
  const cloud = await listCloudDubPosts().catch(() => [] as DubPost[]);
  const cloudIds = new Set(cloud.map((p) => p.id));
  const merged = [
    ...cloud,
    ...SEED_POSTS.filter((p) => !cloudIds.has(p.id)),
  ];
  const starred = getStarredPostIds();
  return merged.map((p) => ({
    ...p,
    starCount: p.starCount + (starred.includes(p.id) ? 1 : 0),
  }));
}

/** Rank by star count (#1 = most stars). Ties break by newest first. */
export function computePostRankings(posts: DubPost[]): Map<string, number> {
  const sorted = [...posts].sort((a, b) => {
    if (b.starCount !== a.starCount) return b.starCount - a.starCount;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const ranks = new Map<string, number>();
  sorted.forEach((post, index) => ranks.set(post.id, index + 1));
  return ranks;
}

export function sortForumPosts(
  posts: DubPost[],
  sort: ForumSort,
  followingIds: Set<string>
): DubPost[] {
  const byNewest = (a: DubPost, b: DubPost) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  if (sort === "following") {
    return posts
      .filter((p) => followingIds.has(p.authorId))
      .sort(byNewest);
  }

  if (sort === "top") {
    return [...posts].sort((a, b) => {
      if (b.starCount !== a.starCount) return b.starCount - a.starCount;
      return byNewest(a, b);
    });
  }

  return [...posts].sort(byNewest);
}

export function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
