"use client";

import Link from "next/link";
import AppBackButton from "@/components/AppBackButton";

type CollabSentProps = {
  packTitle: string;
  collabId?: string | null;
  onBackToMenu: () => void;
};

export default function CollabSent({
  packTitle,
  collabId,
  onBackToMenu,
}: CollabSentProps) {
  return (
    <div className="collab-sent">
      <p className="collab-sent__eyebrow">Invites sent</p>
      <h2 className="collab-sent__title">{packTitle}</h2>
      <p className="collab-sent__message">
        Your multiplayer dub is live. Track progress from your profile, or start
        recording your assigned lines.
      </p>
      <div className="collab-sent__actions">
        {collabId ? (
          <Link href={`/collab/${collabId}`} className="brutal-btn bg-es-pollen">
            Record my lines
          </Link>
        ) : null}
        <Link href="/profile?tab=multiplayer" className="brutal-btn bg-es-brand text-white">
          Go to Profile → Multiplayer
        </Link>
        <AppBackButton onClick={onBackToMenu}>← Menu</AppBackButton>
      </div>
    </div>
  );
}
