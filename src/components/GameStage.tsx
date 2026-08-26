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
  listLocalPackIds,
  loadBrowsablePacks,
  removeCachedPack,
} from "@/lib/packStore";
import { downloadPackForOffline } from "@/lib/offline/packDownload";
import {
  countPendingDubs,
  flushPendingDubs,
} from "@/lib/offline/pendingDubs";
import {
  clearPackProgress,
  getPackProgressSummary,
  listPackProgressSummaries,
  refreshPackProgressSummary,
  type PackProgressSummary,
} from "@/lib/packProgress";
import { recordCommunityPackPlay } from "@/lib/cloudPacks";
import { useAuth } from "@/components/auth/AuthProvider";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import GameStageChrome from "./GameStageChrome";
import MainMenu from "./MainMenu";
import PackBrowser from "./PackBrowser";
import RecordingStudio from "./RecordingStudio";
import DubPreview from "./DubPreview";
import UploadPack from "./UploadPack";
import CollabLineAssignment from "./collab/CollabLineAssignment";
import CollabSent from "./collab/CollabSent";
import SinglePlayerResumePrompt from "./SinglePlayerResumePrompt";

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
  const { user, profile, loading: authLoading } = useAuth();
  const isNativeApp = useIsNativeApp();
  const online = useOnlineStatus();
  const [userPacks, setUserPacks] = useState<DubPack[]>([]);
  const [packsReady, setPacksReady] = useState(false);
  const [rankById, setRankById] = useState<PackRankLookup>(new Map());
  const [localPackIds, setLocalPackIds] = useState<Set<string>>(new Set());
  const [downloadingPackId, setDownloadingPackId] = useState<string | null>(
    null
  );
  const [downloadProgress, setDownloadProgress] = useState<string | null>(
    null
  );
  const [pendingUploadCount, setPendingUploadCount] = useState(0);
  const [uploadingPending, setUploadingPending] = useState(false);
  const [pendingFlushMessage, setPendingFlushMessage] = useState<string | null>(
    null
  );
  const [progressByPackId, setProgressByPackId] = useState<
    Map<string, PackProgressSummary>
  >(new Map());

  const progressCtx = useMemo(
    () => ({ userId: user?.id, online }),
    [user?.id, online]
  );

  const refreshPackProgress = useCallback(
    async (packIds: string[]) => {
      if (packIds.length === 1) {
        const packId = packIds[0]!;
        const summary = await refreshPackProgressSummary(packId, progressCtx);
        setProgressByPackId((prev) => {
          const next = new Map(prev);
          if (summary) next.set(packId, summary);
          else next.delete(packId);
          return next;
        });
        return;
      }

      const map = await listPackProgressSummaries(packIds, progressCtx);
      setProgressByPackId(map);
    },
    [progressCtx]
  );

  const allPacks = useMemo(() => {
    const localIds = new Set(userPacks.map((p) => p.id));
    const builtins = DUB_PACKS.filter((p) => !localIds.has(p.id)).map((p) => ({
      ...p,
      source: "builtin" as const,
      offlineReady: localIds.has(p.id),
    }));
    if (online) {
      return [...userPacks, ...builtins];
    }
    return userPacks;
  }, [userPacks, online]);

  const defaultPack = useMemo(() => {
    if (!allPacks.length) return null;
    if (initialPackId) {
      return allPacks.find((p) => p.id === initialPackId) ?? allPacks[0];
    }
    return (
      allPacks.find((p) => p.id === "krusty-krab") ??
      allPacks.find((p) => p.source !== "user") ??
      allPacks[0]
    );
  }, [allPacks, initialPackId]);

  const [phase, setPhase] = useState<GamePhase>("menu");
  const [mode, setMode] = useState<GameMode>(
    initialMode === "upload" ? "single" : (initialMode ?? "single")
  );
  const [selectedPack, setSelectedPack] = useState<DubPack | null>(null);
  const [recordings, setRecordings] = useState<RecordedLine[]>([]);
  const [xpSessionId, setXpSessionId] = useState<string | null>(null);
  const [sort, setSort] = useState<"newest" | "most-played">("most-played");
  const [search, setSearch] = useState("");
  const [hideNsfw, setHideNsfw] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [collabPack, setCollabPack] = useState<DubPack | null>(null);
  const [skipSavedProgress, setSkipSavedProgress] = useState(false);
  const [resumeProgress, setResumeProgress] = useState<PackProgressSummary | null>(
    null
  );
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadBrowsablePacks()
      .then(async (packs) => {
        if (cancelled) return;
        setUserPacks(packs);
        const ids = await listLocalPackIds();
        if (!cancelled) setLocalPackIds(ids);
        const ranked = await loadRankedCommunityPacks(packs);
        if (!cancelled) setRankById(buildPackRankLookup(ranked));
        if (!cancelled) {
          await refreshPackProgress(packs.map((p) => p.id));
        }
      })
      .finally(() => {
        if (!cancelled) setPacksReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [online, refreshPackProgress, user?.id]);

  const refreshPendingCount = useCallback(async () => {
    const count = await countPendingDubs();
    setPendingUploadCount(count);
  }, []);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    if (!user || !online) return;
    let cancelled = false;
    void (async () => {
      const count = await countPendingDubs();
      if (count < 1 || cancelled) return;
      setUploadingPending(true);
      const result = await flushPendingDubs(user.id);
      if (cancelled) return;
      await refreshPendingCount();
      if (result.uploaded > 0) {
        setPendingFlushMessage(
          `Uploaded ${result.uploaded} saved dub${result.uploaded === 1 ? "" : "s"} to the forum.`
        );
      } else if (result.failed > 0) {
        setPendingFlushMessage(
          result.errors[0] ?? "Some saved dubs could not upload."
        );
      }
      setUploadingPending(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, online, refreshPendingCount]);

  useEffect(() => {
    if (!packsReady) return;
    const ids = allPacks.map((p) => p.id);
    if (ids.length === 0) return;
    void refreshPackProgress(ids);
  }, [user?.id, online, packsReady, allPacks, refreshPackProgress]);

  const clearPlayQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("pack") && !url.searchParams.has("edit")) return;
    url.searchParams.delete("pack");
    url.searchParams.delete("edit");
    router.replace(`${url.pathname}${url.search}${url.hash}`);
  }, [router]);

  const enterSinglePlayer = useCallback(
    async (pack: DubPack, freshStart = false) => {
      clearPlayQuery();
      setSelectedPack(pack);
      setRecordings([]);
      setResumeProgress(null);
      void hydratePackLineReferences(pack).then((hydrated) => {
        setSelectedPack((current) =>
          current?.id === hydrated.id ? hydrated : current
        );
      });

      if (freshStart) {
        setSkipSavedProgress(true);
        setPhase("recording");
        return;
      }

      let summary = progressByPackId.get(pack.id) ?? null;
      if (!summary) {
        summary = await getPackProgressSummary(pack.id, progressCtx);
        if (summary) {
          setProgressByPackId((prev) => {
            const next = new Map(prev);
            next.set(pack.id, summary!);
            return next;
          });
        }
      }

      if (summary && summary.recordedCount > 0) {
        setResumeProgress(summary);
        setSkipSavedProgress(false);
        setPhase("single-resume");
      } else {
        setSkipSavedProgress(false);
        setPhase("recording");
      }
    },
    [clearPlayQuery, progressCtx, progressByPackId]
  );

  useEffect(() => {
    if (!packsReady || bootstrappedRef.current) return;
    // Wait for auth before honoring intent=upload (guest → login → return).
    if (initialMode === "upload" && authLoading) return;

    bootstrappedRef.current = true;

    if (initialPackId) {
      const found = allPacks.find((p) => p.id === initialPackId);
      if (found) {
        setMode("single");
        void enterSinglePlayer(found);
      }
      return;
    }

    if (initialMode === "upload") {
      if (user && !isNativeApp) {
        setMode("upload");
        setPhase("scene-preview");
      } else {
        setMode("single");
        setPhase("menu");
      }
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.has("intent")) {
          url.searchParams.delete("intent");
          router.replace(`${url.pathname}${url.search}${url.hash}`);
        }
      }
      return;
    }

    if (defaultPack) setSelectedPack(defaultPack);
  }, [
    packsReady,
    allPacks,
    initialPackId,
    initialMode,
    defaultPack,
    user,
    authLoading,
    isNativeApp,
    router,
    enterSinglePlayer,
  ]);

  const filteredPacks = useMemo(() => {
    let packs = allPacks;
    if (hideNsfw) packs = packs.filter((p) => !p.nsfw);
    packs = searchPacks(packs, search);
    return sortBrowsablePacks(packs, sort, rankById);
  }, [allPacks, sort, search, hideNsfw, rankById]);

  const handleSelectMode = useCallback(
    (selectedMode: GameMode) => {
      if (selectedMode === "upload" && isNativeApp) return;
      if (
        !online &&
        (selectedMode === "multiplayer" || selectedMode === "upload")
      ) {
        setPendingFlushMessage("That mode needs an internet connection.");
        return;
      }
      if (
        (selectedMode === "multiplayer" || selectedMode === "upload") &&
        !user
      ) {
        const next =
          selectedMode === "upload"
            ? "/play?intent=upload"
            : "/play";
        router.push(`/login?next=${encodeURIComponent(next)}`);
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
        const pack = selectedPack ?? defaultPack;
        if (pack) {
          if (mode !== "packs") setMode("single");
          void enterSinglePlayer(pack);
        } else {
          setPhase("recording");
        }
      }
    },
    [
      user,
      router,
      clearPlayQuery,
      isNativeApp,
      online,
      selectedPack,
      defaultPack,
      mode,
      enterSinglePlayer,
    ]
  );

  const handleSelectPack = useCallback(
    (pack: DubPack) => {
      if (mode === "multiplayer") {
        clearPlayQuery();
        setSelectedPack(pack);
        setRecordings([]);
        void hydratePackLineReferences(pack).then((hydrated) => {
          setSelectedPack((current) =>
            current?.id === hydrated.id ? hydrated : current
          );
          setCollabPack(hydrated);
          setPhase("collab-setup");
        });
        return;
      }

      if (mode !== "packs") setMode("single");
      void enterSinglePlayer(pack);
    },
    [mode, clearPlayQuery, enterSinglePlayer]
  );

  const handleDeletePack = useCallback(async (pack: DubPack) => {
    await deleteBrowsablePack(pack);
    setUserPacks((prev) => prev.filter((p) => p.id !== pack.id));
    setLocalPackIds((prev) => {
      const next = new Set(prev);
      next.delete(pack.id);
      return next;
    });
    setRankById((prev) => {
      if (!prev.has(pack.id)) return prev;
      const next = new Map(prev);
      next.delete(pack.id);
      return next;
    });
    setSelectedPack((current) => (current?.id === pack.id ? null : current));
    setCollabPack((current) => (current?.id === pack.id ? null : current));
  }, []);

  const handleDownloadPack = useCallback(async (pack: DubPack) => {
    if (!online || downloadingPackId) return;
    setDownloadingPackId(pack.id);
    setDownloadProgress("Starting…");
    try {
      const cached = await downloadPackForOffline(pack, setDownloadProgress);
      setUserPacks((prev) => {
        const without = prev.filter((p) => p.id !== cached.id);
        return [cached, ...without];
      });
      setLocalPackIds((prev) => new Set(prev).add(cached.id));
    } catch (e) {
      setPendingFlushMessage(
        e instanceof Error ? e.message : "Could not download pack."
      );
    } finally {
      setDownloadingPackId(null);
      setDownloadProgress(null);
    }
  }, [online, downloadingPackId]);

  const handleRemoveDownload = useCallback(async (pack: DubPack) => {
    await removeCachedPack(pack.id);
    setUserPacks((prev) => prev.filter((p) => p.id !== pack.id));
    setLocalPackIds((prev) => {
      const next = new Set(prev);
      next.delete(pack.id);
      return next;
    });
    if (online) {
      const packs = await loadBrowsablePacks();
      setUserPacks(packs);
    }
    setSelectedPack((current) => (current?.id === pack.id ? null : current));
  }, [online]);

  const handleUploadPending = useCallback(async () => {
    if (!user || !online || uploadingPending) return;
    setUploadingPending(true);
    setPendingFlushMessage(null);
    try {
      const result = await flushPendingDubs(user.id);
      await refreshPendingCount();
      if (result.uploaded > 0) {
        setPendingFlushMessage(
          `Uploaded ${result.uploaded} saved dub${result.uploaded === 1 ? "" : "s"}.`
        );
      } else if (result.failed > 0) {
        setPendingFlushMessage(result.errors[0] ?? "Upload failed.");
      } else {
        setPendingFlushMessage("No saved dubs to upload.");
      }
    } finally {
      setUploadingPending(false);
    }
  }, [user, online, uploadingPending, refreshPendingCount]);

  const handleUploadSaved = useCallback(
    (pack: DubPack) => {
      setUserPacks((prev) => {
        const without = prev.filter((p) => p.id !== pack.id);
        return [pack, ...without];
      });
      setMode("single");
      setRecordings([]);
      void enterSinglePlayer(pack, true);
    },
    [enterSinglePlayer]
  );

  const handleComplete = useCallback(
    (recs: RecordedLine[]) => {
      setRecordings(recs);
      setXpSessionId(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      setPhase("final-preview");

      const pack = selectedPack;
      if (!pack) return;
      void clearPackProgress(pack.id, { userId: user?.id, online });
      setProgressByPackId((prev) => {
        if (!prev.has(pack.id)) return prev;
        const next = new Map(prev);
        next.delete(pack.id);
        return next;
      });
      void recordCommunityPackPlay(pack).then((nextCount) => {
        if (nextCount == null) return;
        setUserPacks((prev) =>
          prev.map((p) =>
            p.id === pack.id ? { ...p, playCount: nextCount } : p
          )
        );
        setSelectedPack((current) =>
          current?.id === pack.id
            ? { ...current, playCount: nextCount }
            : current
        );
      });
    },
    [selectedPack, user?.id, online]
  );

  const handleBackToMenu = useCallback(() => {
    clearPlayQuery();
    setPhase("menu");
    setRecordings([]);
    setXpSessionId(null);
    setCollabPack(null);
    setMode("single");
  }, [clearPlayQuery]);

  const handleRestart = useCallback(() => {
    const pack = selectedPack;
    if (pack) {
      void clearPackProgress(pack.id, { userId: user?.id, online });
      setProgressByPackId((prev) => {
        if (!prev.has(pack.id)) return prev;
        const next = new Map(prev);
        next.delete(pack.id);
        return next;
      });
    }
    setRecordings([]);
    setXpSessionId(null);
    setResumeProgress(null);
    setSkipSavedProgress(true);
    setPhase("recording");
  }, [selectedPack, user?.id, online]);

  const handleResumeSinglePlayer = useCallback(() => {
    setSkipSavedProgress(false);
    setPhase("recording");
  }, []);

  const handleRestartSinglePlayer = useCallback(async () => {
    const pack = selectedPack;
    if (!pack) return;
    await clearPackProgress(pack.id, { userId: user?.id, online });
    setProgressByPackId((prev) => {
      if (!prev.has(pack.id)) return prev;
      const next = new Map(prev);
      next.delete(pack.id);
      return next;
    });
    setResumeProgress(null);
    setSkipSavedProgress(true);
    setPhase("recording");
  }, [selectedPack, user?.id, online]);

  const handleBackFromResume = useCallback(() => {
    setResumeProgress(null);
    if (mode === "packs") setPhase("pack-select");
    else setPhase("menu");
  }, [mode]);

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
  const activePackProgress = activePack
    ? progressByPackId.get(activePack.id)
    : undefined;
  const isPackMaker = phase === "scene-preview";
  const isCollabSetup = phase === "collab-setup" || phase === "collab-sent";
  const isSingleResume = phase === "single-resume";
  const isEndScreen = phase === "final-preview";
  // Only Create a Dub (UploadPack) may grow past the viewport and scroll.
  const isScrollStage = isPackMaker;
  const hideChrome =
    isNativeApp || isPackMaker || isEndScreen || isCollabSetup || isSingleResume;

  return (
    <div
      className={
        isScrollStage
          ? "w-full max-w-7xl mx-auto"
          : fill
            ? isNativeApp
              ? "w-full h-full min-h-0 max-w-none flex items-stretch justify-center"
              : "w-full h-full min-h-0 max-w-7xl mx-auto flex items-stretch justify-center pr-1 pb-1"
            : "w-full max-w-4xl mx-auto"
      }
    >
      <div
        id="game-stage-container"
        className={`flex flex-col w-full min-h-0 ${
          isNativeApp
            ? "border-0 shadow-none bg-es-brand"
            : "brutal-border brutal-shadow bg-es-dark"
        } ${isScrollStage ? "pm-stage" : "overflow-hidden"}`}
        style={
          isScrollStage
            ? undefined
            : fill
              ? { height: "100%", maxHeight: "100%" }
              : isCollabSetup || isSingleResume
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
          {phase === "menu" && activePack ? (
            <MainMenu
              packCount={allPacks.length}
              activePack={activePack}
              packProgress={activePackProgress}
              onSelectMode={handleSelectMode}
              online={online}
              pendingUploadCount={pendingUploadCount}
              uploadingPending={uploadingPending}
              pendingMessage={pendingFlushMessage}
              onUploadPending={() => void handleUploadPending()}
              onDismissPendingMessage={() => setPendingFlushMessage(null)}
            />
          ) : null}
          {phase === "menu" && !activePack ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-4 bg-es-cream">
              <p className="text-sm max-w-sm">
                {online
                  ? "No packs available yet. Open Community Packs to browse, or download packs for offline play."
                  : "No packs on this device. Connect to download packs for offline play."}
              </p>
              {online ? (
                <button
                  type="button"
                  className="brutal-btn"
                  onClick={() => handleSelectMode("packs")}
                >
                  Community Packs
                </button>
              ) : null}
            </div>
          ) : null}
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
              onDownloadPack={handleDownloadPack}
              onRemoveDownload={handleRemoveDownload}
              downloadedPackIds={localPackIds}
              downloadingPackId={downloadingPackId}
              downloadProgress={downloadProgress}
              progressByPackId={progressByPackId}
              online={online}
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
          {phase === "single-resume" && activePack && resumeProgress ? (
            <SinglePlayerResumePrompt
              pack={activePack}
              progress={resumeProgress}
              onResume={handleResumeSinglePlayer}
              onRestart={() => void handleRestartSinglePlayer()}
              onBack={handleBackFromResume}
            />
          ) : null}
          {phase === "recording" && activePack && mode !== "multiplayer" && (
            <RecordingStudio
              key={`${activePack.id}-${skipSavedProgress ? "fresh" : "resume"}`}
              pack={activePack}
              mode="single"
              skipSavedProgress={skipSavedProgress}
              onBack={() => {
                void refreshPackProgress([activePack.id]);
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
              online={online}
              onSavedOffline={refreshPendingCount}
              onRestart={handleRestart}
              onBackToMenu={handleBackToMenu}
            />
          )}
        </div>
      </div>
    </div>
  );
}
