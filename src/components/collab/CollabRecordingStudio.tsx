"use client";

import { useCallback, useMemo, useState } from "react";
import type { CollabDetail } from "@/lib/types/collab";
import { dubPackFromSnapshot, submitLineTake } from "@/lib/collabDubs";
import type { RecordedLine } from "@/lib/types";
import RecordingStudio from "@/components/RecordingStudio";

type CollabRecordingStudioProps = {
  collab: CollabDetail;
  userId: string;
  onBack: () => void;
  onSubmitted: () => void;
};

export default function CollabRecordingStudio({
  collab,
  userId,
  onBack,
  onSubmitted,
}: CollabRecordingStudioProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myLineIds = useMemo(
    () =>
      collab.assignments
        .filter((a) => a.assigneeId === userId)
        .map((a) => a.lineId),
    [collab.assignments, userId]
  );

  const pendingLineIds = useMemo(
    () =>
      collab.assignments
        .filter((a) => a.assigneeId === userId && a.status !== "submitted")
        .map((a) => a.lineId),
    [collab.assignments, userId]
  );

  const recordingPack = useMemo(
    () => dubPackFromSnapshot(collab, pendingLineIds.length ? pendingLineIds : myLineIds),
    [collab, pendingLineIds, myLineIds]
  );

  const handleComplete = useCallback(
    async (recordings: RecordedLine[]) => {
      setBusy(true);
      setError(null);
      try {
        for (const rec of recordings) {
          await submitLineTake({
            collabId: collab.id,
            lineId: rec.lineId,
            assigneeId: userId,
            blob: rec.blob,
            durationMs: rec.durationMs,
          });
        }
        onSubmitted();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not submit takes.");
      } finally {
        setBusy(false);
      }
    },
    [collab.id, userId, onSubmitted]
  );

  if (pendingLineIds.length === 0) {
    return (
      <div className="collab-recording collab-recording--done">
        <p className="collab-recording__title">All your lines are submitted</p>
        <p className="collab-recording__sub">
          Waiting on other players — check progress on your profile.
        </p>
        <button type="button" className="brutal-btn brutal-btn-sm" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="collab-recording">
      {error ? (
        <p className="collab-recording__error" role="alert">
          {error}
        </p>
      ) : null}
      {busy ? (
        <p className="collab-recording__status">Uploading takes…</p>
      ) : null}
      <RecordingStudio
        pack={recordingPack}
        mode="multiplayer"
        onBack={onBack}
        onComplete={(recs) => void handleComplete(recs)}
      />
    </div>
  );
}
