"use client";

import { useCallback, useEffect, useState } from "react";
import { getRank, loadXp, refreshXp, type XpState } from "@/lib/xp";
import { useAuth } from "@/components/auth/AuthProvider";

export default function ProfileXpBar() {
  const { user } = useAuth();
  const [xpState, setXpState] = useState<XpState>({ xp: 0, packsCompleted: 0 });

  const refreshHudXp = useCallback(() => {
    setXpState(loadXp());
  }, []);

  useEffect(() => {
    void refreshXp().then((state) => setXpState(state));
    const onXp = () => refreshHudXp();
    window.addEventListener("imitation-star:xp", onXp);
    return () => {
      window.removeEventListener("imitation-star:xp", onXp);
    };
  }, [user?.id, refreshHudXp]);

  const rank = getRank(xpState.xp);
  const fillPct = Math.round(rank.progress * 100);

  return (
    <div
      className="profile-page__xp"
      aria-label={`${rank.label}, ${xpState.xp} XP, ${fillPct}% to next rank`}
    >
      <div className="profile-page__xp-copy">
        <p className="profile-page__xp-rank">{rank.label}</p>
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
