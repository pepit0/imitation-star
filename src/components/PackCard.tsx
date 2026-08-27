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
  onDownload?: (pack: DubPack) => void | Promise<void>;
  onRemoveDownload?: (pack: DubPack) => void | Promise<void>;
  href?: string;
  compact?: boolean;
  /** When set, shows Delete for the signed-in owner. */
  deletable?: boolean;
  downloadable?: boolean;
  downloaded?: boolean;
  downloading?: boolean;
  downloadProgress?: string | null;
  /** Saved singleplayer progress on this pack. */
  progressSummary?: { recordedCount: number; lineIndex: number };
  /** Forum-style rank badge for community packs (read-only). */
  rank?: number;
  /** Combined stars from all forum posts using this pack. */
  aggregateStarCount?: number;
}

function PackStarCount({ count }: { count: number }) {
  return (
    <span className="pack-card__stars" aria-label={`${count} total stars`}>
      <span>{count.toLocaleString()}</span>
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
    </span>
  );
}

function PackCover({
  pack,
  compact,
  rank,
  aggregateStarCount,
  downloaded,
}: {
  pack: DubPack;
  compact?: boolean;
  rank?: number;
  aggregateStarCount?: number;
  downloaded?: boolean;
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
      {aggregateStarCount != null ? (
        <span
          className="pack-card__cover-stars"
          aria-label={`${aggregateStarCount} total stars from forum dubs`}
        >
          <span>{aggregateStarCount.toLocaleString()}</span>
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
        </span>
      ) : null}
      <div className="pack-card__badges">
        {pack.source === "user" ? (
          <span className="pack-card__badge pack-card__badge--yours">Yours</span>
        ) : null}
        {pack.source === "cloud" ? (
          <span className="pack-card__badge pack-card__badge--community">
            Community
          </span>
        ) : null}
        {downloaded || pack.source === "cached" ? (
          <span className="pack-card__badge pack-card__badge--offline">
            On device
          </span>
        ) : null}
        {pack.popular ? (
          <span className="pack-card__badge pack-card__badge--popular">
            Popular
          </span>
        ) : null}
        {pack.nsfw ? (
          <span className="pack-card__badge pack-card__badge-nsfw">NSFW</span>
        ) : null}
      </div>
    </div>
  );
}

/** Choicer Voicer-style pack card: cover image on top, meta + actions below. */
export default function PackCard({
  pack,
  onSelect,
  onDelete,
  onDownload,
  onRemoveDownload,
  href,
  compact = false,
  deletable = false,
  downloadable = false,
  downloaded = false,
  downloading = false,
  downloadProgress,
  progressSummary,
  rank,
  aggregateStarCount,
}: PackCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const showDelete = deletable && Boolean(onDelete);
  const showDownload =
    Boolean(onDownload) &&
    (downloadable || downloading) &&
    !downloaded;
  const showDownloadedLabel = downloaded && pack.source !== "user";
  const showRemoveDownload =
    downloaded &&
    pack.source !== "user" &&
    Boolean(onRemoveDownload) &&
    (pack.source === "cached" ||
      pack.source === "cloud" ||
      pack.source === "builtin" ||
      pack.offlineReady === true);
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

  const handleRemoveConfirm = async () => {
    if (!onRemoveDownload || removing) return;
    setRemoving(true);
    setDeleteError(null);
    try {
      await onRemoveDownload(pack);
      setConfirmRemove(false);
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Could not remove download."
      );
    } finally {
      setRemoving(false);
    }
  };

  const meta = (
    <>
      <PackCover
        pack={pack}
        compact={compact}
        rank={rank}
        aggregateStarCount={aggregateStarCount}
        downloaded={downloaded}
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
          <div>
            <dt>Plays</dt>
            <dd>{pack.playCount.toLocaleString()}</dd>
          </div>
          {aggregateStarCount != null ? (
            <div>
              <dt>Stars</dt>
              <dd>
                <PackStarCount count={aggregateStarCount} />
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="pack-card__credit">
          Creator: {pack.creator}
          {progressSummary ? (
            <span className="pack-card__progress">
              {" "}
              · {progressSummary.recordedCount} lines saved
            </span>
          ) : null}
        </p>
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
          {showDownload || showDownloadedLabel || showRemoveDownload ? (
            <div className="pack-card__download-wrap">
              {showDownloadedLabel ? (
                <span className="pack-card__downloaded-label">Downloaded</span>
              ) : null}
              {showDownload ? (
                <button
                  type="button"
                  className="pack-card__download"
                  disabled={downloading}
                  title={
                    downloading
                      ? downloadProgress ?? "Downloading…"
                      : "Download for offline"
                  }
                  aria-label={
                    downloading
                      ? downloadProgress ?? "Downloading"
                      : "Download for offline"
                  }
                  onClick={() => void onDownload?.(pack)}
                >
                  <svg
                    className="pack-card__download-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L11 12.59V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"
                    />
                  </svg>
                </button>
              ) : null}
              {showRemoveDownload ? (
                <button
                  type="button"
                  className="pack-card__download"
                  disabled={removing}
                  title="Remove download"
                  aria-label="Remove download"
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmRemove(true);
                  }}
                >
                  <svg
                    className="pack-card__download-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                    />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : null}
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
      {confirmRemove ? (
        <ConfirmDialog
          title="Remove download?"
          message="This deletes the pack from your device. You can download it again when online."
          confirmLabel="Remove"
          tone="red"
          busy={removing}
          fixed
          onConfirm={() => void handleRemoveConfirm()}
          onCancel={() => {
            if (!removing) setConfirmRemove(false);
          }}
        />
      ) : null}
    </>
  );

  return <article className={className}>{meta}</article>;
}
