"use client";

import { useCallback, useEffect, useState } from "react";
import { getRank, loadXp, type XpState } from "@/lib/xp";

export default function ProfileXpBar() {
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
      className="profile-page__xp"
      aria-label={`${rank.title}, ${xpState.xp} XP, ${fillPct}% to next rank`}
    >
      <div className="profile-page__xp-copy">
        <p className="profile-page__xp-rank">{rank.title}</p>
        <div className="profile-page__xp-meta">
          <span>{xpState.xp} XP</span>
          {rank.nextMinXp != null ? (
            <span>{rank.nextMinXp - xpState.xp} to go</span>
          ) : (
            <span>Max rank</span>
          )}
        </div>
      </div>
      <div className="profile-page__xp-track">
        <div
          className="profile-page__xp-fill"
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}
