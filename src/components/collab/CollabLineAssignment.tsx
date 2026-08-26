"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppBackButton from "@/components/AppBackButton";
import type { DubPack } from "@/lib/types";
import type { LineAssigneeMap } from "@/lib/types/collab";
import type { UserProfile } from "@/lib/types/social";
import { createCollabDub } from "@/lib/collabDubs";
import { getProfileById } from "@/lib/profileSearch";
import { formatHandle } from "@/lib/handle";
import UserPickerModal from "./UserPickerModal";

type CollabLineAssignmentProps = {
  pack: DubPack;
  creatorId: string;
  creatorProfile?: UserProfile | null;
  onBack: () => void;
  onCreated: (collabId: string) => void;
};

export default function CollabLineAssignment({
  pack,
  creatorId,
  creatorProfile,
  onBack,
  onCreated,
}: CollabLineAssignmentProps) {
  const [assignments, setAssignments] = useState<LineAssigneeMap>({});
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(
    () => new Map()
  );
  const [pickingLineId, setPickingLineId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAssigned = useMemo(
    () => pack.lines.every((line) => Boolean(assignments[line.id])),
    [pack.lines, assignments]
  );

  const loadProfile = useCallback(async (userId: string) => {
    if (profiles.has(userId)) return;
    if (userId === creatorId && creatorProfile) {
      setProfiles((prev) => new Map(prev).set(userId, creatorProfile));
      return;
    }
    const profile = await getProfileById(userId);
    if (profile) {
      setProfiles((prev) => new Map(prev).set(userId, profile));
    }
  }, [profiles, creatorId, creatorProfile]);

  useEffect(() => {
    for (const userId of Object.values(assignments)) {
      void loadProfile(userId);
    }
  }, [assignments, loadProfile]);

  function handleSelectUser(user: UserProfile) {
    if (!pickingLineId) return;
    setAssignments((prev) => ({ ...prev, [pickingLineId]: user.id }));
    setProfiles((prev) => new Map(prev).set(user.id, user));
    setPickingLineId(null);
  }

  async function handleSendInvites() {
    if (!allAssigned) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await createCollabDub({
        creatorId,
        pack,
        assignments,
      });
      onCreated(detail.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create collab.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="collab-setup">
      <div className="collab-setup__header">
        <AppBackButton onClick={onBack} />
        <div>
          <p className="collab-setup__eyebrow">Multiplayer collab</p>
          <h2 className="collab-setup__title">{pack.title}</h2>
          <p className="collab-setup__sub">
            Assign each line to a player. They&apos;ll get an invite to accept
            before recording.
          </p>
        </div>
      </div>

      {error ? (
        <p className="collab-setup__error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="collab-setup__lines">
        {pack.lines.map((line, index) => {
          const assigneeId = assignments[line.id];
          const assignee = assigneeId ? profiles.get(assigneeId) : undefined;
          return (
            <li key={line.id} className="collab-setup__line">
              <div className="collab-setup__line-meta">
                <span className="collab-setup__line-num">Line {index + 1}</span>
                <span className="collab-setup__speaker">{line.speaker}</span>
                <p className="collab-setup__text">{line.text}</p>
              </div>
              <div className="collab-setup__assignee">
                {assignee ? (
                  <span className="collab-setup__assignee-chip">
                    {assignee.displayName}
                    {assignee.handle ? (
                      <span className="collab-setup__assignee-handle">
                        {formatHandle(assignee.handle)}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="collab-setup__unassigned">Unassigned</span>
                )}
                <button
                  type="button"
                  className="brutal-btn brutal-btn-sm"
                  onClick={() => setPickingLineId(line.id)}
                >
                  {assignee ? "Change" : "Assign"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="brutal-btn bg-es-brand text-white w-full collab-setup__send"
        disabled={!allAssigned || busy}
        onClick={() => void handleSendInvites()}
      >
        {busy ? "Sending invites…" : "Send invites"}
      </button>

      {pickingLineId ? (
        <UserPickerModal
          currentUserId={creatorId}
          currentUserProfile={creatorProfile}
          onSelect={handleSelectUser}
          onClose={() => setPickingLineId(null)}
        />
      ) : null}
    </div>
  );
}
