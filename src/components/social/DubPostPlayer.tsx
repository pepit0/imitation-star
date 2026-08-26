"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DubPost, UserProfile } from "@/lib/types/social";
import type { DubLine, RecordedLine } from "@/lib/types";
import { getPackById } from "@/lib/packs";
import { DubMixer } from "@/lib/dubMix";
import { playAudioBlob } from "@/lib/audio";
import {
  archiveDubPost,
  deleteDubPost,
  resolveTakeAudioUrl,
} from "@/lib/cloudPosts";
import { formatTimecode } from "@/lib/packStore";
import { claimForumPlayback, stopAllForumPlayback } from "@/lib/forumPlayback";
import PlayIcon from "@/components/PlayIcon";
import ConfirmDialog from "@/components/ConfirmDialog";

type DubPostPlayerProps = {
  post: DubPost;
  author: UserProfile | undefined;
  isOwner?: boolean;
  onClose: () => void;
  onPostArchived?: () => void;
  onPostDeleted?: () => void;
};

type ConfirmAction = "archive" | "delete";

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.2" y="1.5" width="2.4" height="9" fill="currentColor" />
      <rect x="7.4" y="1.5" width="2.4" height="9" fill="currentColor" />
    </svg>
  );
}

async function blobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load take audio (${res.status})`);
  return res.blob();
}

export default function DubPostPlayer({
  post,
  author,
  isOwner = false,
  onClose,
  onPostArchived,
  onPostDeleted,
}: DubPostPlayerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mixerRef = useRef<DubMixer | null>(null);
  const scrubbingRef = useRef(false);
  const loadGenRef = useRef(0);
  const releaseClaimRef = useRef<(() => void) | null>(null);
  const audioOnlyAbortRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<RecordedLine[] | null>(null);
  const [loadingTakes, setLoadingTakes] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const pack = getPackById(post.packId);
  const videoUrl = post.videoUrl ?? pack?.videoUrl;
  const backingUrl = post.backingUrl ?? pack?.backingTrackUrl;
  const thumbUrl = post.packThumbnailUrl ?? pack?.thumbnailUrl;
  const thumbColor = post.packThumbnailColor ?? pack?.thumbnailColor ?? "#FF5A36";
  const name = author?.displayName ?? "Unknown";
  const userTakes = post.takes?.filter((t) => t.audioPath) ?? [];

  const lines: DubLine[] = useMemo(
    () =>
      userTakes.map((t) => {
        const fromPack = pack?.lines.find((l) => l.id === t.lineId);
        return {
          id: t.lineId,
          speaker: fromPack?.speaker ?? "TAKE",
          text: fromPack?.text ?? "",
          startMs: t.startMs,
          endMs: t.endMs,
        };
      }),
    [userTakes, pack]
  );

  const progress = useMemo(() => {
    if (durationMs <= 0) return 0;
    return Math.min(100, Math.max(0, (currentMs / durationMs) * 100));
  }, [currentMs, durationMs]);

  const hardStop = useCallback(() => {
    audioOnlyAbortRef.current = true;
    mixerRef.current?.dispose();
    mixerRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setPlaying(false);
    setCurrentMs(0);
    setStatus("Stopped");
  }, []);

  const claimPlayback = useCallback(() => {
    releaseClaimRef.current?.();
    releaseClaimRef.current = claimForumPlayback(hardStop);
  }, [hardStop]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmAction) {
        if (!manageBusy) setConfirmAction(null);
        return;
      }
      if (!manageBusy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      loadGenRef.current += 1;
      releaseClaimRef.current?.();
      releaseClaimRef.current = null;
      hardStop();
    };
  }, [onClose, hardStop, confirmAction, manageBusy]);

  // When switching posts (same component type), reset state.
  useEffect(() => {
    stopAllForumPlayback();
    loadGenRef.current += 1;
    hardStop();
    setRecordings(null);
    setError(null);
    setStatus("Ready");
    setDurationMs(0);
    setCurrentMs(0);
  }, [post.id, hardStop]);

  const loadTakes = useCallback(async (): Promise<RecordedLine[] | null> => {
    if (recordings) return recordings;
    if (userTakes.length === 0) {
      setError(
        "This post has no recorded take audio. Finish a dub and publish again."
      );
      return null;
    }

    const gen = ++loadGenRef.current;
    setLoadingTakes(true);
    setStatus("Loading takes…");
    setError(null);
    try {
      const next: RecordedLine[] = [];
      for (const take of userTakes) {
        if (gen !== loadGenRef.current) return null;
        const url = resolveTakeAudioUrl(take.audioPath);
        const blob = await blobFromUrl(url);
        next.push({
          lineId: take.lineId,
          blob,
          durationMs: Math.max(200, take.endMs - take.startMs),
        });
      }
      if (gen !== loadGenRef.current) return null;
      setRecordings(next);
      return next;
    } catch (e) {
      if (gen !== loadGenRef.current) return null;
      setError(e instanceof Error ? e.message : "Could not load takes.");
      return null;
    } finally {
      if (gen === loadGenRef.current) setLoadingTakes(false);
    }
  }, [recordings, userTakes]);

  const ensureMixer = useCallback(
    async (recs: RecordedLine[]) => {
      const video = videoRef.current;
      if (!videoUrl || !video) return null;
      if (mixerRef.current) return mixerRef.current;

      const mixer = new DubMixer({
        video,
        backingUrl,
        lines,
        recordings: recs,
        onStatus: setStatus,
        onTimeUpdate: (ms, dur) => {
          if (!scrubbingRef.current) setCurrentMs(ms);
          setDurationMs(dur);
        },
        onEnded: () => {
          setPlaying(false);
          setStatus("Finished");
        },
      });
      mixerRef.current = mixer;
      const dur = await mixer.prepare();
      setDurationMs(dur);
      return mixer;
    },
    [videoUrl, backingUrl, lines]
  );

  const handlePlayPause = useCallback(async () => {
    setError(null);
    const recs = await loadTakes();
    if (!recs) return;

    claimPlayback();

    if (videoUrl) {
      const mixer = await ensureMixer(recs);
      if (!mixer) return;

      if (mixer.isPlaying) {
        mixer.pause();
        setPlaying(false);
        setCurrentMs(mixer.getCurrentMs());
        setStatus("Paused");
        return;
      }

      const from =
        mixer.getCurrentMs() >= mixer.getDurationMs() - 120
          ? 0
          : mixer.getCurrentMs();
      setPlaying(true);
      setStatus("Playing…");
      await mixer.play(from);
      return;
    }

    // Audio-only fallback (no video on post/pack)
    if (playing) {
      audioOnlyAbortRef.current = true;
      setPlaying(false);
      setStatus("Stopped");
      return;
    }

    audioOnlyAbortRef.current = false;
    setPlaying(true);
    setStatus("Playing takes…");
    const byLine = new Map(recs.map((r) => [r.lineId, r]));
    const ordered = [...lines].sort((a, b) => a.startMs - b.startMs);
    let elapsed = 0;
    const total = ordered.reduce(
      (sum, l) => sum + Math.max(0, l.endMs - l.startMs),
      0
    );
    setDurationMs(total || 1);
    for (const line of ordered) {
      if (audioOnlyAbortRef.current) break;
      const rec = byLine.get(line.id);
      if (!rec) continue;
      setCurrentMs(elapsed);
      await playAudioBlob(rec.blob);
      elapsed += Math.max(0, line.endMs - line.startMs);
      setCurrentMs(elapsed);
      await new Promise((r) => setTimeout(r, 80));
    }
    setPlaying(false);
    setStatus(audioOnlyAbortRef.current ? "Stopped" : "Finished");
  }, [
    loadTakes,
    claimPlayback,
    videoUrl,
    ensureMixer,
    playing,
    lines,
  ]);

  const seekTo = useCallback(
    async (ms: number) => {
      const recs = recordings ?? (await loadTakes());
      if (!recs || !videoUrl) {
        setCurrentMs(ms);
        return;
      }
      claimPlayback();
      const mixer = await ensureMixer(recs);
      if (!mixer) return;
      setCurrentMs(ms);
      await mixer.seek(ms);
      setPlaying(mixer.isPlaying);
      setStatus(mixer.isPlaying ? "Playing…" : "Paused");
    },
    [recordings, loadTakes, videoUrl, claimPlayback, ensureMixer]
  );

  const onTimelinePointer = useCallback(
    async (clientX: number, track: HTMLElement) => {
      const rect = track.getBoundingClientRect();
      const ratio = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
      const ms = Math.max(0, Math.min(1, ratio)) * (durationMs || 0);
      await seekTo(ms);
    },
    [durationMs, seekTo]
  );

  const handleClose = useCallback(() => {
    if (manageBusy) return;
    releaseClaimRef.current?.();
    releaseClaimRef.current = null;
    hardStop();
    onClose();
  }, [hardStop, onClose, manageBusy]);

  const handleArchiveConfirm = useCallback(async () => {
    setManageBusy(true);
    setManageError(null);
    try {
      await archiveDubPost(post.id);
      setConfirmAction(null);
      releaseClaimRef.current?.();
      releaseClaimRef.current = null;
      hardStop();
      onPostArchived?.();
      onClose();
    } catch (e) {
      setManageError(
        e instanceof Error ? e.message : "Could not archive this post."
      );
    } finally {
      setManageBusy(false);
    }
  }, [post.id, hardStop, onPostArchived, onClose]);

  const handleDeleteConfirm = useCallback(async () => {
    setManageBusy(true);
    setManageError(null);
    try {
      await deleteDubPost(post);
      setConfirmAction(null);
      releaseClaimRef.current?.();
      releaseClaimRef.current = null;
      hardStop();
      onPostDeleted?.();
      onClose();
    } catch (e) {
      setManageError(
        e instanceof Error ? e.message : "Could not delete this post."
      );
    } finally {
      setManageBusy(false);
    }
  }, [post, hardStop, onPostDeleted, onClose]);

  const canPlay = userTakes.length > 0;

  return (
    <div
      className="forum-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!manageBusy && !confirmAction) handleClose();
      }}
    >
      <div
        className="forum-player"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="forum-player__close"
          onClick={handleClose}
          aria-label="Close player"
        >
          ×
        </button>

        <div className="forum-player__stage">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              className="forum-player__video"
              playsInline
              muted
              preload="auto"
              poster={thumbUrl}
            />
          ) : thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" className="forum-player__poster" />
          ) : (
            <div
              className="forum-player__poster forum-player__poster--solid"
              style={{ background: thumbColor }}
            />
          )}
        </div>

        <div className="forum-player__transport">
          <button
            type="button"
            className="brutal-btn brutal-btn-sm forum-player__transport-btn"
            disabled={!canPlay || loadingTakes}
            onClick={() => void handlePlayPause()}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <div
            className="forum-player__timeline"
            role="slider"
            tabIndex={canPlay ? 0 : -1}
            aria-label="Dub timeline"
            aria-valuemin={0}
            aria-valuemax={Math.round(durationMs)}
            aria-valuenow={Math.round(currentMs)}
            aria-disabled={!canPlay}
            onPointerDown={(e) => {
              if (!canPlay) return;
              scrubbingRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              void onTimelinePointer(e.clientX, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (!scrubbingRef.current || !canPlay) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio =
                rect.width <= 0 ? 0 : (e.clientX - rect.left) / rect.width;
              setCurrentMs(
                Math.max(0, Math.min(1, ratio)) * (durationMs || 0)
              );
            }}
            onPointerUp={(e) => {
              if (!scrubbingRef.current) return;
              scrubbingRef.current = false;
              void onTimelinePointer(e.clientX, e.currentTarget);
            }}
            onPointerCancel={() => {
              scrubbingRef.current = false;
            }}
            onKeyDown={(e) => {
              if (!canPlay) return;
              const step = e.shiftKey ? 5000 : 1000;
              if (e.key === "ArrowRight") {
                e.preventDefault();
                void seekTo(currentMs + step);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                void seekTo(currentMs - step);
              } else if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                void handlePlayPause();
              }
            }}
          >
            <div className="forum-player__timeline-track">
              <div
                className="forum-player__timeline-fill"
                style={{ width: `${progress}%` }}
              />
              <div
                className="forum-player__timeline-thumb"
                style={{ left: `${progress}%` }}
              />
            </div>
          </div>
          <span className="forum-player__time">
            {formatTimecode(currentMs)} / {formatTimecode(durationMs)}
          </span>
        </div>

        <div className="forum-player__body">
          <p className="forum-player__pack" id={titleId}>
            {post.packTitle}
          </p>
          <p className="forum-player__author">
            {author?.handle ? `${name} · ${author.handle}` : name}
          </p>
          {post.caption ? (
            <p className="forum-player__caption">{post.caption}</p>
          ) : null}
          <p className="forum-player__status" aria-live="polite">
            {manageError ?? error ?? (loadingTakes ? "Loading takes…" : status)}
          </p>

          <button
            type="button"
            className="brutal-btn w-full forum-player__play"
            disabled={!canPlay || loadingTakes || manageBusy}
            onClick={() => void handlePlayPause()}
          >
            {playing ? (
              <>
                <PauseIcon />
                Pause
              </>
            ) : (
              <>
                <PlayIcon />
                {loadingTakes ? "Loading…" : "Play dub"}
              </>
            )}
          </button>

          {isOwner ? (
            <div className="forum-player__owner-actions">
              <button
                type="button"
                className="brutal-btn brutal-btn-sm forum-player__owner-btn forum-player__owner-btn--archive"
                disabled={manageBusy}
                onClick={() => setConfirmAction("archive")}
              >
                Archive
              </button>
              <button
                type="button"
                className="brutal-btn brutal-btn-sm forum-player__owner-btn forum-player__owner-btn--delete"
                disabled={manageBusy}
                onClick={() => setConfirmAction("delete")}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>

        {confirmAction === "archive" ? (
          <ConfirmDialog
            title="Archive this post?"
            message="It will be hidden from the forum feed. You can still see it on your profile."
            confirmLabel="Archive"
            tone="green"
            busy={manageBusy}
            onConfirm={() => void handleArchiveConfirm()}
            onCancel={() => {
              if (!manageBusy) setConfirmAction(null);
            }}
          />
        ) : null}

        {confirmAction === "delete" ? (
          <ConfirmDialog
            title="Delete this post?"
            message="This permanently removes your dub and its takes. This cannot be undone."
            confirmLabel="Delete"
            tone="red"
            busy={manageBusy}
            onConfirm={() => void handleDeleteConfirm()}
            onCancel={() => {
              if (!manageBusy) setConfirmAction(null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
