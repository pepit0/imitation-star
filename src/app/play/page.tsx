"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import GameStage from "@/components/GameStage";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { getRank, loadXp, type XpState } from "@/lib/xp";

const QUESTS = [
  "Pick a pack",
  "Record every line",
  "Share a take",
] as const;

function PlayContent() {
  const searchParams = useSearchParams();
  const packId = searchParams.get("pack") ?? undefined;
  const intent = searchParams.get("intent");
  const initialMode =
    intent === "upload" ? ("upload" as const) : ("single" as const);
  const isNativeApp = useIsNativeApp();
  const [xpState, setXpState] = useState<XpState>({ xp: 0, packsCompleted: 0 });

  const refreshXp = useCallback(() => {
    setXpState(loadXp());
  }, []);

  useEffect(() => {
    refreshXp();
    const onXp = () => refreshXp();
    window.addEventListener("imitation-star:xp", onXp);
    window.addEventListener("storage", onXp);
    return () => {
      window.removeEventListener("imitation-star:xp", onXp);
      window.removeEventListener("storage", onXp);
    };
  }, [refreshXp]);

  const rank = getRank(xpState.xp);
  const fillPct = Math.round(rank.progress * 100);

  return (
    <div
      className={`h-full min-h-0 overflow-hidden flex flex-col ${
        isNativeApp ? "bg-es-brand" : "bg-es-cream"
      }`}
    >
      {!isNativeApp ? (
        <div className="play-hud shrink-0">
          <div className="play-hud__identity">
            <p className="play-hud__eyebrow">Session</p>
            <p className="play-hud__name">{rank.title}</p>
          </div>
          <div
            className="play-hud__xp"
            aria-label={`${xpState.xp} XP, ${fillPct}% to next rank`}
          >
            <div className="play-hud__xp-track">
              <div
                className="play-hud__xp-fill"
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <span className="play-hud__xp-label">{xpState.xp} XP</span>
          </div>
          <ul className="play-hud__quests">
            {QUESTS.map((q, i) => {
              const done =
                (i === 0 && xpState.packsCompleted > 0) ||
                (i === 1 && xpState.packsCompleted > 0);
              return (
                <li
                  key={q}
                  className={done ? "play-hud__quest--done" : undefined}
                >
                  <span aria-hidden="true">{done ? "◆" : "◇"}</span>
                  {q}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div
        className={
          isNativeApp
            ? "flex-1 min-h-0 overflow-hidden"
            : "flex-1 min-h-0 overflow-y-auto flex items-start justify-center p-2 sm:p-3"
        }
      >
        <GameStage fill initialPackId={packId} initialMode={initialMode} />
      </div>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full overflow-hidden bg-es-cream flex items-center justify-center">
          <p className="text-lg animate-pulse">Loading...</p>
        </div>
      }
    >
      <PlayContent />
    </Suspense>
  );
}
