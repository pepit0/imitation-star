"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DUB_PACKS, searchPacks } from "@/lib/packs";
import { deleteBrowsablePack, loadBrowsablePacks } from "@/lib/packStore";
import {
  buildPackRankLookup,
  isCommunityPack,
  loadRankedCommunityPacks,
  sortBrowsablePacks,
} from "@/lib/social/packRankings";
import type { DubPack, SortOption } from "@/lib/types";
import PackCard from "@/components/PackCard";
import { useAuth } from "@/components/auth/AuthProvider";

function canDeletePack(pack: DubPack, userId: string | undefined): boolean {
  if (pack.source === "user") return true;
  if (pack.source === "cloud" && userId && pack.ownerId === userId) return true;
  return false;
}

export default function PacksPage() {
  const { user } = useAuth();
  const [sort, setSort] = useState<SortOption>("most-played");
  const [search, setSearch] = useState("");
  const [hideNsfw, setHideNsfw] = useState(true);
  const [rankedCommunityPacks, setRankedCommunityPacks] = useState<
    Awaited<ReturnType<typeof loadRankedCommunityPacks>>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadBrowsablePacks()
      .then((packs) => loadRankedCommunityPacks(packs))
      .then((ranked) => {
        if (!cancelled) {
          setRankedCommunityPacks(ranked);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const officialPacks = useMemo(
    () => DUB_PACKS.map((p) => ({ ...p, source: "builtin" as const })),
    []
  );

  const rankById = useMemo(
    () => buildPackRankLookup(rankedCommunityPacks),
    [rankedCommunityPacks]
  );

  const allPacks = useMemo(
    () => [...rankedCommunityPacks, ...officialPacks],
    [rankedCommunityPacks, officialPacks]
  );

  const packs = useMemo((): DubPack[] => {
    let filtered: DubPack[] = allPacks;
    if (hideNsfw) filtered = filtered.filter((p) => !p.nsfw);
    filtered = searchPacks(filtered, search);
    return sortBrowsablePacks(filtered, sort, rankById);
  }, [allPacks, sort, search, hideNsfw, rankById]);

  const handleDeletePack = async (pack: DubPack) => {
    await deleteBrowsablePack(pack);
    setRankedCommunityPacks((prev) => prev.filter((p) => p.id !== pack.id));
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-es-cream">
      <section className="bg-es-brand text-white brutal-border border-t-0 border-x-0 px-4 py-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest mb-2">
            {allPacks.length} Packs / Community Library
          </p>
          <h1 className="text-3xl sm:text-4xl">Dub Packs</h1>
          <p className="text-sm mt-2 normal-case">
            Browse packs, or{" "}
            <Link href="/play" className="underline">
              open Play
            </Link>{" "}
            and upload your own video
            {user ? " to publish for everyone" : " (sign in to publish)"}.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <input
          type="search"
          placeholder="Search by title, creator, or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="retro-input w-full px-4 py-3 text-sm"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSort("most-played")}
            className={`brutal-btn brutal-btn-sm px-4 py-2 text-xs ${
              sort === "most-played"
                ? "bg-es-indigo text-white"
                : "bg-white text-black"
            }`}
          >
            Top Ranking
          </button>
          <button
            type="button"
            onClick={() => setSort("newest")}
            className={`brutal-btn brutal-btn-sm px-4 py-2 text-xs ${
              sort === "newest"
                ? "bg-es-indigo text-white"
                : "bg-white text-black"
            }`}
          >
            Newest
          </button>
          <label className="retro-filter ml-auto">
            <input
              type="checkbox"
              checked={hideNsfw}
              onChange={(e) => setHideNsfw(e.target.checked)}
              className="w-4 h-4 accent-es-orange"
            />
            Hide NSFW
          </label>
        </div>

        {loading ? (
          <p className="text-center text-gray-500 py-12 normal-case">
            Loading packs…
          </p>
        ) : (
          <div className="pack-card-grid">
            {packs.map((pack) => {
              const ranked = isCommunityPack(pack) ? rankById.get(pack.id) : null;
              return (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  href={`/play?pack=${pack.id}`}
                  onDelete={handleDeletePack}
                  deletable={canDeletePack(pack, user?.id)}
                  rank={ranked?.rank}
                  aggregateStarCount={
                    ranked != null ? ranked.aggregateStarCount : undefined
                  }
                />
              );
            })}
          </div>
        )}

        {!loading && packs.length === 0 && (
          <p className="text-center text-gray-500 py-12 normal-case">
            No packs match your search. Upload one from Play → Dub Your Own
            Video.
          </p>
        )}
      </div>
    </div>
  );
}

