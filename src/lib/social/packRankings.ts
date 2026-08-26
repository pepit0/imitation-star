import type { DubPost } from "@/lib/types/social";
import type { DubPack } from "@/lib/types";
import { loadMergedForumPosts } from "@/lib/social/forumPosts";

export type PackStarAggregate = {
  totalStars: number;
  latestPostAt: string | null;
};

/** Sum forum post stars per pack_id (non-archived posts). */
export function aggregatePackStars(
  posts: DubPost[]
): Map<string, PackStarAggregate> {
  const map = new Map<string, PackStarAggregate>();

  for (const post of posts) {
    if (post.archivedAt) continue;
    const existing = map.get(post.packId) ?? {
      totalStars: 0,
      latestPostAt: null,
    };
    existing.totalStars += post.starCount;
    if (
      !existing.latestPostAt ||
      new Date(post.createdAt) > new Date(existing.latestPostAt)
    ) {
      existing.latestPostAt = post.createdAt;
    }
    map.set(post.packId, existing);
  }

  return map;
}

export type RankedCommunityPack = DubPack & {
  aggregateStarCount: number;
  rank: number;
};

/** Rank community packs by total post stars (#1 = most). */
export function computePackRankings(
  packs: Array<
    DubPack & {
      aggregateStarCount: number;
      latestPostAt: string | null;
    }
  >
): Map<string, number> {
  const sorted = [...packs].sort((a, b) => {
    if (b.aggregateStarCount !== a.aggregateStarCount) {
      return b.aggregateStarCount - a.aggregateStarCount;
    }
    const aDate = a.latestPostAt ?? a.createdAt;
    const bDate = b.latestPostAt ?? b.createdAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  const ranks = new Map<string, number>();
  sorted.forEach((pack, index) => ranks.set(pack.id, index + 1));
  return ranks;
}

export function isCommunityPack(pack: DubPack): boolean {
  return pack.source === "cloud" || pack.source === "user";
}

export type PackRankLookup = Map<
  string,
  { rank: number; aggregateStarCount: number }
>;

export function buildPackRankLookup(
  ranked: RankedCommunityPack[]
): PackRankLookup {
  const map: PackRankLookup = new Map();
  for (const pack of ranked) {
    map.set(pack.id, {
      rank: pack.rank,
      aggregateStarCount: pack.aggregateStarCount,
    });
  }
  return map;
}

export function sortBrowsablePacks(
  packs: DubPack[],
  sort: "newest" | "most-played",
  rankById: PackRankLookup
): DubPack[] {
  if (sort === "newest") {
    return [...packs].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const community = packs
    .filter(isCommunityPack)
    .sort(
      (a, b) =>
        (rankById.get(a.id)?.rank ?? Number.MAX_SAFE_INTEGER) -
        (rankById.get(b.id)?.rank ?? Number.MAX_SAFE_INTEGER)
    );
  const official = packs
    .filter((p) => p.source === "builtin")
    .sort((a, b) => b.playCount - a.playCount);

  return [...community, ...official];
}

/** Load posts and attach aggregate stars + rank to community packs. */
export async function loadRankedCommunityPacks(
  packs: DubPack[]
): Promise<RankedCommunityPack[]> {
  const community = packs.filter(isCommunityPack);
  const posts = await loadMergedForumPosts().catch(() => [] as DubPost[]);
  const aggregates = aggregatePackStars(posts);

  const withStars = community.map((pack) => {
    const agg = aggregates.get(pack.id);
    return {
      ...pack,
      aggregateStarCount: agg?.totalStars ?? 0,
      latestPostAt: agg?.latestPostAt ?? null,
    };
  });

  const ranks = computePackRankings(withStars);

  return withStars
    .map((pack) => ({
      ...pack,
      rank: ranks.get(pack.id) ?? community.length,
    }))
    .sort((a, b) => a.rank - b.rank);
}
