"use client";

import { useCallback, useEffect, useState } from "react";
import type { CollabDetail } from "@/lib/types/collab";
import {
  acceptCollabInvite,
  collabErrorMessage,
  declineCollabInvite,
  getPendingInvitesForUser,
  listPendingInviteCollabs,
} from "@/lib/collabDubs";
import { formatHandle } from "@/lib/handle";
import ConfirmDialog from "@/components/ConfirmDialog";

type ProfileInvitesProps = {
  userId: string;
};

function InviteCard({
  collab,
  userId,
  onRefresh,
}: {
  collab: CollabDetail;
  userId: string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declineConfirm, setDeclineConfirm] = useState(false);
  const invite = getPendingInvitesForUser(collab, userId);

  if (!invite) return null;

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
          <p className="collab-card__status">Collab invite</p>
          {collab.creator ? (
            <p className="profile-invites__from">
              From {collab.creator.displayName}
              {collab.creator.handle
                ? ` · ${formatHandle(collab.creator.handle)}`
                : ""}
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="collab-card__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="collab-card__invite">
        <p>You&apos;ve been invited to record lines in this multiplayer dub.</p>
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
    </article>
  );
}

export default function ProfileInvites({ userId }: ProfileInvitesProps) {
  const [invites, setInvites] = useState<CollabDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listPendingInviteCollabs(userId);
      setInvites(rows);
    } catch (e) {
      setError(collabErrorMessage(e) || "Could not load invites.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="profile-posts__empty">Loading invites…</p>;
  }

  return (
    <div className="profile-invites">
      {error ? (
        <p className="profile-posts__error" role="alert">
          {error}
        </p>
      ) : null}
      {invites.length === 0 ? (
        <p className="profile-posts__empty">No pending invites right now.</p>
      ) : (
        <div className="profile-multiplayer__list">
          {invites.map((collab) => (
            <InviteCard
              key={collab.id}
              collab={collab}
              userId={userId}
              onRefresh={() => void load()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
