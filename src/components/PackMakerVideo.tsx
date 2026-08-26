"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type PackMakerVideoHandle = {
  seekToSec: (sec: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  getCurrentTimeSec: () => number;
  getDurationSec: () => number;
  isPaused: () => boolean;
  captureFrame: () => Promise<Blob | null>;
};

type OgvModule = {
  OGVLoader: { base: string };
  OGVPlayer: new () => OgvPlayer;
};

type OgvPlayer = HTMLElement & {
  src: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  videoWidth: number;
  videoHeight: number;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: HTMLElement["addEventListener"];
  removeEventListener: HTMLElement["removeEventListener"];
};

type PackMakerVideoProps = {
  src: string | null;
  ogv?: boolean;
  posterUrl?: string | null;
  className?: string;
  /** Render only the media element (parent owns the frame). */
  bare?: boolean;
  onLoadedMetadata?: (durationSec: number) => void;
  onTimeUpdate?: (currentSec: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onError?: () => void;
  onClick?: () => void;
};

let ogvModulePromise: Promise<OgvModule> | null = null;

async function loadOgvModule(): Promise<OgvModule> {
  if (!ogvModulePromise) {
    ogvModulePromise = import("ogv").then((mod) => {
      const ogv = mod as unknown as OgvModule;
      ogv.OGVLoader.base = "/ogv";
      return ogv;
    });
  }
  return ogvModulePromise;
}

function captureFromCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
  });
}

