"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CollabDetail } from "@/lib/types/collab";
import {
  buildCollabRecordings,
  dubPackFromSnapshot,
  publishCollabDub,
} from "@/lib/collabDubs";
import { DubMixer } from "@/lib/dubMix";
import { formatTimecode } from "@/lib/packStore";
import PlayIcon from "@/components/PlayIcon";

type CollabPublishPreviewProps = {
  collab: CollabDetail;
  creatorId: string;
  onClose: () => void;
  onPublished: () => void;
};

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2.2" y="1.5" width="2.4" height="9" fill="currentColor" />
      <rect x="7.4" y="1.5" width="2.4" height="9" fill="currentColor" />
    </svg>
  );
}

export default function CollabPublishPreview({
  collab,
  creatorId,
  onClose,
  onPublished,
}: CollabPublishPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mixerRef = useRef<DubMixer | null>(null);
  const pack = dubPackFromSnapshot(collab);

  const [caption, setCaption] = useState(collab.caption);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [status, setStatus] = useState("Loading takes…");
  const [recordingsReady, setRecordingsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void buildCollabRecordings(collab)
      .then(async (recordings) => {
        if (cancelled) return;
        const video = videoRef.current;
        if (!video || !pack.videoUrl) {
          setRecordingsReady(true);
          setStatus("Ready");
          return;
        }
        const mixer = new DubMixer({
          video,
          backingUrl: pack.backingTrackUrl,
          lines: pack.lines,
          recordings,
          onStatus: setStatus,
          onTimeUpdate: (ms, dur) => {
            setCurrentMs(ms);
            setDurationMs(dur);
          },
          onEnded: () => setPlaying(false),
        });
        mixerRef.current = mixer;
        const dur = await mixer.prepare();
        if (!cancelled) {
          setDurationMs(dur);
          setRecordingsReady(true);
          setStatus("Ready");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load takes.");
        }
      });
    return () => {
      cancelled = true;
      mixerRef.current?.dispose();
    };
  }, [collab, pack]);

  const handlePlayPause = useCallback(async () => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    if (mixer.isPlaying) {
      mixer.pause();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    await mixer.play(mixer.getCurrentMs());
  }, []);

  async function handlePublish() {
    setBusy(true);
    setError(null);
    try {
      await publishCollabDub({
        collabId: collab.id,
        creatorId,
        caption,
      });
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  const progress =
    durationMs > 0 ? Math.min(100, (currentMs / durationMs) * 100) : 0;

  return (
    <div className="forum-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="collab-publish"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="collab-publish__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h3 className="collab-publish__title">Preview collab dub</h3>
        <p className="collab-publish__pack">{collab.packTitle}</p>

        {pack.videoUrl ? (
          <video
            ref={videoRef}
            src={pack.videoUrl}
            className="collab-publish__video"
            playsInline
            muted
            preload="auto"
            poster={pack.thumbnailUrl}
          />
        ) : null}

        {pack.videoUrl ? (
          <div className="collab-publish__transport">
            <button
              type="button"
              className="brutal-btn brutal-btn-sm"
              disabled={!recordingsReady}
              onClick={() => void handlePlayPause()}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <span className="collab-publish__time">
              {formatTimecode(currentMs)} / {formatTimecode(durationMs)}
            </span>
            <div className="collab-publish__progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        <p className="collab-publish__status">{error ?? status}</p>

        <label className="collab-publish__caption">
          <span>Forum caption</span>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={200}
            placeholder="Title for your forum post"
          />
        </label>

        <button
          type="button"
          className="brutal-btn bg-es-brand text-white w-full"
          disabled={busy || !recordingsReady}
          onClick={() => void handlePublish()}
        >
          {busy ? "Publishing…" : "Publish to forum"}
        </button>
      </div>
    </div>
  );
}
