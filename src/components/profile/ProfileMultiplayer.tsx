"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CollabDetail } from "@/lib/types/collab";
import {
  acceptCollabInvite,
  collabErrorMessage,
  declineCollabInvite,
  getCollabDetail,
  getMyAssignments,
  getPendingInvitesForUser,
  getWaitingAssignees,
  listCreatedCollabs,
  listParticipantCollabs,
  publishCollabDub,
} from "@/lib/collabDubs";
import { formatHandle } from "@/lib/handle";
import ConfirmDialog from "@/components/ConfirmDialog";
import CollabPublishPreview from "@/components/collab/CollabPublishPreview";

type ProfileMultiplayerProps = {
  userId: string;
};

function statusLabel(status: CollabDetail["status"]): string {
  switch (status) {
    case "inviting":
      return "Waiting on invites";
    case "in_progress":
      return "In progress";
    case "ready":
      return "Ready to publish";
    case "published":
      return "Published";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function CollabProgressCard({
  collab,
  userId,
  isCreator,
  onRefresh,
}: {
  collab: CollabDetail;
  userId: string;
  isCreator: boolean;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [declineConfirm, setDeclineConfirm] = useState(false);

  const pendingInvite = getPendingInvitesForUser(collab, userId);
  const waiting = getWaitingAssignees(collab);
  const myAssignments = getMyAssignments(collab, userId);
  const myPending = myAssignments.filter((a) => a.status !== "submitted");

  async function handleAccept() {
    setBusy(true);
    setError(null);
    try {
      await acceptCollabInvite(collab.id, userId);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept invite.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    setBusy(true);
    setError(null);
    try {
      await declineCollabInvite(collab.id, userId);
      setDeclineConfirm(false);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not decline invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="collab-card">
      <div className="collab-card__header">
        <div>
          <p className="collab-card__pack">{collab.packTitle}</p>
          <p className="collab-card__status">{statusLabel(collab.status)}</p>
        </div>
        {!pendingInvite && myPending.length > 0 ? (
          <Link
            href={`/collab/${collab.id}`}
            className="brutal-btn brutal-btn-sm bg-es-pollen"
          >
            Record lines
          </Link>
        ) : null}
        {isCreator && collab.status === "ready" ? (
          <button
            type="button"
            className="brutal-btn brutal-btn-sm bg-es-green"
            onClick={() => setShowPublish(true)}
          >
            Preview &amp; publish
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="collab-card__error" role="alert">
          {error}
        </p>
      ) : null}

      {pendingInvite ? (
        <div className="collab-card__invite">
          <p>You&apos;ve been invited to this collab dub.</p>
          <div className="collab-card__invite-actions">
            <button
              type="button"
              className="brutal-btn brutal-btn-sm bg-es-green"
              disabled={busy}
              onClick={() => void handleAccept()}
            >
              Accept
            </button>
            <button
              type="button"
              className="brutal-btn brutal-btn-sm"
              disabled={busy}
              onClick={() => setDeclineConfirm(true)}
            >
              Decline
            </button>
          </div>
        </div>
      ) : null}

      <ul className="collab-card__lines">
        {collab.assignments.map((assignment) => (
          <li
            key={assignment.id}
            className={`collab-card__line ${assignment.status === "submitted" ? "collab-card__line--done" : ""}`}
          >
            <span className="collab-card__line-speaker">
              {assignment.line.speaker}
            </span>
            <span className="collab-card__line-text">{assignment.line.text}</span>
            <span className="collab-card__line-assignee">
              {assignment.assignee?.displayName ?? "Unknown"}
              {assignment.assignee?.handle
                ? ` · ${formatHandle(assignment.assignee.handle)}`
                : ""}
            </span>
            <span className="collab-card__line-state">
              {assignment.status === "submitted" ? "Submitted" : "Waiting"}
            </span>
          </li>
        ))}
      </ul>

      {waiting.length > 0 ? (
        <p className="collab-card__waiting">
          Waiting on:{" "}
          {waiting
            .map((w) => w.assignee?.displayName ?? "Unknown")
            .filter((name, i, arr) => arr.indexOf(name) === i)
            .join(", ")}
        </p>
      ) : collab.status !== "published" ? (
        <p className="collab-card__waiting collab-card__waiting--done">
          All lines submitted
        </p>
      ) : null}

      {collab.status === "published" && collab.publishedPostId ? (
        <Link
          href={`/forum?post=${encodeURIComponent(collab.publishedPostId)}`}
          className="collab-card__forum-link"
        >
          View on forum →
        </Link>
      ) : null}

      {declineConfirm ? (
        <ConfirmDialog
          title="Decline this invite?"
          message="You won't be able to record lines for this collab unless the creator reassigns you."
          confirmLabel="Decline"
          tone="red"
          busy={busy}
          fixed
          onConfirm={() => void handleDecline()}
          onCancel={() => {
            if (!busy) setDeclineConfirm(false);
          }}
        />
      ) : null}

      {showPublish ? (
        <CollabPublishPreview
          collab={collab}
          creatorId={userId}
          onClose={() => setShowPublish(false)}
          onPublished={() => {
            setShowPublish(false);
            onRefresh();
          }}
        />
      ) : null}
    </article>
  );
}

export default function ProfileMultiplayer({ userId }: ProfileMultiplayerProps) {
  const [created, setCreated] = useState<CollabDetail[]>([]);
  const [joined, setJoined] = useState<CollabDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [createdRows, joinedRows] = await Promise.all([
        listCreatedCollabs(userId),
        listParticipantCollabs(userId),
      ]);
      setCreated(createdRows);
      setJoined(joinedRows);
    } catch (e) {
      setError(collabErrorMessage(e) || "Could not load collabs.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="profile-posts__empty">Loading multiplayer dubs…</p>;
  }

  return (
    <div className="profile-multiplayer">
      {error ? (
        <p className="profile-posts__error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="profile-multiplayer__section">
        <h3 className="profile-multiplayer__heading">Dubs you created</h3>
        {created.length === 0 ? (
          <p className="profile-posts__empty">
            Start a multiplayer dub from Play → Multiplayer.
          </p>
        ) : (
          <div className="profile-multiplayer__list">
            {created.map((collab) => (
              <CollabProgressCard
                key={collab.id}
                collab={collab}
                userId={userId}
                isCreator
                onRefresh={() => void load()}
              />
            ))}
          </div>
        )}
      </section>

      <section className="profile-multiplayer__section">
        <h3 className="profile-multiplayer__heading">Dubs you joined</h3>
        {joined.length === 0 ? (
          <p className="profile-posts__empty">
            Accept a collab invite to record your assigned lines.
          </p>
        ) : (
          <div className="profile-multiplayer__list">
            {joined.map((collab) => (
              <CollabProgressCard
                key={collab.id}
                collab={collab}
                userId={userId}
                isCreator={false}
                onRefresh={() => void load()}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
