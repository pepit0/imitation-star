"use client";

import {
  isCommunityPack,
  type PackRankLookup,
} from "@/lib/social/packRankings";
import type { DubPack, SortOption } from "@/lib/types";
import PackCard from "./PackCard";

interface PackBrowserProps {
  packs: DubPack[];
  sort: SortOption;
  search: string;
  hideNsfw: boolean;
  rankById?: PackRankLookup;
  onSortChange: (sort: SortOption) => void;
  onSearchChange: (search: string) => void;
  onHideNsfwChange: (hide: boolean) => void;
  onSelectPack: (pack: DubPack) => void;
  onDeletePack?: (pack: DubPack) => void | Promise<void>;
  currentUserId?: string;
  onBack: () => void;
  title?: string;
}

function canDeletePack(pack: DubPack, userId: string | undefined): boolean {
  if (pack.source === "user") return true;
  if (pack.source === "cloud" && userId && pack.ownerId === userId) return true;
  return false;
}

export default function PackBrowser({
  packs,
  sort,
  search,
  hideNsfw,
  onSortChange,
  onSearchChange,
  onHideNsfwChange,
  onSelectPack,
  onDeletePack,
  currentUserId,
  rankById,
  onBack,
  title,
}: PackBrowserProps) {
  return (
    <div className="flex flex-col h-full bg-es-cream text-black">
      <div className="brutal-border border-t-0 border-x-0 bg-es-brand text-white px-4 py-3 flex items-center gap-3 overflow-visible">
        <button
          type="button"
          onClick={onBack}
          className="brutal-btn brutal-btn-sm bg-white text-black px-3 py-1.5 text-xs shrink-0"
        >
          ← Back
        </button>
        <h2 className="font-title text-sm sm:text-base uppercase tracking-wide flex-1">
          {title ?? "Dub Packs"}
        </h2>
        <span className="text-xs bg-black text-es-phosphor px-2 py-1">
          {packs.length} packs
        </span>
      </div>

      <div className="p-3 sm:p-4 space-y-3 border-b-3 border-black shrink-0">
        <input
          type="search"
          placeholder="Search by title, creator, or tag..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="retro-input w-full px-3 py-2.5 text-sm"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSortChange("most-played")}
            className={`brutal-btn brutal-btn-sm px-3 py-1.5 text-xs ${
              sort === "most-played"
                ? "bg-es-indigo text-white"
                : "bg-white text-black"
            }`}
          >
            Top Ranking
          </button>
          <button
            type="button"
            onClick={() => onSortChange("newest")}
            className={`brutal-btn brutal-btn-sm px-3 py-1.5 text-xs ${
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
              onChange={(e) => onHideNsfwChange(e.target.checked)}
              className="w-4 h-4 accent-es-orange"
            />
            Hide NSFW
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {packs.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No packs found. Try a different search.
          </p>
        )}
        <div className="pack-card-grid pack-card-grid--dense">
          {packs.map((pack) => {
            const ranked =
              rankById && isCommunityPack(pack) ? rankById.get(pack.id) : null;
            return (
              <PackCard
                key={pack.id}
                pack={pack}
                compact
                onSelect={onSelectPack}
                onDelete={onDeletePack}
                deletable={canDeletePack(pack, currentUserId)}
                rank={ranked?.rank}
                aggregateStarCount={
                  ranked != null ? ranked.aggregateStarCount : undefined
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