const PackMakerVideo = forwardRef<PackMakerVideoHandle, PackMakerVideoProps>(
  function PackMakerVideo(
    {
      src,
      ogv = false,
      posterUrl = null,
      className,
      bare = false,
      onLoadedMetadata,
      onTimeUpdate,
      onPlayStateChange,
      onError,
      onClick,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const ogvPlayerRef = useRef<OgvPlayer | null>(null);
    const [ogvReady, setOgvReady] = useState(false);
    const [ogvFailed, setOgvFailed] = useState(false);

    useImperativeHandle(
      ref,
      () => ({
        seekToSec(sec: number) {
          const native = videoRef.current;
          if (native) {
            native.currentTime = sec;
            return;
          }
          const ogvPlayer = ogvPlayerRef.current;
          if (ogvPlayer) ogvPlayer.currentTime = sec;
        },
        async play() {
          const native = videoRef.current;
          if (native) {
            await native.play();
            return;
          }
          const ogvPlayer = ogvPlayerRef.current;
          if (ogvPlayer) await ogvPlayer.play();
        },
        pause() {
          videoRef.current?.pause();
          ogvPlayerRef.current?.pause();
        },
        getCurrentTimeSec() {
          return (
            videoRef.current?.currentTime ??
            ogvPlayerRef.current?.currentTime ??
            0
          );
        },
        getDurationSec() {
          const d =
            videoRef.current?.duration ?? ogvPlayerRef.current?.duration ?? 0;
          return Number.isFinite(d) ? d : 0;
        },
        isPaused() {
          const native = videoRef.current;
          if (native) return native.paused;
          return ogvPlayerRef.current?.paused ?? true;
        },
        async captureFrame() {
          const native = videoRef.current;
          if (native && native.videoWidth > 0) {
            const canvas = document.createElement("canvas");
            canvas.width = native.videoWidth;
            canvas.height = native.videoHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.drawImage(native, 0, 0);
            return captureFromCanvas(canvas);
          }
          const ogvPlayer = ogvPlayerRef.current;
          if (ogvPlayer) {
            const canvas = ogvPlayer.querySelector("canvas");
            if (canvas) return captureFromCanvas(canvas);
          }
          return null;
        },
      }),
      []
    );

    const metaReportedRef = useRef<string | null>(null);

    const reportMetadata = useCallback(
      (duration: number, sourceKey: string) => {
        if (!(Number.isFinite(duration) && duration > 0)) return;
        // Avoid spamming parent on durationchange ticks, but always report
        // once per src (including when metadata was ready before listeners).
        if (metaReportedRef.current === sourceKey) return;
        metaReportedRef.current = sourceKey;
        onLoadedMetadata?.(duration);
      },
      [onLoadedMetadata]
    );

    useEffect(() => {
      metaReportedRef.current = null;
    }, [src]);

    // Native <video>: metadata can fire before React attaches handlers when the
    // blob URL is already in memory — poll readyState after mount/src change.
    useEffect(() => {
      if (ogv || !src) return;
      const v = videoRef.current;
      if (!v) return;

      const tryReport = () => reportMetadata(v.duration, src);
      tryReport();
      if (v.readyState >= HTMLMediaElement.HAVE_METADATA) tryReport();

      const onMeta = () => tryReport();
      v.addEventListener("loadedmetadata", onMeta);
      v.addEventListener("durationchange", onMeta);
      v.addEventListener("loadeddata", onMeta);
      v.addEventListener("canplay", onMeta);
      return () => {
        v.removeEventListener("loadedmetadata", onMeta);
        v.removeEventListener("durationchange", onMeta);
        v.removeEventListener("loadeddata", onMeta);
        v.removeEventListener("canplay", onMeta);
      };
    }, [ogv, src, reportMetadata]);

    useEffect(() => {
      if (!ogv || !src || !containerRef.current) {
        setOgvReady(false);
        setOgvFailed(false);
        return;
      }

      let cancelled = false;
      let player: OgvPlayer | null = null;
      let pollId = 0;

      const onMeta = () => {
        if (!player || cancelled) return;
        reportMetadata(player.duration, src);
      };

      const onTime = () => {
        if (!player || cancelled) return;
        onTimeUpdate?.(player.currentTime);
      };

      const onPlay = () => onPlayStateChange?.(true);
      const onPause = () => onPlayStateChange?.(false);
      const onErr = () => {
        if (!cancelled) {
          setOgvFailed(true);
          onError?.();
        }
      };

      void (async () => {
        try {
          const ogvMod = await loadOgvModule();
          if (cancelled || !containerRef.current) return;

          // Absolute base so WASM/workers resolve on www + preview hosts.
          ogvMod.OGVLoader.base = `${window.location.origin}/ogv`;

          player = new ogvMod.OGVPlayer();
          ogvPlayerRef.current = player;
          player.className = "pm-video pm-video--ogv";
          player.style.width = "100%";
          player.style.height = "auto";
          player.style.display = "block";
          player.style.background = "#000";
          player.src = src;

          player.addEventListener("loadedmetadata", onMeta);
          player.addEventListener("durationchange", onMeta);
          player.addEventListener("timeupdate", onTime);
          player.addEventListener("play", onPlay);
          player.addEventListener("pause", onPause);
          player.addEventListener("error", onErr);

          containerRef.current.replaceChildren(player);
          setOgvReady(true);
          setOgvFailed(false);
          onMeta();

          // OGV often reports duration late — keep polling briefly.
          let tries = 0;
          pollId = window.setInterval(() => {
            if (cancelled || !player) {
              window.clearInterval(pollId);
              return;
            }
            onMeta();
            tries += 1;
            if (
              tries >= 40 ||
              (Number.isFinite(player.duration) && player.duration > 0)
            ) {
              window.clearInterval(pollId);
            }
          }, 250);
        } catch {
          if (!cancelled) {
            setOgvFailed(true);
            onError?.();
          }
        }
      })();

      return () => {
        cancelled = true;
        if (pollId) window.clearInterval(pollId);
        if (player) {
          player.pause();
          player.removeEventListener("loadedmetadata", onMeta);
          player.removeEventListener("durationchange", onMeta);
          player.removeEventListener("timeupdate", onTime);
          player.removeEventListener("play", onPlay);
          player.removeEventListener("pause", onPause);
          player.removeEventListener("error", onErr);
          player.remove();
        }
        ogvPlayerRef.current = null;
        setOgvReady(false);
      };
    }, [
      ogv,
      src,
      reportMetadata,
      onTimeUpdate,
      onPlayStateChange,
      onError,
    ]);

    if (!src) return null;

    if (ogv) {
      // Never put pm-video--pending on the OGV host — that hides the canvas at opacity 0.
      return (
        <div
          className={
            bare
              ? "pm-video-host"
              : `pm-video-wrap${posterUrl && !ogvReady ? " pm-video-wrap--converting" : ""}`
          }
          onClick={onClick}
        >
          {!bare && posterUrl && !ogvReady ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={posterUrl} alt="" className="pm-video pm-video--poster" />
          ) : null}
          <div ref={containerRef} className="pm-video-host" />
          {ogvFailed ? (
            <div className="pm-video-fallback">
              {posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={posterUrl} alt="" className="pm-video pm-video--poster" />
              ) : null}
              <p>
                Could not decode this OGV video in your browser. Replace the video
                with an MP4, or try again after refreshing.
              </p>
            </div>
          ) : null}
        </div>
      );
    }

    const videoEl = (
      <video
        ref={videoRef}
        src={src}
        className={className}
        playsInline
        preload="auto"
        poster={posterUrl ?? undefined}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        onPlay={() => onPlayStateChange?.(true)}
        onPause={() => onPlayStateChange?.(false)}
        onClick={onClick}
        onError={onError}
      />
    );

    if (bare) return videoEl;

    return <div className="pm-video-wrap">{videoEl}</div>;
  }
);

export default PackMakerVideo;
