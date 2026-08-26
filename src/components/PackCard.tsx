"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { DubPack } from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";

interface PackCardProps {
  pack: DubPack;
  onSelect?: (pack: DubPack) => void;
  onDelete?: (pack: DubPack) => void | Promise<void>;
  href?: string;
  compact?: boolean;
  /** When set, shows Delete for the signed-in owner. */
  deletable?: boolean;
  /** Forum-style rank badge for community packs (read-only). */
  rank?: number;
  /** Combined stars from all forum posts using this pack. */
  aggregateStarCount?: number;
}

function PackStarCount({ count }: { count: number }) {
  return (
    <span className="pack-card__stars" aria-label={`${count} total stars`}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="forum-star-icon forum-star-icon--on"
      >
        <path
          d="M12 2.5l2.9 6.1 6.6.7-5 4.6 1.4 6.5L12 16.8 6.1 20.4l1.4-6.5-5-4.6 6.6-.7L12 2.5z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
      <span>{count.toLocaleString()}</span>
    </span>
  );
}

function PackCover({
  pack,
  compact,
  rank,
  aggregateStarCount,
}: {
  pack: DubPack;
  compact?: boolean;
  rank?: number;
  aggregateStarCount?: number;
}) {
  const isRemoteHttp =
    pack.thumbnailUrl.startsWith("http://") ||
    pack.thumbnailUrl.startsWith("https://");
  const isBlob =
    pack.thumbnailUrl.startsWith("blob:") ||
    pack.thumbnailUrl.startsWith("data:");

  return (
    <div className="pack-card__cover">
      {rank != null ? (
        <span className="pack-card__rank" aria-label={`Rank #${rank}`}>
          #{rank}
        </span>
      ) : null}
      {isBlob || isRemoteHttp ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pack.thumbnailUrl}
          alt={`${pack.title} cover`}
          className="pack-card__cover-img"
        />
      ) : (
        <Image
          src={pack.thumbnailUrl}
          alt={`${pack.title} cover`}
          width={1280}
          height={800}
          className="pack-card__cover-img"
          sizes={compact ? "280px" : "(max-width: 640px) 100vw, 50vw"}
        />
      )}
      {pack.source === "user" ? (
        <span
          className="pack-card__badge pack-card__badge--community"
          style={{ background: "var(--es-blue)" }}
        >
          Yours
        </span>
      ) : null}
      {pack.source === "cloud" ? (
        <span
          className="pack-card__badge pack-card__badge--community"
          style={{ background: "var(--es-green)" }}
        >
          Community
        </span>
      ) : null}
      {pack.popular ? (
        <span className="pack-card__badge">Popular</span>
      ) : null}
      {pack.nsfw ? (
        <span className="pack-card__badge pack-card__badge-nsfw">NSFW</span>
      ) : null}
      {aggregateStarCount != null ? (
        <span
          className="pack-card__cover-stars"
          aria-label={`${aggregateStarCount} total stars from forum dubs`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="forum-star-icon forum-star-icon--on"
          >
            <path
              d="M12 2.5l2.9 6.1 6.6.7-5 4.6 1.4 6.5L12 16.8 6.1 20.4l1.4-6.5-5-4.6 6.6-.7L12 2.5z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
          <span>{aggregateStarCount.toLocaleString()}</span>
        </span>
      ) : null}
    </div>
  );
}

/** Choicer Voicer-style pack card: cover image on top, meta + actions below. */
export default function PackCard({
  pack,
  onSelect,
  onDelete,
  href,
  compact = false,
  deletable = false,
  rank,
  aggregateStarCount,
}: PackCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const showDelete = deletable && Boolean(onDelete);
  const className = `pack-card ${compact ? "pack-card--compact" : ""}`;

  const handleDeleteConfirm = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(pack);
      setConfirmDelete(false);
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Could not delete this pack."
      );
    } finally {
      setDeleting(false);
    }
  };

  const meta = (
    <>
      <PackCover
        pack={pack}
        compact={compact}
        rank={rank}
        aggregateStarCount={aggregateStarCount}
      />
      <div className="pack-card__body">
        <h3 className="pack-card__title">{pack.title}</h3>
        {!compact && pack.description ? (
          <p className="pack-card__desc">{pack.description}</p>
        ) : null}
        <dl className="pack-card__stats">
          <div>
            <dt>Clips</dt>
            <dd>{pack.clipCount}</dd>
          </div>
          {aggregateStarCount != null ? (
            <div>
              <dt>Stars</dt>
              <dd>
                <PackStarCount count={aggregateStarCount} />
              </dd>
            </div>
          ) : (
            <div>
              <dt>Plays</dt>
              <dd>{pack.playCount.toLocaleString()}</dd>
            </div>
          )}
        </dl>
        <p className="pack-card__credit">Creator: {pack.creator}</p>
        <div className="pack-card__actions">
          {href ? (
            <Link href={href} className="pack-card__play">
              Play now
            </Link>
          ) : (
            <button
              type="button"
              className="pack-card__play"
              onClick={() => onSelect?.(pack)}
            >
              Play now
            </button>
          )}
          {showDelete ? (
            <button
              type="button"
              className="pack-card__delete"
              disabled={deleting}
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
        {deleteError ? (
          <p className="pack-card__delete-error">{deleteError}</p>
        ) : null}
      </div>
      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this pack?"
          message="This permanently removes your pack from the community library. This cannot be undone."
          confirmLabel="Delete"
          tone="red"
          busy={deleting}
          fixed
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => {
            if (!deleting) setConfirmDelete(false);
          }}
        />
      ) : null}
    </>
  );

  return <article className={className}>{meta}</article>;
}
