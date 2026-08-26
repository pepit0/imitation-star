"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import CollabRecordingStudio from "@/components/collab/CollabRecordingStudio";
import { getCollabDetail } from "@/lib/collabDubs";
import type { CollabDetail } from "@/lib/types/collab";

type CollabPageClientProps = {
  collabId: string;
};

export default function CollabPageClient({ collabId }: CollabPageClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [collab, setCollab] = useState<CollabDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await getCollabDetail(collabId);
      if (!detail) {
        setError("Collab not found.");
        setCollab(null);
        return;
      }
      setCollab(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load collab.");
    } finally {
      setLoading(false);
    }
  }, [collabId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=/collab/${collabId}`);
      return;
    }
    void load();
  }, [authLoading, user, collabId, router, load]);

  if (authLoading || loading) {
    return (
      <div className="collab-page">
        <p className="collab-page__status">Loading collab…</p>
      </div>
    );
  }

  if (error || !collab || !user) {
    return (
      <div className="collab-page">
        <p className="collab-page__error" role="alert">
          {error ?? "Collab unavailable."}
        </p>
      </div>
    );
  }

  const invite = collab.invites.find((i) => i.userId === user.id);
  const isCreator = collab.creatorId === user.id;
  const myAssignments = collab.assignments.filter(
    (a) => a.assigneeId === user.id
  );

  if (!isCreator && invite?.status === "pending") {
    return (
      <div className="collab-page">
        <p className="collab-page__status">
          Accept the invite on your profile → Multiplayer tab before recording.
        </p>
      </div>
    );
  }

  if (!isCreator && invite?.status === "declined") {
    return (
      <div className="collab-page">
        <p className="collab-page__status">You declined this collab invite.</p>
      </div>
    );
  }

  if (myAssignments.length === 0) {
    return (
      <div className="collab-page">
        <p className="collab-page__status">
          {isCreator
            ? "Track progress and publish from Profile → Multiplayer when all lines are in."
            : "You have no lines assigned in this collab."}
        </p>
      </div>
    );
  }

  return (
    <div className="collab-page">
      <CollabRecordingStudio
        collab={collab}
        userId={user.id}
        onBack={() => router.push("/profile")}
        onSubmitted={() => void load()}
      />
    </div>
  );
}
