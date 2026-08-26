"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildPackRankLookup,
  loadRankedCommunityPacks,
  sortBrowsablePacks,
  type PackRankLookup,
} from "@/lib/social/packRankings";
import type { DubPack, GameMode, GamePhase, RecordedLine } from "@/lib/types";
import { DUB_PACKS, searchPacks } from "@/lib/packs";
import {
  deleteBrowsablePack,
  hydratePackLineReferences,
  loadBrowsablePacks,
} from "@/lib/packStore";
import { useAuth } from "@/components/auth/AuthProvider";
import GameStageChrome from "./GameStageChrome";
import MainMenu from "./MainMenu";
import PackBrowser from "./PackBrowser";
import RecordingStudio from "./RecordingStudio";
import DubPreview from "./DubPreview";
import UploadPack from "./UploadPack";
import CollabLineAssignment from "./collab/CollabLineAssignment";
import CollabSent from "./collab/CollabSent";

interface GameStageProps {
  initialPackId?: string;
  initialMode?: GameMode;
  fill?: boolean;
}

export default function GameStage({
  initialPackId,
  initialMode,
  fill = false,
}: GameStageProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [userPacks, setUserPacks] = useState<DubPack[]>([]);
  const [packsReady, setPacksReady] = useState(false);
  const [rankById, setRankById] = useState<PackRankLookup>(new Map());

  const allPacks = useMemo(
    () => [
      ...userPacks,
      ...DUB_PACKS.map((p) => ({ ...p, source: "builtin" as const })),
    ],
    [userPacks]
  );

  const defaultPack = useMemo(() => {
    if (initialPackId) {
      return allPacks.find((p) => p.id === initialPackId) ?? allPacks[0];
    }
    return (
      allPacks.find((p) => p.id === "krusty-krab") ??
      allPacks.find((p) => p.source !== "user") ??
      allPacks[0]
    );
  }, [allPacks, initialPackId]);

  const [phase, setPhase] = useState<GamePhase>(() => {
    if (initialPackId) return "recording";
    return "menu";
  });
  const [mode, setMode] = useState<GameMode>(initialMode ?? "single");
  const [selectedPack, setSelectedPack] = useState<DubPack | null>(null);
  const [recordings, setRecordings] = useState<RecordedLine[]>([]);
  const [xpSessionId, setXpSessionId] = useState<string | null>(null);
  const [sort, setSort] = useState<"newest" | "most-played">("most-played");
  const [search, setSearch] = useState("");
  const [hideNsfw, setHideNsfw] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [collabPack, setCollabPack] = useState<DubPack | null>(null);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadBrowsablePacks()
      .then(async (packs) => {
        if (cancelled) return;
        setUserPacks(packs);
        const ranked = await loadRankedCommunityPacks(packs);
        if (!cancelled) setRankById(buildPackRankLookup(ranked));
      })
      .finally(() => {
        if (!cancelled) setPacksReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!packsReady || bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    if (initialPackId) {
      const found = allPacks.find((p) => p.id === initialPackId);
      if (found) {
        setSelectedPack(found);
        setPhase("recording");
        setMode("single");
        void hydratePackLineReferences(found).then((hydrated) => {
          setSelectedPack((current) =>
            current?.id === hydrated.id ? hydrated : current
          );
        });
      }
      return;
    }
    if (defaultPack) setSelectedPack(defaultPack);
  }, [packsReady, allPacks, initialPackId, defaultPack]);

  const clearPlayQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("pack") && !url.searchParams.has("edit")) return;
    url.searchParams.delete("pack");
    url.searchParams.delete("edit");
    router.replace(`${url.pathname}${url.search}${url.hash}`);
  }, [router]);

  const filteredPacks = useMemo(() => {
    let packs = allPacks;
    if (hideNsfw) packs = packs.filter((p) => !p.nsfw);
    packs = searchPacks(packs, search);
    return sortBrowsablePacks(packs, sort, rankById);
  }, [allPacks, sort, search, hideNsfw, rankById]);

  const handleSelectMode = useCallback(
    (selectedMode: GameMode) => {
      if (selectedMode === "multiplayer" && !user) {
        router.push("/login?next=/play");
        return;
      }
      clearPlayQuery();
      setMode(selectedMode);
      setCollabPack(null);
      if (selectedMode === "packs" || selectedMode === "multiplayer") {
        setPhase("pack-select");
      } else if (selectedMode === "upload") {
        setPhase("scene-preview");
      } else {
        setPhase("recording");
      }
    },
    [user, router, clearPlayQuery]
  );

  const handleSelectPack = useCallback(
    (pack: DubPack) => {
      clearPlayQuery();
      setSelectedPack(pack);
      setRecordings([]);
      void hydratePackLineReferences(pack).then((hydrated) => {
        setSelectedPack((current) =>
          current?.id === hydrated.id ? hydrated : current
        );
        if (mode === "multiplayer") {
          setCollabPack(hydrated);
          setPhase("collab-setup");
        }
      });
      if (mode !== "multiplayer") {
        // Keep "packs" so Back returns to the community browser.
        if (mode !== "packs") setMode("single");
        setPhase("recording");
      }
    },
    [mode, clearPlayQuery]
  );

  const handleDeletePack = useCallback(async (pack: DubPack) => {
    await deleteBrowsablePack(pack);
    setUserPacks((prev) => prev.filter((p) => p.id !== pack.id));
    setRankById((prev) => {
      if (!prev.has(pack.id)) return prev;
      const next = new Map(prev);
      next.delete(pack.id);
      return next;
    });
    setSelectedPack((current) => (current?.id === pack.id ? null : current));
    setCollabPack((current) => (current?.id === pack.id ? null : current));
  }, []);

  const handleUploadSaved = useCallback((pack: DubPack) => {
    setUserPacks((prev) => {
      const without = prev.filter((p) => p.id !== pack.id);
      return [pack, ...without];
    });
    setSelectedPack(pack);
    setMode("single");
    setRecordings([]);
    setPhase("recording");
  }, []);

  const handleComplete = useCallback((recs: RecordedLine[]) => {
    setRecordings(recs);
    setXpSessionId(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setPhase("final-preview");
  }, []);

  const handleBackToMenu = useCallback(() => {
    clearPlayQuery();
    setPhase("menu");
    setRecordings([]);
    setXpSessionId(null);
    setCollabPack(null);
    setMode("single");
  }, [clearPlayQuery]);

  const handleRestart = useCallback(() => {
    setRecordings([]);
    setXpSessionId(null);
    setPhase("recording");
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = document.getElementById("game-stage-container");
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  const activePack = selectedPack ?? defaultPack;
  const isPackMaker = phase === "scene-preview";
  const isCollabSetup = phase === "collab-setup" || phase === "collab-sent";
  const isEndScreen = phase === "final-preview";
  // Only Create a Dub (UploadPack) may grow past the viewport and scroll.
  const isScrollStage = isPackMaker;
  const hideChrome = isPackMaker || isEndScreen || isCollabSetup;

  return (
    <div
      className={
        isScrollStage
          ? "w-full max-w-7xl mx-auto"
          : fill
            ? "w-full h-full min-h-0 max-w-7xl mx-auto flex items-stretch justify-center pr-1 pb-1"
            : "w-full max-w-4xl mx-auto"
      }
    >
      <div
        id="game-stage-container"
        className={`brutal-border brutal-shadow bg-es-dark flex flex-col w-full min-h-0 ${
          isScrollStage ? "pm-stage" : "overflow-hidden"
        }`}
        style={
          isScrollStage
            ? undefined
            : fill
              ? { height: "100%", maxHeight: "100%" }
              : isCollabSetup
                ? { height: "min(92vh, 920px)" }
                : { height: "min(80vh, 700px)" }
        }
      >
        {!hideChrome ? (
          <GameStageChrome
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
          />
        ) : null}

        <div className={isScrollStage ? "flex flex-col" : "flex-1 min-h-0 flex flex-col"}>
          {phase === "menu" && activePack && (
            <MainMenu
              packCount={allPacks.length}
              activePack={activePack}
              onSelectMode={handleSelectMode}
            />
          )}
          {phase === "pack-select" && (
            <PackBrowser
              packs={filteredPacks}
              sort={sort}
              search={search}
              hideNsfw={hideNsfw}
              rankById={rankById}
              onSortChange={setSort}
              onSearchChange={setSearch}
              onHideNsfwChange={setHideNsfw}
              onSelectPack={handleSelectPack}
              onDeletePack={handleDeletePack}
              currentUserId={user?.id}
              onBack={handleBackToMenu}
              title={mode === "multiplayer" ? "Choose a pack for collab" : undefined}
            />
          )}
          {phase === "collab-setup" && collabPack && user ? (
            <CollabLineAssignment
              pack={collabPack}
              creatorId={user.id}
              creatorProfile={profile}
              onBack={() => setPhase("pack-select")}
              onCreated={() => setPhase("collab-sent")}
            />
          ) : null}
          {phase === "collab-sent" && collabPack ? (
            <CollabSent
              packTitle={collabPack.title}
              onBackToMenu={handleBackToMenu}
            />
          ) : null}
          {phase === "scene-preview" && (
            <UploadPack
              key="new-pack"
              onBack={handleBackToMenu}
              onSaved={handleUploadSaved}
            />
          )}
          {phase === "recording" && activePack && mode !== "multiplayer" && (
            <RecordingStudio
              pack={activePack}
              mode="single"
              onBack={() => {
                if (mode === "packs") setPhase("pack-select");
                else setPhase("menu");
              }}
              onComplete={handleComplete}
            />
          )}
          {phase === "final-preview" && activePack && (
            <DubPreview
              pack={activePack}
              recordings={recordings}
              xpSessionId={xpSessionId}
              onRestart={handleRestart}
              onBackToMenu={handleBackToMenu}
            />
          )}
        </div>
      </div>
    </div>
  );
}
