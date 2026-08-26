"use client";

import AppBackButton from "@/components/AppBackButton";
import { formatProgressSavedAt } from "@/lib/formatDate";
import type { PackProgressSummary } from "@/lib/packProgress";
import type { DubPack } from "@/lib/types";

type SinglePlayerResumePromptProps = {
  pack: DubPack;
  progress: PackProgressSummary;
  onResume: () => void;
  onRestart: () => void;
  onBack: () => void;
};

export default function SinglePlayerResumePrompt({
  pack,
  progress,
  onResume,
  onRestart,
  onBack,
}: SinglePlayerResumePromptProps) {
  const totalLines = pack.lines.length;

  return (
    <div className="single-resume">
      <p className="single-resume__eyebrow">Saved progress</p>
      <div className="single-resume__pack">
        <div
          className="single-resume__thumb overflow-hidden"
          style={{ backgroundColor: pack.thumbnailColor }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pack.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <h2 className="single-resume__title">{pack.title}</h2>
      </div>
      <dl className="single-resume__stats">
        <div className="single-resume__stat">
          <dt>Lines recorded</dt>
          <dd>
            {progress.recordedCount} of {totalLines}
          </dd>
        </div>
        <div className="single-resume__stat">
          <dt>Last saved</dt>
          <dd>{formatProgressSavedAt(progress.updatedAt)}</dd>
        </div>
      </dl>
      <p className="single-resume__message">
        Pick up where you left off, or start this pack over from the first line.
      </p>
      <div className="single-resume__actions">
        <button
          type="button"
          className="brutal-btn bg-es-brand text-white"
          onClick={onResume}
        >
          Resume
        </button>
        <button type="button" className="brutal-btn" onClick={onRestart}>
          Restart pack
        </button>
        <AppBackButton onClick={onBack}>← Back</AppBackButton>
      </div>
    </div>
  );
}
