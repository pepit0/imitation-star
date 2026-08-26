"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import CollabPageClient from "./CollabPageClient";

export default function CollabPage() {
  const params = useParams();
  const collabId = typeof params.id === "string" ? params.id : "";

  if (!collabId) {
    return (
      <div className="collab-page">
        <p className="collab-page__error">Invalid collab link.</p>
      </div>
    );
  }

  return <CollabPageClient collabId={collabId} />;
}
