"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DubPack, RecordedLine } from "@/lib/types";
import { playAudioBlob } from "@/lib/audio";
import { DubMixer } from "@/lib/dubMix";
import { awardPackComplete } from "@/lib/xp";
import { publishDubPost } from "@/lib/cloudPosts";
import { formatTimecode } from "@/lib/packStore";
import { useAuth } from "@/components/auth/AuthProvider";
import AppBackButton from "@/components/AppBackButton";
import PlayIcon from "@/components/PlayIcon";

interface DubPreviewProps {
  pack: DubPack;
  recordings: RecordedLine[];
  /** Unique per finished recording run; Retry clears it so a new finish can award again. */
  xpSessionId?: string | null;
  onRestart: () => void;
  onBackToMenu: () => void;
}

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

export default function DubPreview({
  pack,
  recordings,
  xpSessionId,
  onRestart,
  onBackToMenu,
}: DubPreviewProps) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mixerRef = useRef<DubMixer | null>(null);
  const scrubbingRef = useRef(false);
  const awardedRef = useRef(false);
  const [isMixing, setIsMixing] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const progress = useMemo(() => {
    if (durationMs <= 0) return 0;
    return Math.min(100, Math.max(0, (currentMs / durationMs) * 100));
  }, [currentMs, durationMs]);

  const ensureMixer = useCallback(async () => {
    const video = videoRef.current;
    if (!pack.videoUrl || !video) return null;
    if (mixerRef.current) return mixerRef.current;
    const mixer = new DubMixer({
      video,
      backingUrl: pack.backingTrackUrl,
      lines: pack.lines,
      recordings,
      onTimeUpdate: (ms, dur) => {
        if (!scrubbingRef.current) setCurrentMs(ms);
        setDurationMs(dur);
      },
      onEnded: () => {
        setIsMixing(false);
      },
    });
    mixerRef.current = mixer;
    const dur = await mixer.prepare();
    setDurationMs(dur);
    return mixer;
  }, [pack, recordings]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mixer = await ensureMixer();
      if (cancelled || !mixer) return;
    })();
    return () => {
      cancelled = true;
      mixerRef.current?.dispose();
      mixerRef.current = null;
    };
  }, [ensureMixer]);

  useEffect(() => {
    if (!xpSessionId || awardedRef.current) return;
    awardedRef.current = true;
    awardPackComplete(`${pack.id}:${xpSessionId}`);
  }, [pack.id, xpSessionId]);

  const handlePlayPause = useCallback(async () => {
    if (pack.videoUrl) {
      const mixer = await ensureMixer();
      if (!mixer) return;
      if (mixer.isPlaying) {
        mixer.pause();
        setIsMixing(false);
        setCurrentMs(mixer.getCurrentMs());
        return;
      }
      const from =
        mixer.getCurrentMs() >= mixer.getDurationMs() - 120
          ? 0
          : mixer.getCurrentMs();
      setIsMixing(true);
      await mixer.play(from);
      return;
    }

    if (isMixing) {
      setIsMixing(false);
      return;
    }
    setIsMixing(true);
    for (const rec of recordings) {
      await playAudioBlob(rec.blob);
      await new Promise((r) => setTimeout(r, 350));
    }
    setIsMixing(false);
  }, [pack.videoUrl, ensureMixer, isMixing, recordings]);

  const seekTo = useCallback(
    async (ms: number) => {
      const mixer = await ensureMixer();
      if (!mixer) {
        setCurrentMs(ms);
        return;
      }
      setCurrentMs(ms);
      await mixer.seek(ms);
      setIsMixing(mixer.isPlaying);
    },
    [ensureMixer]
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

  const handlePublish = useCallback(async () => {
    if (!user) return;
    if (publishedId) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const thumbUrl =
        pack.thumbnailUrl.startsWith("blob:") ||
        pack.thumbnailUrl.startsWith("data:")
          ? undefined
          : pack.thumbnailUrl;
      const post = await publishDubPost({
        authorId: user.id,
        packId: pack.id,
        packTitle: pack.title,
        caption,
        packThumbnailUrl: thumbUrl,
        packThumbnailColor: pack.thumbnailColor,
        videoUrl: pack.videoUrl,
        backingUrl: pack.backingTrackUrl,
        lines: pack.lines,
        recordings,
      });
      setPublishedId(post.id);
    } catch (e) {
      setPublishError(
        e instanceof Error ? e.message : "Could not publish to the forum."
      );
    } finally {
      setPublishing(false);
    }
  }, [user, publishedId, pack, caption, recordings]);

  return (
    <div className="dub-end">
      <header className="dub-end__header">
        <div className="dub-end__header-text">
          <h2 className="dub-end__title">Dub Complete</h2>
          <p className="dub-end__pack">{pack.title}</p>
        </div>
        <button
          type="button"
          onClick={() => void handlePlayPause()}
          className="brutal-btn brutal-btn-sm dub-end__play"
        >
          {isMixing ? (
            <>
              <PauseIcon />
              Pause
            </>
          ) : (
            <>
              <PlayIcon />
              Play dub
            </>
          )}
        </button>
      </header>

      <div className="dub-end__stage">
        {pack.videoUrl ? (
          <video
            ref={videoRef}
            src={pack.videoUrl}
            className="dub-end__video"
            playsInline
            muted
            preload="auto"
          />
        ) : (
          <p className="dub-end__empty">No video on this pack.</p>
        )}
      </div>

      {pack.videoUrl ? (
        <div className="dub-end__transport">
          <button
            type="button"
            className="brutal-btn brutal-btn-sm dub-end__transport-btn"
            onClick={() => void handlePlayPause()}
            aria-label={isMixing ? "Pause" : "Play"}
          >
            {isMixing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <div
            className="dub-end__timeline"
            role="slider"
            tabIndex={0}
            aria-label="Dub timeline"
            aria-valuemin={0}
            aria-valuemax={Math.round(durationMs)}
            aria-valuenow={Math.round(currentMs)}
            onPointerDown={(e) => {
              scrubbingRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              void onTimelinePointer(e.clientX, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (!scrubbingRef.current) return;
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
            <div className="dub-end__timeline-track">
              <div
                className="dub-end__timeline-fill"
                style={{ width: `${progress}%` }}
              />
              <div
                className="dub-end__timeline-thumb"
                style={{ left: `${progress}%` }}
              />
            </div>
          </div>
          <span className="dub-end__time">
            {formatTimecode(currentMs)} / {formatTimecode(durationMs)}
          </span>
        </div>
      ) : null}

      <footer className="dub-end__footer">
        {publishedId ? (
          <p className="dub-end__posted" role="status">
            Posted to the forum.{" "}
            <Link href="/forum">View feed →</Link>
          </p>
        ) : (
          <>
            {user ? (
              <label className="dub-end__caption">
                <span className="sr-only">Caption</span>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a caption (optional)"
                  maxLength={140}
                  disabled={publishing}
                />
              </label>
            ) : (
              <p className="dub-end__signin">
                <Link href="/login?next=/play">Sign in</Link> to publish this
                take to the forum.
              </p>
            )}
            {publishError ? (
              <p className="dub-end__error" role="alert">
                {publishError}
              </p>
            ) : null}
          </>
        )}

        <div className="dub-end__actions">
          {user && !publishedId ? (
            <button
              type="button"
              className="brutal-btn dub-end__publish"
              disabled={publishing}
              onClick={() => void handlePublish()}
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRestart}
            className="brutal-btn dub-end__retry"
          >
            Retry
          </button>
          <AppBackButton onClick={onBackToMenu} className="dub-end__menu">
            ← Menu
          </AppBackButton>
        </div>
      </footer>
    </div>
  );
}
