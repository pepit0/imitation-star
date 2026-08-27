"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { DubPack, DubLine, RecordedLine } from "@/lib/types";
import {
  AudioRecorder,
  speakReference,
} from "@/lib/audio";
import {
  extractWaveformPeaks,
  extractWaveformPeaksFromUrl,
} from "@/lib/waveform";
import SoundWave from "./SoundWave";
import AppBackButton from "./AppBackButton";
import {
  clearPackProgress,
  loadPackProgress,
  savePackProgress,
} from "@/lib/packProgress";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import ConfirmDialog from "./ConfirmDialog";

interface RecordingStudioProps {
  pack: DubPack;
  mode: "single" | "multiplayer";
  skipSavedProgress?: boolean;
  onBack: () => void;
  onComplete: (recordings: RecordedLine[]) => void;
}

export default function RecordingStudio({
  pack,
  mode,
  skipSavedProgress = false,
  onBack,
  onComplete,
}: RecordingStudioProps) {
  const { user } = useAuth();
  const online = useOnlineStatus();
  const progressCtx = useMemo(
    () => ({
      userId: user?.id,
      online,
      packTitle: pack.title,
    }),
    [user?.id, online, pack.title]
  );
  const [lineIndex, setLineIndex] = useState(0);
  const [recordings, setRecordings] = useState<RecordedLine[]>([]);
  const recordingsRef = useRef<RecordedLine[]>([]);
  const savedSnapshotRef = useRef<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [savedProgressAt, setSavedProgressAt] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState(
    "Ready. Press Replay to hear the line or Record to perform it."
  );
  const [micLevel, setMicLevel] = useState(0);
  const [refPeaks, setRefPeaks] = useState<number[]>([]);
  const [userPeaks, setUserPeaks] = useState<number[]>([]);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [waveProgress, setWaveProgress] = useState(0);
  const [isPlayingRef, setIsPlayingRef] = useState(false);
  const [isPlayingTake, setIsPlayingTake] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const livePeaksRef = useRef<number[]>([]);
  const recordStartedAtRef = useRef(0);
  const userAudioRef = useRef<HTMLAudioElement | null>(null);
  const takeBackingRef = useRef<HTMLAudioElement | null>(null);
  const takeWatchRef = useRef<number | null>(null);
  const takeUrlRef = useRef<string | null>(null);
  const WAVE_BARS = 56;

  const videoRef = useRef<HTMLVideoElement>(null);
  const refAudioRef = useRef<HTMLAudioElement | null>(null);
  const lineWatchRef = useRef<number | null>(null);
  const recordWatchRef = useRef<number | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const abortAllPlaybackRef = useRef<() => void>(() => {});
  const hasVideo = Boolean(pack.videoUrl);
  const hasBacking = Boolean(pack.backingTrackUrl);

  const line: DubLine = pack.lines[lineIndex];
  const totalLines = pack.lines.length;
  const currentRecording = recordings.find((r) => r.lineId === line.id);
  const modeEyebrow =
    mode === "multiplayer" ? (
      <>Multiplayer / Dub Stage</>
    ) : (
      <>
        <span className="block">Single Player / Dub Stage</span>
        <span className="block">Couch Party</span>
      </>
    );
  const isLastLine = lineIndex === totalLines - 1;

  useEffect(() => {
    recordingsRef.current = recordings;
  }, [recordings]);

  const progressSnapshot = useCallback((recs: RecordedLine[]) => {
    return recs
      .map((r) => `${r.lineId}:${Math.round(r.durationMs)}`)
      .sort()
      .join("|");
  }, []);

  const isProgressSaved = useCallback(() => {
    const saved = savedSnapshotRef.current;
    if (!saved) return false;
    return saved === progressSnapshot(recordingsRef.current);
  }, [progressSnapshot]);

  const markProgressSaved = useCallback(
    (recs: RecordedLine[], updatedAt: string) => {
      savedSnapshotRef.current = progressSnapshot(recs);
      setSavedProgressAt(updatedAt);
    },
    [progressSnapshot]
  );

  useEffect(() => {
    if (mode !== "single") {
      setProgressLoaded(true);
      return;
    }
    if (skipSavedProgress) {
      setProgressLoaded(true);
      return;
    }
    let cancelled = false;
    void loadPackProgress(pack.id, progressCtx).then((saved) => {
      if (cancelled || !saved) {
        setProgressLoaded(true);
        return;
      }
      setRecordings(saved.recordings);
      setLineIndex(
        Math.max(0, Math.min(saved.lineIndex, pack.lines.length - 1))
      );
      markProgressSaved(saved.recordings, saved.updatedAt);
      setStatus(
        `Resumed — ${saved.recordings.length} of ${totalLines} lines saved.`
      );
      setProgressLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    pack.id,
    pack.lines.length,
    totalLines,
    progressCtx,
    markProgressSaved,
    skipSavedProgress,
  ]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    recorderRef.current = new AudioRecorder();
    return () => {
      abortAllPlaybackRef.current();
      recorderRef.current?.release();
    };
  }, []);

  useEffect(() => {
    abortAllPlaybackRef.current();
    setWaveProgress(0);
    setLivePeaks([]);
  }, [line.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !pack.videoUrl) return;
    v.pause();
    v.currentTime = line.startMs / 1000;
    // CV-style: mute video when backing exists; Replay unmutes for reference.
    v.muted = hasBacking;
  }, [line, pack.videoUrl, hasBacking]);

  useEffect(() => {
    let cancelled = false;
    setRefPeaks([]);

    const load = async () => {
      if (line.referenceAudioUrl) {
        const peaks = await extractWaveformPeaksFromUrl(line.referenceAudioUrl, {
          barCount: 56,
        });
        if (!cancelled) setRefPeaks(peaks);
        return;
      }
      if (pack.videoUrl) {
        const peaks = await extractWaveformPeaksFromUrl(pack.videoUrl, {
          startMs: line.startMs,
          endMs: line.endMs,
          barCount: 56,
        });
        if (!cancelled) setRefPeaks(peaks);
        return;
      }
      const len = Math.max(12, line.text.length);
      const synthetic = Array.from({ length: 48 }, (_, i) => {
        const wave = Math.sin((i / 48) * Math.PI * (2 + (len % 5))) * 35;
        const bump =
          (i * 13 + line.text.charCodeAt(i % line.text.length)) % 40;
        return Math.max(10, Math.min(95, 40 + wave + bump * 0.4));
      });
      if (!cancelled) setRefPeaks(synthetic);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [line, pack.videoUrl]);

  useEffect(() => {
    let cancelled = false;
    setUserPeaks([]);
    if (!currentRecording) return;

    extractWaveformPeaks(currentRecording.blob, { barCount: 56 }).then(
      (peaks) => {
        if (!cancelled) setUserPeaks(peaks);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [currentRecording]);

  const stopTakePlayback = useCallback(() => {
    if (takeWatchRef.current) {
      cancelAnimationFrame(takeWatchRef.current);
      takeWatchRef.current = null;
    }
    if (userAudioRef.current) {
      userAudioRef.current.pause();
      userAudioRef.current = null;
    }
    if (takeBackingRef.current) {
      takeBackingRef.current.pause();
      takeBackingRef.current = null;
    }
    if (takeUrlRef.current) {
      URL.revokeObjectURL(takeUrlRef.current);
      takeUrlRef.current = null;
    }
    const v = videoRef.current;
    if (v && !isRecordingRef.current) {
      v.pause();
      if (hasBacking) v.muted = true;
    }
    setIsPlayingTake(false);
    setWaveProgress(0);
  }, [hasBacking]);

  const stopLinePlayback = useCallback(() => {
    stopTakePlayback();
    if (lineWatchRef.current) {
      cancelAnimationFrame(lineWatchRef.current);
      lineWatchRef.current = null;
    }
    const v = videoRef.current;
    // Don't pause video mid-take — recording owns playback until the line ends.
    if (isRecordingRef.current) {
      speechSynthesis.cancel();
      if (refAudioRef.current) {
        refAudioRef.current.pause();
        refAudioRef.current = null;
      }
      setIsPlayingRef(false);
      return;
    }
    if (v) {
      v.pause();
      if (hasBacking) v.muted = true;
    }
    if (refAudioRef.current) {
      refAudioRef.current.pause();
      refAudioRef.current = null;
    }
    speechSynthesis.cancel();
    setIsPlayingRef(false);
  }, [hasBacking, stopTakePlayback]);

  const handlePlayTake = useCallback(() => {
    if (isPlayingTake) {
      stopTakePlayback();
      setStatus(
        currentRecording
          ? "Take ready — press Play take to hear it or Re-record."
          : "Ready. Press Replay to hear the line or Record to perform it."
      );
      return;
    }
    if (!currentRecording) return;

    stopLinePlayback();
    stopTakePlayback();

    const url = URL.createObjectURL(currentRecording.blob);
    takeUrlRef.current = url;
    const audio = new Audio(url);
    userAudioRef.current = audio;

    const v = videoRef.current;
    const startSec = line.startMs / 1000;
    const endSec = Math.max(startSec + 0.05, line.endMs / 1000);

    // CV-style: mute video so we never hear original dialogue under the take.
    if (hasVideo && v) {
      v.muted = true;
      v.currentTime = startSec;
    }

    let backing: HTMLAudioElement | null = null;
    if (pack.backingTrackUrl) {
      backing = new Audio(pack.backingTrackUrl);
      takeBackingRef.current = backing;
      try {
        backing.currentTime = startSec;
      } catch {
        /* some browsers need metadata first */
        backing.addEventListener(
          "loadedmetadata",
          () => {
            try {
              backing!.currentTime = startSec;
            } catch {
              /* ignore */
            }
          },
          { once: true }
        );
      }
    }

    const finish = () => {
      stopTakePlayback();
      setStatus("Take ready — press Play take to hear it or Re-record.");
    };

    audio.onended = finish;
    audio.onerror = () => {
      finish();
      setStatus("Could not play your take. Try again.");
    };

    void (async () => {
      try {
        const plays: Promise<unknown>[] = [audio.play()];
        if (backing) {
          plays.push(backing.play().catch(() => undefined));
        }
        if (hasVideo && v) {
          plays.push(v.play().catch(() => undefined));
        }
        await Promise.all(plays);

        setIsPlayingTake(true);
        setStatus(
          hasBacking
            ? "Playing your take with backing…"
            : "Playing your take…"
        );

        const tick = () => {
          if (!userAudioRef.current) return;
          const dur = audio.duration;
          if (Number.isFinite(dur) && dur > 0) {
            setWaveProgress(Math.max(0, Math.min(1, audio.currentTime / dur)));
          }

          if (v && !v.paused && v.currentTime >= endSec) {
            v.pause();
          }
          if (backing && !backing.paused && backing.currentTime >= endSec) {
            backing.pause();
          }

          if (audio.ended || audio.paused) {
            finish();
            return;
          }
          takeWatchRef.current = requestAnimationFrame(tick);
        };
        takeWatchRef.current = requestAnimationFrame(tick);
      } catch {
        finish();
        setStatus("Could not play your take. Try again.");
      }
    })();
  }, [
    currentRecording,
    hasBacking,
    hasVideo,
    isPlayingTake,
    line.endMs,
    line.startMs,
    pack.backingTrackUrl,
    stopLinePlayback,
    stopTakePlayback,
  ]);

  const startLevelMonitor = useCallback(
    (opts: { startSec: number; endSec: number; lineDurMs: number }) => {
      if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
      // Start empty — bars are painted as the playhead advances.
      livePeaksRef.current = Array.from({ length: WAVE_BARS }, () => 0);
      setLivePeaks([...livePeaksRef.current]);
      setWaveProgress(0);
      recordStartedAtRef.current = performance.now();
      // Don't wait on a useEffect — the first RAF can race otherwise.
      isRecordingRef.current = true;

      const paint = (p: number, level: number) => {
        const idx = Math.min(WAVE_BARS - 1, Math.floor(p * WAVE_BARS));
        const peaks = livePeaksRef.current;
        const prev = peaks[idx] || 0;
        peaks[idx] = Math.max(prev * 0.65, level);
        // Fill any skipped slots so fast progress doesn't leave gaps.
        for (let i = 0; i < idx; i++) {
          if (peaks[i] < 8) peaks[i] = Math.max(peaks[i], level * 0.35, 10);
        }
        livePeaksRef.current = peaks;
        setLivePeaks(peaks.slice());
        setWaveProgress(p);
        setMicLevel(level);
      };

      const tick = () => {
        if (!isRecordingRef.current) return;

        const v = videoRef.current;
        const span = Math.max(0.05, opts.endSec - opts.startSec);
        let p: number;
        if (hasVideo && v && Number.isFinite(v.currentTime)) {
          p = (v.currentTime - opts.startSec) / span;
        } else {
          p =
            (performance.now() - recordStartedAtRef.current) / opts.lineDurMs;
        }
        p = Math.max(0, Math.min(1, p));

        const raw = recorderRef.current?.getRmsLevel() ?? 0;
        const level = Math.max(8, Math.min(100, raw || 8));
        paint(p, level);

        levelRafRef.current = requestAnimationFrame(tick);
      };
      levelRafRef.current = requestAnimationFrame(tick);
    },
    [WAVE_BARS, hasVideo]
  );

  const stopLevelMonitor = useCallback(() => {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const clearRecordWatchers = useCallback(() => {
    if (recordWatchRef.current) {
      cancelAnimationFrame(recordWatchRef.current);
      recordWatchRef.current = null;
    }
    if (recordTimerRef.current) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  const abortAllPlayback = useCallback(() => {
    // Allow stopLinePlayback to pause video even if a take was in progress.
    isRecordingRef.current = false;
    clearRecordWatchers();
    stopLevelMonitor();
    stopLinePlayback();
    speechSynthesis.cancel();
    if (refAudioRef.current) {
      refAudioRef.current.pause();
      refAudioRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      v.pause();
      if (hasBacking) v.muted = true;
    }
    const rec = recorderRef.current;
    if (rec?.isRecording()) {
      void rec.stop().catch(() => undefined);
    }
    setIsRecording(false);
    setIsPlayingRef(false);
    setIsPlayingTake(false);
    setMicLevel(0);
    setWaveProgress(0);
  }, [clearRecordWatchers, hasBacking, stopLevelMonitor, stopLinePlayback]);

  abortAllPlaybackRef.current = abortAllPlayback;

  const finalizeTake = useCallback(async () => {
    if (!isRecordingRef.current) return;
    clearRecordWatchers();
    const v = videoRef.current;
    if (v) {
      v.pause();
      if (hasBacking) v.muted = true;
    }

    try {
      const { blob, durationMs } = await recorderRef.current!.stop();
      stopLevelMonitor();
      setIsRecording(false);

      const recorded: RecordedLine = {
        lineId: line.id,
        blob,
        durationMs,
      };

      setRecordings((prev) => {
        const filtered = prev.filter((r) => r.lineId !== line.id);
        return [...filtered, recorded];
      });
      setStatus("Take saved. Press Play take to hear it or Re-record.");
      setWaveProgress(1);
    } catch {
      setStatus("Recording failed. Try again.");
      setIsRecording(false);
      stopLevelMonitor();
      setWaveProgress(0);
    }
  }, [clearRecordWatchers, hasBacking, line, stopLevelMonitor]);

  /** Stop mid-line without saving so the player can re-record immediately. */
  const cancelTake = useCallback(async () => {
    if (!isRecordingRef.current) return;
    clearRecordWatchers();
    stopLevelMonitor();
    isRecordingRef.current = false;
    setIsRecording(false);
    setWaveProgress(0);
    setMicLevel(0);
    livePeaksRef.current = Array.from({ length: WAVE_BARS }, () => 0);
    setLivePeaks([...livePeaksRef.current]);

    const v = videoRef.current;
    if (v) {
      v.pause();
      if (hasBacking) v.muted = true;
    }

    const rec = recorderRef.current;
    if (rec?.isRecording()) {
      try {
        await rec.stop();
      } catch {
        /* discard incomplete take */
      }
    }

    setStatus("Stopped. Press Record to try this line again.");
  }, [
    WAVE_BARS,
    clearRecordWatchers,
    hasBacking,
    stopLevelMonitor,
  ]);

  const handleReplay = useCallback(() => {
    stopLinePlayback();

    const v = videoRef.current;
    const endSec = line.endMs / 1000;

    const finishReplay = () => {
      if (lineWatchRef.current) {
        cancelAnimationFrame(lineWatchRef.current);
        lineWatchRef.current = null;
      }
      if (v) {
        v.pause();
        if (hasBacking) v.muted = true;
      }
      if (refAudioRef.current) {
        refAudioRef.current.pause();
        refAudioRef.current = null;
      }
      setIsPlayingRef(false);
      setWaveProgress(0);
      setStatus("Ready. Press Record to perform this line.");
    };

    const watchVideoEnd = () => {
      if (!v) return;
      const startSec = line.startMs / 1000;
      const span = Math.max(0.05, endSec - startSec);
      const tick = () => {
        if (v.currentTime >= endSec || v.paused) {
          finishReplay();
          return;
        }
        setWaveProgress(
          Math.max(0, Math.min(1, (v.currentTime - startSec) / span))
        );
        lineWatchRef.current = requestAnimationFrame(tick);
      };
      lineWatchRef.current = requestAnimationFrame(tick);
    };

    // Vocal slice + video picture-in-sync (video stays muted so we don't double dialogue).
    if (line.referenceAudioUrl) {
      setStatus("Playing reference…");
      setIsPlayingRef(true);
      const audio = new Audio(line.referenceAudioUrl);
      refAudioRef.current = audio;
      audio.onended = () => finishReplay();
      audio.onerror = () => {
        finishReplay();
        setStatus("Could not play reference. Try again.");
      };

      const start = async () => {
        try {
          if (hasVideo && v) {
            v.muted = true;
            v.currentTime = line.startMs / 1000;
            await v.play();
            watchVideoEnd();
          }
          await audio.play();
        } catch {
          finishReplay();
          setStatus("Could not play reference. Try again.");
        }
      };
      void start();
      return;
    }

    if (hasVideo && v) {
      setStatus(
        hasBacking
          ? "Playing reference (original audio for this line)…"
          : "Playing reference clip..."
      );
      setIsPlayingRef(true);
      // No stem slice: unmute video for this window only.
      v.muted = false;
      v.currentTime = line.startMs / 1000;
      const play = async () => {
        try {
          await v.play();
        } catch {
          setIsPlayingRef(false);
          if (hasBacking) v.muted = true;
          setStatus("Could not play video. Try again.");
          return;
        }
        watchVideoEnd();
      };
      void play();
      return;
    }

    setStatus("Playing reference...");
    setIsPlayingRef(true);
    const utterance = speakReference(line.text);
    utterance.onend = () => {
      setIsPlayingRef(false);
      setStatus("Ready. Press Record to perform this line.");
    };
    speechSynthesis.speak(utterance);
  }, [hasVideo, hasBacking, line, stopLinePlayback]);

  const handleRecord = useCallback(async () => {
    if (isRecordingRef.current) {
      await cancelTake();
      return;
    }

    try {
      stopLinePlayback();
      clearRecordWatchers();
      await recorderRef.current!.start();
      setIsRecording(true);
      setUserPeaks([]);

      const lineDurMs = Math.max(400, line.endMs - line.startMs);
      const v = videoRef.current;
      // Clamp to media duration so the last line still finishes when the file ends.
      const mediaEndSec =
        v && Number.isFinite(v.duration) && v.duration > 0
          ? v.duration
          : line.endMs / 1000;
      const startSec = line.startMs / 1000;
      const endSec = Math.min(line.endMs / 1000, mediaEndSec);

      startLevelMonitor({ startSec, endSec, lineDurMs });

      setStatus(
        hasVideo
          ? "Dubbing… tap Stop to restart this line."
          : "Dubbing… tap Stop to restart this line."
      );

      // Hard fallback so a take can never hang if video stalls before endSec.
      recordTimerRef.current = setTimeout(() => {
        void finalizeTake();
      }, lineDurMs + 400);

      if (hasVideo && v) {
        v.muted = true;
        v.currentTime = line.startMs / 1000;
        try {
          await v.play();
        } catch {
          // Timer fallback above will finalize.
          return;
        }
        const tick = () => {
          if (!isRecordingRef.current) return;
          if (v.ended || v.currentTime >= endSec - 0.02) {
            void finalizeTake();
            return;
          }
          recordWatchRef.current = requestAnimationFrame(tick);
        };
        recordWatchRef.current = requestAnimationFrame(tick);
      }
    } catch {
      setStatus("Microphone access denied. Check browser permissions.");
      setIsRecording(false);
      stopLevelMonitor();
      clearRecordWatchers();
    }
  }, [
    cancelTake,
    clearRecordWatchers,
    finalizeTake,
    hasVideo,
    line,
    startLevelMonitor,
    stopLevelMonitor,
    stopLinePlayback,
  ]);

  const handleSaveProgress = useCallback(async () => {
    if (mode !== "single" || recordingsRef.current.length === 0) return;
    setSavingProgress(true);
    try {
      await savePackProgress(
        pack.id,
        lineIndex,
        recordingsRef.current,
        progressCtx
      );
      markProgressSaved(recordingsRef.current, new Date().toISOString());
      setStatus(
        user && online
          ? `Progress saved to your profile — ${recordingsRef.current.length} line${recordingsRef.current.length === 1 ? "" : "s"}.`
          : `Progress saved on this device — ${recordingsRef.current.length} line${recordingsRef.current.length === 1 ? "" : "s"}.`
      );
    } catch {
      setStatus("Could not save progress. Try again.");
    } finally {
      setSavingProgress(false);
    }
  }, [mode, pack.id, lineIndex, progressCtx, user, online, markProgressSaved]);

  const handleNext = useCallback(() => {
    if (!currentRecording) return;

    abortAllPlayback();
    if (lineIndex < totalLines - 1) {
      setLineIndex((i) => i + 1);
      setStatus("Ready. Press Replay to hear the line or Record to perform it.");
    } else {
      void clearPackProgress(pack.id, progressCtx);
      onComplete(recordingsRef.current);
    }
  }, [
    abortAllPlayback,
    currentRecording,
    lineIndex,
    totalLines,
    pack.id,
    progressCtx,
    onComplete,
  ]);

  const requestLeave = useCallback(() => {
    abortAllPlayback();
    const hasRecordings = recordingsRef.current.length > 0;
    const unsaved =
      mode === "single" ? hasRecordings && !isProgressSaved() : hasRecordings;
    if (unsaved) {
      setLeaveOpen(true);
      return;
    }
    onBack();
  }, [abortAllPlayback, mode, onBack, isProgressSaved]);

  const confirmLeave = useCallback(() => {
    setLeaveOpen(false);
    abortAllPlayback();
    onBack();
  }, [abortAllPlayback, onBack]);

  const saveAndLeave = useCallback(async () => {
    if (mode === "single" && recordingsRef.current.length > 0) {
      setSavingProgress(true);
      try {
        await savePackProgress(
          pack.id,
          lineIndex,
          recordingsRef.current,
          progressCtx
        );
        markProgressSaved(recordingsRef.current, new Date().toISOString());
      } catch {
        setSavingProgress(false);
        setStatus("Could not save progress. Try again.");
        return;
      }
      setSavingProgress(false);
    }
    setLeaveOpen(false);
    abortAllPlayback();
    onBack();
  }, [abortAllPlayback, mode, onBack, pack.id, lineIndex, progressCtx, markProgressSaved]);

  const canSaveProgress =
    mode === "single" &&
    progressLoaded &&
    recordings.length > 0 &&
    !isRecording &&
    !isPlayingTake &&
    !isProgressSaved();

  return (
    <div className="cv-recording flex flex-col h-full min-h-0 overflow-hidden bg-es-screen text-white">
      <div className="app-stage-topbar px-3 sm:px-4 py-2 border-b-3 border-black shrink-0">
        <div className="flex items-start gap-2 sm:gap-3">
          <AppBackButton onClick={requestLeave} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-es-brand">
              {modeEyebrow}
            </p>
            <h2 className="font-title text-sm sm:text-lg text-es-yellow truncate normal-case">
              {pack.title}
            </h2>
          </div>
          <p className="text-[10px] sm:text-xs text-es-text-secondary uppercase shrink-0 pt-1">
            Line {lineIndex + 1} / {totalLines}
          </p>
          {canSaveProgress ? (
            <button
              type="button"
              className="brutal-btn brutal-btn-sm bg-es-blue text-white shrink-0 text-[10px] px-2 py-1"
              disabled={savingProgress}
              onClick={() => void handleSaveProgress()}
            >
              {savingProgress ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
        {mode === "single" && savedProgressAt && isProgressSaved() ? (
          <p className="text-[10px] text-es-phosphor mt-1 normal-case">
            {recordings.length} line{recordings.length === 1 ? "" : "s"} saved
            {user && online ? " to your profile" : " on this device"}
          </p>
        ) : null}
      </div>

      <div className="cv-recording__body flex flex-col lg:flex-row flex-1 min-h-0">
        <div className="cv-recording__stage relative w-full lg:min-w-0 lg:flex-1 border-b-3 lg:border-b-0 lg:border-r-3 border-black min-h-0">
          <div className="cv-recording__frame">
            {hasVideo ? (
              <video
                ref={videoRef}
                src={pack.videoUrl}
                className="cv-recording__video"
                playsInline
                preload="auto"
                muted={hasBacking}
              />
            ) : pack.thumbnailUrl.startsWith("blob:") ||
              pack.thumbnailUrl.startsWith("data:") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pack.thumbnailUrl}
                alt=""
                className="cv-recording__fallback"
              />
            ) : (
              <Image
                src={pack.thumbnailUrl}
                alt=""
                width={1280}
                height={720}
                className="cv-recording__fallback"
                sizes="(max-width: 640px) 100vw, 60vw"
                priority
              />
            )}
            {!hasVideo ? (
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
            ) : null}
            <div className="cv-recording__stage-overlay pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4 bg-gradient-to-t from-black/80 to-transparent">
              <p className="text-[10px] text-es-phosphor uppercase tracking-widest mb-0.5">
                {hasVideo ? "Video line" : "Scene Preview"}
              </p>
              <p className="font-title text-sm text-white truncate">
                {pack.title}
              </p>
            </div>
            <span className="absolute top-2 left-2 brutal-border bg-es-error text-white text-[10px] px-2 py-0.5 uppercase">
              {line.speaker}
            </span>
            <span className="absolute top-2 right-2 text-[9px] text-white/60 uppercase tracking-wider">
              IMITATION.STAR
            </span>
          </div>
        </div>

        <div className="w-full lg:w-[min(44%,360px)] flex-1 lg:flex-none lg:shrink-0 flex flex-col min-h-0 bg-es-bg-secondary border-l-0 lg:border-l-4 border-es-yellow">
          <div className="flex-1 p-4 sm:p-5 flex flex-col min-h-0 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-es-brand mb-2">
              Your Line
            </p>
            <p className="font-title text-lg sm:text-2xl leading-snug normal-case text-white">
              {line.text}
            </p>
            <p className="mt-2 text-[10px] text-es-text-secondary normal-case">
              Replay the original, record your dub, then play your take back before moving on.
            </p>

            <div className="mt-4 space-y-2">
              <SoundWave
                peaks={refPeaks}
                active={isPlayingRef}
                progress={
                  isRecording || isPlayingRef ? waveProgress : undefined
                }
                label="Original"
              />
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="cv-wave-label mb-0">
                    {isRecording
                      ? "Your take (live)"
                      : currentRecording
                        ? "Your take"
                        : "Your take (empty)"}
                  </p>
                  <div className="min-h-[1.25rem]">
                    {currentRecording && !isRecording ? (
                      <button
                        type="button"
                        onClick={() => void handlePlayTake()}
                        disabled={isPlayingRef}
                        className="brutal-btn brutal-btn-sm bg-es-yellow text-black px-2 py-0.5 text-[10px] shrink-0"
                      >
                        {isPlayingTake ? "■ Stop" : "▶ Play take"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <SoundWave
                  peaks={isRecording ? livePeaks : userPeaks}
                  active={isRecording || isPlayingTake}
                  muted={!isRecording && userPeaks.length === 0}
                  progress={
                    isRecording || isPlayingTake ? waveProgress : undefined
                  }
                  reveal={isRecording}
                />
                {currentRecording && hasBacking && !isRecording ? (
                  <p className="mt-1 text-[9px] text-es-text-secondary normal-case">
                    Playback mixes your take with the backing track (no dialogue).
                  </p>
                ) : null}
              </div>
            </div>

            <div
              className={`mt-3 brutal-border bg-black/60 p-2 min-h-[3.35rem] ${
                isRecording ? "" : "invisible pointer-events-none"
              }`}
              aria-hidden={!isRecording}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-es-error recording-pulse" />
                <span className="text-[10px] text-es-error uppercase">
                  Recording
                </span>
              </div>
              <div className="h-2 bg-es-bg-tertiary brutal-border overflow-hidden">
                <div
                  className="h-full bg-es-error transition-all duration-100"
                  style={{ width: `${isRecording ? micLevel : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t-3 border-black bg-es-darker px-2 sm:px-3 py-2 safe-bottom">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleReplay}
            disabled={isRecording || isPlayingTake}
            className="cv-studio-btn bg-es-bg-tertiary text-white"
          >
            <span className="cv-studio-btn-icon" aria-hidden="true">
              ▶
            </span>
            <span className="cv-studio-btn-title">Replay</span>
            <span className="cv-studio-btn-sub">
              {hasVideo
                ? hasBacking
                  ? "Original line audio"
                  : "Play this line’s clip"
                : "Hear the original"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleRecord()}
            disabled={isPlayingTake}
            className={`cv-studio-btn ${
              isRecording
                ? "bg-es-error text-white recording-pulse"
                : "bg-es-warm text-black"
            }`}
          >
            <span className="cv-studio-btn-icon" aria-hidden="true">
              {isRecording ? "■" : "●"}
            </span>
            <span className="cv-studio-btn-title">
              {isRecording
                ? "Stop"
                : currentRecording
                  ? "Re-record"
                  : "Record"}
            </span>
            <span className="cv-studio-btn-sub">
              {isRecording
                ? "End early and try again"
                : currentRecording
                  ? "Replace your take for this line"
                  : "Mic + video for this line"}
            </span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={!currentRecording || isRecording || isPlayingTake}
            className="cv-studio-btn bg-es-bg-tertiary text-es-text-secondary disabled:opacity-45"
          >
            <span className="cv-studio-btn-title">
              {isLastLine ? "Finish →" : "Next →"}
            </span>
            <span className="cv-studio-btn-sub">
              {currentRecording
                ? isLastLine
                  ? "Complete your dub"
                  : "Continue to next line"
                : "Record this line to continue"}
            </span>
          </button>
        </div>

        <p className="text-[10px] text-center text-es-text-secondary mt-2 normal-case px-1">
          {status}
        </p>
      </div>

      {leaveOpen ? (
        <ConfirmDialog
          title="Leave this dub?"
          message={
            mode === "single"
              ? "Save progress to pick up this pack later, or leave without saving to discard your takes."
              : "You have recorded lines that will be lost if you leave now."
          }
          cancelLabel="Stay"
          secondaryLabel={
            mode === "single" &&
            recordingsRef.current.length > 0 &&
            !isProgressSaved()
              ? "Save & leave"
              : undefined
          }
          confirmLabel="Leave anyway"
          tone="red"
          busy={savingProgress}
          fixed
          onSecondary={
            mode === "single" ? () => void saveAndLeave() : undefined
          }
          onCancel={() => setLeaveOpen(false)}
          onConfirm={confirmLeave}
        />
      ) : null}
    </div>
  );
}
