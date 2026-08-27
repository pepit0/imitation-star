"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppBackButton from "@/components/AppBackButton";
import type { DubPack } from "@/lib/types";
import type { LineAssigneeMap } from "@/lib/types/collab";
import type { UserProfile } from "@/lib/types/social";
import {
  collabErrorMessage,
  createCollabDub,
  normalizeCollabPackLines,
} from "@/lib/collabDubs";
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
  const assignmentPack = useMemo(() => normalizeCollabPackLines(pack), [pack]);
  const [assignments, setAssignments] = useState<LineAssigneeMap>({});
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(
    () => new Map()
  );
  const [pickingLineId, setPickingLineId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignedCount = useMemo(
    () =>
      assignmentPack.lines.filter((line) => Boolean(assignments[line.id])).length,
    [assignmentPack.lines, assignments]
  );

  const allAssigned = assignedCount === assignmentPack.lines.length;

  const loadProfile = useCallback(
    async (userId: string) => {
      if (userId === creatorId && creatorProfile) {
        setProfiles((prev) => {
          if (prev.has(userId)) return prev;
          return new Map(prev).set(userId, creatorProfile);
        });
        return;
      }
      const profile = await getProfileById(userId);
      if (profile) {
        setProfiles((prev) => {
          if (prev.has(userId)) return prev;
          return new Map(prev).set(userId, profile);
        });
      }
    },
    [creatorId, creatorProfile]
  );

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
    setError(null);
  }

  async function handleSendInvites() {
    if (!allAssigned) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await createCollabDub({
        creatorId,
        pack: assignmentPack,
        assignments,
      });
      onCreated(detail.id);
    } catch (e) {
      setError(collabErrorMessage(e) || "Could not create collab.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="collab-setup">
      <div className="collab-setup__scroll">
        <div className="collab-setup__header">
          <AppBackButton onClick={onBack} />
          <div>
            <p className="collab-setup__eyebrow">Multiplayer collab</p>
            <h2 className="collab-setup__title">{assignmentPack.title}</h2>
            <p className="collab-setup__sub">
              Assign each line to a player. They&apos;ll get an invite to accept
              before recording.
            </p>
            <p className="collab-setup__progress" aria-live="polite">
              {assignedCount} of {assignmentPack.lines.length} lines assigned
            </p>
          </div>
        </div>

        {error ? (
          <p className="collab-setup__error" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="collab-setup__lines">
          {assignmentPack.lines.map((line, index) => {
            const assigneeId = assignments[line.id];
            const assignee = assigneeId ? profiles.get(assigneeId) : undefined;
            const isAssigned = Boolean(assigneeId);
            return (
              <li
                key={line.id}
                className={`collab-setup__line ${
                  !isAssigned ? "collab-setup__line--unassigned" : ""
                }`}
              >
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
      </div>

      <div className="collab-setup__footer">
        <button
          type="button"
          className="brutal-btn bg-es-brand text-white w-full collab-setup__send"
          disabled={!allAssigned || busy}
          onClick={() => void handleSendInvites()}
        >
          {busy
            ? "Sending invites…"
            : allAssigned
              ? "Send invites & continue"
              : `Assign ${assignmentPack.lines.length - assignedCount} more line${
                  assignmentPack.lines.length - assignedCount === 1 ? "" : "s"
                }`}
        </button>
      </div>

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
