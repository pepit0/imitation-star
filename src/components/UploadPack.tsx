"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { DubLine, DubPack } from "@/lib/types";
import {
  BACKING_MAX_BYTES,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_DURATION_SEC,
  formatTimecodePrecise,
  loadUserPackMediaForEdit,
  parseTimecodeToMs,
  persistUploadedPack,
} from "@/lib/packStore";
import { extractWaveformPeaks } from "@/lib/waveform";
import {
  checkPackJobsConfigured,
  fetchStemAsFile,
  pollPackJob,
  startPackJob,
  type PackJobPublic,
} from "@/lib/packJobs";
import { buildPackZip, downloadBlob } from "@/lib/packExport";
import { canContinueToReview } from "@/lib/packMakerValidation";
import {
  importCvPackZip,
  type CvImportResult,
} from "@/lib/packImport";
import {
  loadCachedOgvProxy,
  ogvProxyCacheKey,
  transcodeOgvToMp4,
} from "@/lib/transcodeOgv";
import { useAuth } from "@/components/auth/AuthProvider";
import PackMakerVideo, {
  type PackMakerVideoHandle,
} from "@/components/PackMakerVideo";

interface UploadPackProps {
  onBack: () => void;
  onSaved: (pack: DubPack) => void;
  /** Re-open a player-owned pack for edits. */
  editPack?: DubPack | null;
}

type Character = {
  id: string;
  name: string;
  color: string;
};

type DraftClip = {
  id: string;
  characterId: string;
  text: string;
  startMs: number;
  endMs: number;
};

type PackKind = "dub" | "voice";

type EditSnapshot = {
  characters: Character[];
  clips: DraftClip[];
  activeClipId: string | null;
};

const MIN_CLIP_MS = 400;
const DEFAULT_CLIP_MS = 3000;
const CHAR_COLORS = [
  "#375F57",
  "#6B7C85",
  "#8B5E3C",
  "#6A4C93",
  "#6B8E23",
  "#FF595E",
  "#1982C4",
  "#FFCA3A",
];

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function nextCharacterName(existing: Character[]) {
  return `Character ${String.fromCharCode(65 + (existing.length % 26))}`;
}

function nextCharacterColor(existing: Character[]) {
  return CHAR_COLORS[existing.length % CHAR_COLORS.length];
}

export default function UploadPack({
  onBack,
  onSaved,
  editPack = null,
}: UploadPackProps) {
  const { user, profile } = useAuth();
  const mediaRef = useRef<PackMakerVideoHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const zipFileRef = useRef<HTMLInputElement>(null);
  const backingFileRef = useRef<HTMLInputElement>(null);
  const thumbFileRef = useRef<HTMLInputElement>(null);
  const refAudioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [backingFile, setBackingFile] = useState<File | null>(null);
  const [vocalsFile, setVocalsFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [clips, setClips] = useState<DraftClip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [wavePeaks, setWavePeaks] = useState<number[]>([]);
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [separating, setSeparating] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobsConfigured, setJobsConfigured] = useState<boolean | null>(null);
  const [makerStep, setMakerStep] = useState<"edit" | "review">("edit");
  const [reviewThumb, setReviewThumb] = useState<Blob | null>(null);
  const [reviewThumbUrl, setReviewThumbUrl] = useState<string | null>(null);
  const [pickingFrame, setPickingFrame] = useState(false);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(Boolean(editPack));
  const [packKind, setPackKind] = useState<PackKind>("dub");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [ogvWarning, setOgvWarning] = useState(false);
  const [useOgvVideo, setUseOgvVideo] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [transcodeProgress, setTranscodeProgress] = useState(-1);
  const [transcodeLabel, setTranscodeLabel] = useState<string | null>(null);
  /** False while converting / loading cached MP4 until <video> metadata is ready. */
  const [videoFrameReady, setVideoFrameReady] = useState(false);
  const transcodeAbortRef = useRef<AbortController | null>(null);
  const [lineRefByClipId, setLineRefByClipId] = useState<Record<string, Blob>>(
    {}
  );
  const [clipImageUrlById, setClipImageUrlById] = useState<
    Record<string, string>
  >({});
  const [past, setPast] = useState<EditSnapshot[]>([]);
  const [future, setFuture] = useState<EditSnapshot[]>([]);
  const separateAbortRef = useRef<AbortController | null>(null);
  const hydratedEditIdRef = useRef<string | null>(null);

  const charactersRef = useRef(characters);
  const clipsRef = useRef(clips);
  const activeClipIdRef = useRef(activeClipId);

  const dragEdgeRef = useRef<null | {
    clipId: string;
    edge: "start" | "end";
    before: EditSnapshot;
  }>(null);
  const dragCreateRef = useRef<null | {
    startMs: number;
    characterId: string | null; // null = new character lane
    before: EditSnapshot;
    pointerId: number;
  }>(null);
  /** Live draft range while dragging — kept out of setState updaters to avoid Strict Mode double-commit. */
  const draftCreateRef = useRef<{
    startMs: number;
    endMs: number;
    characterId: string | null;
  } | null>(null);
  const [draftCreate, setDraftCreate] = useState<{
    startMs: number;
    endMs: number;
    characterId: string | null;
  } | null>(null);
  const dragListenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);
  useEffect(() => {
    activeClipIdRef.current = activeClipId;
  }, [activeClipId]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    return () => {
      if (posterUrl) URL.revokeObjectURL(posterUrl);
    };
  }, [posterUrl]);

  useEffect(() => {
    if (!reviewThumb) {
      setReviewThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(reviewThumb);
    setReviewThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [reviewThumb]);

  useEffect(() => {
    const urls = Object.values(clipImageUrlById);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [clipImageUrlById]);

  useEffect(() => {
    void checkPackJobsConfigured().then(setJobsConfigured);
    return () => {
      separateAbortRef.current?.abort();
      transcodeAbortRef.current?.abort();
      if (dragListenersRef.current) {
        window.removeEventListener("pointermove", dragListenersRef.current.move);
        window.removeEventListener("pointerup", dragListenersRef.current.up);
        window.removeEventListener("pointercancel", dragListenersRef.current.up);
        dragListenersRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!editPack) {
      setHydrating(false);
      return;
    }
    if (hydratedEditIdRef.current === editPack.id) return;
    hydratedEditIdRef.current = editPack.id;

    let cancelled = false;
    setHydrating(true);
    setError(null);

    void (async () => {
      try {
        const media = await loadUserPackMediaForEdit(editPack.id);
        if (cancelled) return;
        if (!media) {
          setError("Could not load that pack for editing.");
          setHydrating(false);
          return;
        }

        const isVoice =
          !media.videoFile ||
          editPack.tags?.includes("voice") ||
          (!editPack.videoUrl && editPack.lines.some((l) => l.referenceAudioUrl));

        if (media.videoFile) {
          const url = URL.createObjectURL(media.videoFile);
          setObjectUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setFile(media.videoFile);
          setPackKind("dub");
          setVideoFrameReady(false);
        } else {
          setObjectUrl(null);
          setFile(null);
          setPackKind("voice");
          setVideoFrameReady(true);
        }

        const speakerOrder: string[] = [];
        for (const line of editPack.lines) {
          const name = line.speaker.trim() || "SPEAKER";
          if (!speakerOrder.includes(name)) speakerOrder.push(name);
        }
        const nextChars: Character[] = speakerOrder.map((name, i) => ({
          id: newId("char"),
          name,
          color: CHAR_COLORS[i % CHAR_COLORS.length],
        }));
        const charIdByName = new Map(nextChars.map((c) => [c.name, c.id]));
        const nextClips: DraftClip[] = editPack.lines.map((line) => {
          const name = line.speaker.trim() || "SPEAKER";
          return {
            id: line.id || newId("clip"),
            characterId: charIdByName.get(name) ?? nextChars[0]!.id,
            text: line.text,
            startMs: line.startMs,
            endMs: Math.max(line.startMs + MIN_CLIP_MS, line.endMs),
          };
        });

        charactersRef.current = nextChars;
        clipsRef.current = nextClips;
        activeClipIdRef.current = nextClips[0]?.id ?? null;

        const nextLineRefs: Record<string, Blob> = {
          ...(media.lineRefBlobs ?? {}),
        };
        setLineRefByClipId(nextLineRefs);

        if (media.thumbBlob) {
          setPosterUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(media.thumbBlob!);
          });
          setReviewThumb(media.thumbBlob);
        }

        setBackingFile(media.backingFile);
        setVocalsFile(media.vocalsFile);
        setTitle(editPack.title);
        setCreator(editPack.creator);
        setCharacters(nextChars);
        setClips(nextClips);
        setActiveClipId(nextClips[0]?.id ?? null);
        setEditingPackId(editPack.id);
        setPast([]);
        setFuture([]);
        setMakerStep("edit");
        setCurrentMs(0);
        setDurationMs(
          isVoice
            ? nextClips.reduce((max, c) => Math.max(max, c.endMs), 0)
            : Math.max(
                60000,
                nextClips.reduce((max, c) => Math.max(max, c.endMs), 0) + 5000
              )
        );

        try {
          if (media.videoFile) {
            setWavePeaks(
              await extractWaveformPeaks(media.videoFile, { barCount: 240 })
            );
          } else {
            setWavePeaks([]);
          }
        } catch {
          setWavePeaks([]);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to open pack for editing."
          );
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per editPack id
  }, [editPack?.id]);

  useEffect(() => {
    if (editPack) return;
    if (!creator.trim() && profile?.displayName) {
      setCreator(profile.displayName);
    }
  }, [profile?.displayName, editPack, creator]);

  const snapshot = useCallback(
    (): EditSnapshot => ({
      characters: charactersRef.current.map((c) => ({ ...c })),
      clips: clipsRef.current.map((c) => ({ ...c })),
      activeClipId: activeClipIdRef.current,
    }),
    []
  );

  const pushHistory = useCallback(() => {
    setPast((p) => [...p.slice(-49), snapshot()]);
    setFuture([]);
  }, [snapshot]);

  const applySnapshot = useCallback((s: EditSnapshot) => {
    const nextChars = s.characters.map((c) => ({ ...c }));
    const nextClips = s.clips.map((c) => ({ ...c }));
    charactersRef.current = nextChars;
    clipsRef.current = nextClips;
    activeClipIdRef.current = s.activeClipId;
    setCharacters(nextChars);
    setClips(nextClips);
    setActiveClipId(s.activeClipId);
  }, []);

  const setClipsAndRef = useCallback((next: DraftClip[]) => {
    clipsRef.current = next;
    setClips(next);
  }, []);

  const setCharactersAndRef = useCallback((next: Character[]) => {
    charactersRef.current = next;
    setCharacters(next);
  }, []);

  const setActiveClipIdAndRef = useCallback((id: string | null) => {
    activeClipIdRef.current = id;
    setActiveClipId(id);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [snapshot(), ...f].slice(0, 50));
      applySnapshot(prev);
      return p.slice(0, -1);
    });
  }, [snapshot, applySnapshot]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p.slice(-49), snapshot()]);
      applySnapshot(next);
      return f.slice(1);
    });
  }, [snapshot, applySnapshot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => a.startMs - b.startMs),
    [clips]
  );

  const activeClip = useMemo(
    () => clips.find((c) => c.id === activeClipId) ?? null,
    [clips, activeClipId]
  );

  const activeCharacter = useMemo(() => {
    if (!activeClip) return null;
    return characters.find((c) => c.id === activeClip.characterId) ?? null;
  }, [activeClip, characters]);

  const activeIndex = useMemo(() => {
    if (!activeClip) return -1;
    return sortedClips.findIndex((c) => c.id === activeClip.id);
  }, [sortedClips, activeClip]);

  const charById = useCallback(
    (id: string) => characters.find((c) => c.id === id),
    [characters]
  );

  const editorReady =
    Boolean(objectUrl) ||
    (packKind === "voice" && clips.length > 0) ||
    (packKind === "dub" && clips.length > 0);

  const applyMp4Preview = useCallback(
    async (mp4Blob: Blob, sourceName: string, fromCache = false) => {
      const mp4File = new File(
        [mp4Blob],
        sourceName.replace(/\.ogv$/i, ".mp4"),
        { type: "video/mp4" }
      );
      setVideoFrameReady(false);
      setTranscodeProgress(fromCache ? 70 : 95);
      setTranscodeLabel(
        fromCache ? "Loading cached MP4 preview…" : "Finishing MP4 preview…"
      );
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(mp4Blob);
      });
      setFile(mp4File);
      setUseOgvVideo(false);
      try {
        setWavePeaks(await extractWaveformPeaks(mp4File, { barCount: 240 }));
      } catch {
        setWavePeaks([]);
      }
    },
    []
  );

  const runOgvTranscode = useCallback(
    async (ogvFile: File) => {
      transcodeAbortRef.current?.abort();
      const ac = new AbortController();
      transcodeAbortRef.current = ac;

      setVideoFrameReady(false);
      setTranscodeProgress(0);
      setTranscodeLabel("Checking for cached preview…");
      setImportStatus("Preparing fast MP4 preview…");

      try {
        const cacheKey = ogvProxyCacheKey(ogvFile, ogvFile.name);
        const cached = await loadCachedOgvProxy(cacheKey);
        if (cached && !ac.signal.aborted) {
          await applyMp4Preview(cached, ogvFile.name, true);
          setImportStatus("Loading cached MP4 preview…");
          return;
        }

        const mp4Blob = await transcodeOgvToMp4(ogvFile, ogvFile.name, {
          signal: ac.signal,
          onProgress: (pct, label) => {
            setTranscodeProgress(pct);
            setTranscodeLabel(label);
            setImportStatus(label);
          },
        });

        if (ac.signal.aborted) return;

        await applyMp4Preview(mp4Blob, ogvFile.name, false);
        setImportStatus("Finishing MP4 preview…");
      } catch (e) {
        if (ac.signal.aborted) return;
        const detail =
          e instanceof Error ? e.message : "Unknown conversion error";
        setTranscodeProgress(-1);
        setTranscodeLabel(null);
        setError(`OGV convert failed: ${detail}`);
        setImportStatus(
          "Could not convert OGV — falling back to OGV player. Built-in packs work because they already ship as MP4."
        );
        setUseOgvVideo(true);
        setVideoFrameReady(false);
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(ogvFile);
        });
      }
    },
    [applyMp4Preview]
  );

  const applyCvImport = useCallback(
    async (result: CvImportResult) => {
      setError(null);
      setImportStatus(null);
      setOgvWarning(result.ogvVideo);
      setUseOgvVideo(false);
      setVideoFrameReady(false);
      setTranscodeProgress(-1);
      setTranscodeLabel(null);

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (posterUrl) URL.revokeObjectURL(posterUrl);
      for (const url of Object.values(clipImageUrlById)) {
        URL.revokeObjectURL(url);
      }

      const speakerOrder: string[] = [];
      for (const clip of result.clips) {
        const name = clip.speaker.trim() || "Speaker";
        if (!speakerOrder.includes(name)) speakerOrder.push(name);
      }
      const nextChars: Character[] = speakerOrder.map((name, i) => ({
        id: newId("char"),
        name,
        color: CHAR_COLORS[i % CHAR_COLORS.length],
      }));
      const charIdByName = new Map(nextChars.map((c) => [c.name, c.id]));

      const nextClips: DraftClip[] = result.clips.map((clip) => {
        const name = clip.speaker.trim() || "Speaker";
        return {
          id: clip.id,
          characterId: charIdByName.get(name) ?? nextChars[0]!.id,
          text: clip.text,
          startMs: clip.startMs,
          endMs: Math.max(clip.startMs + MIN_CLIP_MS, clip.endMs),
        };
      });

      const nextLineRefs: Record<string, Blob> = {};
      const nextImageUrls: Record<string, string> = {};
      for (const clip of result.clips) {
        if (clip.audioBlob.size > 0) nextLineRefs[clip.id] = clip.audioBlob;
        if (clip.imageBlob) {
          nextImageUrls[clip.id] = URL.createObjectURL(clip.imageBlob);
        }
      }

      charactersRef.current = nextChars;
      clipsRef.current = nextClips;
      activeClipIdRef.current = nextClips[0]?.id ?? null;

      setPackKind(result.kind === "voice" ? "voice" : "dub");
      setTitle(result.title);
      setCreator(result.creator);
      setCharacters(nextChars);
      setClips(nextClips);
      setActiveClipId(nextClips[0]?.id ?? null);
      setLineRefByClipId(nextLineRefs);
      setClipImageUrlById(nextImageUrls);
      setPast([]);
      setFuture([]);
      setMakerStep("edit");
      setReviewThumb(null);
      setEditingPackId(null);
      hydratedEditIdRef.current = null;
      setBackingFile(result.backingFile);
      setVocalsFile(null);
      setWavePeaks([]);
      setCurrentMs(0);
      setDurationMs(
        result.kind === "voice"
          ? nextClips.reduce((max, c) => Math.max(max, c.endMs), 0)
          : Math.max(
              60000,
              nextClips.reduce((max, c) => Math.max(max, c.endMs), 0) + 5000
            )
      );

      let nextPosterUrl: string | null = null;
      if (result.thumbBlob) {
        nextPosterUrl = URL.createObjectURL(result.thumbBlob);
      } else {
        const firstClipId = nextClips[0]?.id;
        if (firstClipId && nextImageUrls[firstClipId]) {
          nextPosterUrl = nextImageUrls[firstClipId]!;
        }
      }
      setPosterUrl(nextPosterUrl);

      if (result.videoFile) {
        setFile(result.videoFile);
        if (result.ogvVideo) {
          setObjectUrl(null);
          setImportStatus(
            `Imported ${result.clips.length} clips — edit now while we build a fast MP4 preview…`
          );
          void runOgvTranscode(result.videoFile);
        } else {
          const url = URL.createObjectURL(result.videoFile);
          setObjectUrl(url);
          setVideoFrameReady(false);
          try {
            setWavePeaks(
              await extractWaveformPeaks(result.videoFile, { barCount: 240 })
            );
          } catch {
            setWavePeaks([]);
          }
          const kindLabel =
            result.kind === "voice"
              ? "voice pack"
              : result.kind === "dub"
                ? "dub pack"
                : "pack";
          setImportStatus(
            `Imported ${result.clips.length} clips from Choicer Voicer ${kindLabel}.`
          );
        }
      } else {
        setFile(null);
        setObjectUrl(null);
        const kindLabel =
          result.kind === "voice"
            ? "voice pack"
            : result.kind === "dub"
              ? "dub pack"
              : "pack";
        setImportStatus(
          `Imported ${result.clips.length} clips from Choicer Voicer ${kindLabel}.`
        );
      }

      if (result.thumbBlob && !result.videoFile) {
        setReviewThumb(result.thumbBlob);
      }
    },
    [objectUrl, clipImageUrlById, posterUrl, runOgvTranscode]
  );

  const onPickZip = useCallback(
    async (f: File | null) => {
      if (!f) return;
      setImporting(true);
      setError(null);
      setImportStatus("Reading ZIP…");
      try {
        const result = await importCvPackZip(f);
        await applyCvImport(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
        setImportStatus(null);
      } finally {
        setImporting(false);
      }
    },
    [applyCvImport]
  );

  const onPickFile = useCallback(
    async (f: File | null) => {
      setError(null);
      if (!f) return;
      if (!f.type.startsWith("video/")) {
        setError("Please choose an MP4 or other video file.");
        return;
      }
      if (f.size > UPLOAD_MAX_BYTES) {
        setError("Video must be 95 MB or smaller.");
        return;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      transcodeAbortRef.current?.abort();
      setTranscodeProgress(-1);
      setTranscodeLabel(null);
      const isOgv = /\.ogv$/i.test(f.name) || f.type.includes("ogg");
      setUseOgvVideo(false);
      setVideoFrameReady(false);
      if (isOgv) {
        setFile(f);
        setObjectUrl(null);
        setTitle(f.name.replace(/\.[^.]+$/, "") || "Untitled pack");
        void runOgvTranscode(f);
      } else {
        const url = URL.createObjectURL(f);
        setFile(f);
        setObjectUrl(url);
      }
      setTitle(f.name.replace(/\.[^.]+$/, "") || "Untitled pack");
      charactersRef.current = [];
      clipsRef.current = [];
      activeClipIdRef.current = null;
      setCharacters([]);
      setClips([]);
      setActiveClipId(null);
      setPast([]);
      setFuture([]);
      draftCreateRef.current = null;
      dragCreateRef.current = null;
      dragEdgeRef.current = null;
      setDraftCreate(null);
      setWavePeaks([]);
      setCurrentMs(0);
      setBackingFile(null);
      setVocalsFile(null);
      setJobStatus(null);
      setMakerStep("edit");
      setReviewThumb(null);
      setEditingPackId(null);
      hydratedEditIdRef.current = null;
      setPackKind("dub");
      setLineRefByClipId({});
      for (const url of Object.values(clipImageUrlById)) {
        URL.revokeObjectURL(url);
      }
      setClipImageUrlById({});
      setOgvWarning(false);
      setUseOgvVideo(false);
      if (posterUrl) URL.revokeObjectURL(posterUrl);
      setPosterUrl(null);
      setTranscodeProgress(-1);
      setTranscodeLabel(null);
      transcodeAbortRef.current?.abort();
      setImportStatus(null);
      if (!isOgv) {
        try {
          setWavePeaks(await extractWaveformPeaks(f, { barCount: 240 }));
        } catch {
          setWavePeaks([]);
        }
      }
    },
    [objectUrl, clipImageUrlById, posterUrl, runOgvTranscode]
  );

  const onMediaLoaded = useCallback(
    (durationSec: number) => {
      if (durationSec > UPLOAD_MAX_DURATION_SEC) {
        setError("Video must be 5 minutes or shorter.");
        setFile(null);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
        setVideoFrameReady(false);
        setTranscodeLabel(null);
        setTranscodeProgress(-1);
        return;
      }
      if (Number.isFinite(durationSec) && durationSec > 0) {
        setDurationMs(Math.round(durationSec * 1000));
      }
      // Always clear the loading overlay once the player reports metadata —
      // duration may already be known from the import timeline.
      setVideoFrameReady(true);
      setTranscodeProgress(-1);
      setTranscodeLabel(null);
      setImportStatus((prev) =>
        prev?.includes("cached") ||
        prev?.includes("Finishing") ||
        prev?.includes("Converting") ||
        prev?.includes("Preparing") ||
        prev?.includes("preview")
          ? "MP4 preview ready."
          : prev
      );
    },
    [objectUrl]
  );

  // Safety net: if metadata events were missed, clear the overlay once the
  // media element actually has a duration / decoded frame.
  useEffect(() => {
    if (!objectUrl || videoFrameReady || useOgvVideo) return;
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const media = mediaRef.current;
      const dur = media?.getDurationSec() ?? 0;
      if (dur > 0) {
        onMediaLoaded(dur);
        return;
      }
      tries += 1;
      if (tries < 40) {
        window.setTimeout(tick, 100);
      }
    };
    const id = window.setTimeout(tick, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [objectUrl, videoFrameReady, useOgvVideo, onMediaLoaded]);

  const onMediaTimeUpdate = useCallback((currentSec: number) => {
    setCurrentMs(Math.round(currentSec * 1000));
  }, []);

  const onMediaPlayStateChange = useCallback((isPlaying: boolean) => {
    setPlaying(isPlaying);
  }, []);

  const onVideoError = useCallback(() => {
    if (ogvWarning) {
      setError(
        "This pack uses OGV video. If preview stays blank, use Replace video to swap in an MP4."
      );
    }
  }, [ogvWarning]);

  const seekTo = useCallback(
    (ms: number) => {
      const media = mediaRef.current;
      if (!media || !durationMs) return;
      const clamped = Math.max(0, Math.min(durationMs, ms));
      media.seekToSec(clamped / 1000);
      setCurrentMs(clamped);
    },
    [durationMs]
  );

  const togglePlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.isPaused()) void media.play();
    else media.pause();
  }, []);

  const msFromClientX = useCallback(
    (clientX: number) => {
      const el = timelineRef.current;
      if (!el || !durationMs) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * durationMs);
    },
    [durationMs]
  );

  /** Add clip for an existing character, or create Character A if none. */
  const addClipAtPlayhead = useCallback(() => {
    if (!durationMs) return;
    const start = Math.min(currentMs, durationMs - MIN_CLIP_MS);
    const end = Math.min(durationMs, start + DEFAULT_CLIP_MS);
    pushHistory();

    let nextChars = charactersRef.current;
    let characterId =
      activeClipIdRef.current
        ? clipsRef.current.find((c) => c.id === activeClipIdRef.current)
            ?.characterId ?? null
        : null;
    characterId = characterId ?? nextChars[0]?.id ?? null;

    if (!characterId) {
      const created: Character = {
        id: newId("char"),
        name: nextCharacterName([]),
        color: nextCharacterColor([]),
      };
      nextChars = [created];
      characterId = created.id;
      setCharactersAndRef(nextChars);
    }

    const clip: DraftClip = {
      id: newId("clip"),
      characterId,
      text: "",
      startMs: start,
      endMs: Math.max(start + MIN_CLIP_MS, end),
    };
    setClipsAndRef([...clipsRef.current, clip]);
    setActiveClipIdAndRef(clip.id);
    seekTo(start);
  }, [
    durationMs,
    currentMs,
    pushHistory,
    seekTo,
    setClipsAndRef,
    setCharactersAndRef,
    setActiveClipIdAndRef,
  ]);

  const addNewCharacterClip = useCallback(() => {
    if (!durationMs) return;
    const start = Math.min(currentMs, durationMs - MIN_CLIP_MS);
    const end = Math.min(durationMs, start + DEFAULT_CLIP_MS);
    pushHistory();
    const created: Character = {
      id: newId("char"),
      name: nextCharacterName(charactersRef.current),
      color: nextCharacterColor(charactersRef.current),
    };
    setCharactersAndRef([...charactersRef.current, created]);
    const clip: DraftClip = {
      id: newId("clip"),
      characterId: created.id,
      text: "",
      startMs: start,
      endMs: Math.max(start + MIN_CLIP_MS, end),
    };
    setClipsAndRef([...clipsRef.current, clip]);
    setActiveClipIdAndRef(clip.id);
    seekTo(start);
  }, [
    durationMs,
    currentMs,
    pushHistory,
    seekTo,
    setClipsAndRef,
    setCharactersAndRef,
    setActiveClipIdAndRef,
  ]);

  const updateClip = useCallback(
    (id: string, patch: Partial<DraftClip>) => {
      setClipsAndRef(
        clipsRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    [setClipsAndRef]
  );

  const renameCharacter = useCallback(
    (characterId: string, name: string) => {
      setCharactersAndRef(
        charactersRef.current.map((c) =>
          c.id === characterId ? { ...c, name } : c
        )
      );
    },
    [setCharactersAndRef]
  );

  const recolorCharacter = useCallback(
    (characterId: string, color: string) => {
      setCharactersAndRef(
        charactersRef.current.map((c) =>
          c.id === characterId ? { ...c, color } : c
        )
      );
    },
    [setCharactersAndRef]
  );

  const assignClipCharacter = useCallback(
    (clipId: string, characterId: string) => {
      pushHistory();
      setClipsAndRef(
        clipsRef.current.map((c) =>
          c.id === clipId ? { ...c, characterId } : c
        )
      );
    },
    [pushHistory, setClipsAndRef]
  );

  const deleteActiveClip = useCallback(() => {
    const id = activeClipIdRef.current;
    if (!id) return;
    pushHistory();
    const removed = clipsRef.current.find((c) => c.id === id);
    const remaining = clipsRef.current.filter((c) => c.id !== id);
    setClipsAndRef(remaining);

    if (removed) {
      const stillUsed = remaining.some(
        (c) => c.characterId === removed.characterId
      );
      if (!stillUsed) {
        setCharactersAndRef(
          charactersRef.current.filter((c) => c.id !== removed.characterId)
        );
      }
    }

    const sorted = [...remaining].sort((a, b) => a.startMs - b.startMs);
    const nextActive =
      sorted.find((c) => c.startMs >= (removed?.startMs ?? 0)) ??
      sorted[sorted.length - 1] ??
      null;
    setActiveClipIdAndRef(nextActive?.id ?? null);
    if (nextActive) seekTo(nextActive.startMs);
  }, [
    pushHistory,
    setClipsAndRef,
    setCharactersAndRef,
    setActiveClipIdAndRef,
    seekTo,
  ]);

  const previewClip = useCallback(async () => {
    if (packKind === "voice" && activeClip) {
      const ref = lineRefByClipId[activeClip.id];
      if (!ref) return;
      if (refAudioPreviewRef.current) {
        refAudioPreviewRef.current.pause();
        refAudioPreviewRef.current = null;
      }
      const audio = new Audio(URL.createObjectURL(ref));
      refAudioPreviewRef.current = audio;
      audio.onended = () => {
        if (refAudioPreviewRef.current === audio) {
          refAudioPreviewRef.current = null;
        }
        URL.revokeObjectURL(audio.src);
      };
      try {
        await audio.play();
      } catch {
        URL.revokeObjectURL(audio.src);
      }
      return;
    }

    const media = mediaRef.current;
    if (!media || !activeClip) return;
    media.seekToSec(activeClip.startMs / 1000);
    setCurrentMs(activeClip.startMs);
    try {
      await media.play();
    } catch {
      return;
    }
    const endSec = activeClip.endMs / 1000;
    const tick = () => {
      const m = mediaRef.current;
      if (!m) return;
      if (m.getCurrentTimeSec() >= endSec || m.isPaused()) {
        m.pause();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [activeClip, packKind, lineRefByClipId]);

  const clearDragListeners = useCallback(() => {
    if (!dragListenersRef.current) return;
    window.removeEventListener("pointermove", dragListenersRef.current.move);
    window.removeEventListener("pointerup", dragListenersRef.current.up);
    window.removeEventListener("pointercancel", dragListenersRef.current.up);
    dragListenersRef.current = null;
  }, []);

  const applyEdgeDrag = useCallback(
    (clipId: string, edge: "start" | "end", ms: number) => {
      const next = clipsRef.current.map((c) => ({ ...c }));
      const cur = next.find((c) => c.id === clipId);
      if (!cur) return;
      if (edge === "start") {
        cur.startMs = Math.max(0, Math.min(cur.endMs - MIN_CLIP_MS, ms));
      } else {
        cur.endMs = Math.max(
          cur.startMs + MIN_CLIP_MS,
          Math.min(durationMs, ms)
        );
      }
      setClipsAndRef(next);
    },
    [durationMs, setClipsAndRef]
  );

  const finishEdgeDrag = useCallback(() => {
    const edge = dragEdgeRef.current;
    if (!edge) return;
    dragEdgeRef.current = null;
    clearDragListeners();
    setPast((p) => [...p.slice(-49), edge.before]);
    setFuture([]);
  }, [clearDragListeners]);

  const finishCreateDrag = useCallback(() => {
    const create = dragCreateRef.current;
    const draft = draftCreateRef.current;
    // Clear first so a second pointerup/cancel cannot commit twice.
    dragCreateRef.current = null;
    draftCreateRef.current = null;
    setDraftCreate(null);
    clearDragListeners();
    if (!create || !draft) return;

    const span = draft.endMs - draft.startMs;
    if (span < MIN_CLIP_MS) return;

    let characterId = create.characterId;
    if (!characterId) {
      const created: Character = {
        id: newId("char"),
        name: nextCharacterName(charactersRef.current),
        color: nextCharacterColor(charactersRef.current),
      };
      setCharactersAndRef([...charactersRef.current, created]);
      characterId = created.id;
    }

    const clip: DraftClip = {
      id: newId("clip"),
      characterId,
      text: "",
      startMs: draft.startMs,
      endMs: draft.endMs,
    };
    setPast((p) => [...p.slice(-49), create.before]);
    setFuture([]);
    setClipsAndRef([...clipsRef.current, clip]);
    setActiveClipIdAndRef(clip.id);
  }, [
    clearDragListeners,
    setClipsAndRef,
    setCharactersAndRef,
    setActiveClipIdAndRef,
  ]);

  const beginEdgeDrag = useCallback(
    (e: React.PointerEvent, clipId: string, edge: "start" | "end") => {
      e.stopPropagation();
      e.preventDefault();
      clearDragListeners();
      dragCreateRef.current = null;
      draftCreateRef.current = null;
      setDraftCreate(null);

      setActiveClipIdAndRef(clipId);
      dragEdgeRef.current = { clipId, edge, before: snapshot() };

      const move = (ev: PointerEvent) => {
        if (!dragEdgeRef.current) return;
        applyEdgeDrag(
          dragEdgeRef.current.clipId,
          dragEdgeRef.current.edge,
          msFromClientX(ev.clientX)
        );
      };
      const up = () => finishEdgeDrag();
      dragListenersRef.current = { move, up };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [
      clearDragListeners,
      snapshot,
      setActiveClipIdAndRef,
      applyEdgeDrag,
      msFromClientX,
      finishEdgeDrag,
    ]
  );

  const beginLaneCreate = useCallback(
    (e: React.PointerEvent, characterId: string | null) => {
      if (!durationMs) return;
      if ((e.target as HTMLElement).closest(".pm-clip")) return;
      if (e.button !== 0) return;
      e.preventDefault();
      clearDragListeners();
      dragEdgeRef.current = null;

      const startMs = msFromClientX(e.clientX);
      seekTo(startMs);
      const draft = { startMs, endMs: startMs, characterId };
      dragCreateRef.current = {
        startMs,
        characterId,
        before: snapshot(),
        pointerId: e.pointerId,
      };
      draftCreateRef.current = draft;
      setDraftCreate(draft);

      const move = (ev: PointerEvent) => {
        const create = dragCreateRef.current;
        if (!create) return;
        const now = msFromClientX(ev.clientX);
        const next = {
          startMs: Math.min(create.startMs, now),
          endMs: Math.max(create.startMs, now),
          characterId: create.characterId,
        };
        draftCreateRef.current = next;
        setDraftCreate(next);
      };
      const up = () => finishCreateDrag();
      dragListenersRef.current = { move, up };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [
      durationMs,
      msFromClientX,
      seekTo,
      snapshot,
      clearDragListeners,
      finishCreateDrag,
    ]
  );

  const onRulerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      timelineRef.current?.setPointerCapture(e.pointerId);
      seekTo(msFromClientX(e.clientX));
      const onMove = (ev: PointerEvent) => seekTo(msFromClientX(ev.clientX));
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [msFromClientX, seekTo]
  );

  const onPickBacking = useCallback((f: File | null) => {
    if (!f) return;
    const ok =
      f.type.startsWith("audio/") ||
      /\.(ogg|mp3|wav|m4a|flac|webm)$/i.test(f.name);
    if (!ok) {
      setError("Backing track must be an audio file.");
      return;
    }
    if (f.size > BACKING_MAX_BYTES) {
      setError("Backing track must be 40 MB or smaller.");
      return;
    }
    setBackingFile(f);
    setError(null);
  }, []);

  const jobStatusLabel = (job: PackJobPublic) => {
    if (job.status === "separating") return "Separating stems (Demucs)…";
    if (job.status === "transcribing") return "Detecting lines (Whisper)…";
    if (job.status === "queued") return "Queued…";
    if (job.status === "failed") return job.error || "Separation failed";
    if (job.status === "succeeded") return "Stems ready";
    return job.status;
  };

  const applyWhisperSegments = useCallback(
    (segments: { startMs: number; endMs: number; text: string }[]) => {
      if (!segments.length || !durationMs) return;
      pushHistory();
      let charA = charactersRef.current[0];
      if (!charA) {
        charA = {
          id: newId("char"),
          name: "Character A",
          color: nextCharacterColor([]),
        };
        setCharactersAndRef([charA]);
      }
      const draft: DraftClip[] = segments
        .map((s) => {
          const startMs = Math.max(0, Math.min(durationMs - MIN_CLIP_MS, s.startMs));
          const endMs = Math.max(
            startMs + MIN_CLIP_MS,
            Math.min(durationMs, s.endMs)
          );
          return {
            id: newId("clip"),
            characterId: charA!.id,
            text: String(s.text ?? ""),
            startMs,
            endMs,
          };
        })
        .filter((c) => c.endMs - c.startMs >= MIN_CLIP_MS);

      if (!draft.length) return;
      setClipsAndRef(draft);
      setActiveClipIdAndRef(draft[0]?.id ?? null);
    },
    [
      durationMs,
      pushHistory,
      setClipsAndRef,
      setCharactersAndRef,
      setActiveClipIdAndRef,
    ]
  );

  const handleAutoSeparate = useCallback(async () => {
    if (!file) {
      setError("Choose a video first.");
      return;
    }
    if (jobsConfigured === false) {
      setError(
        "Stem separation is not configured. Add REPLICATE_API_TOKEN to .env.local."
      );
      return;
    }

    separateAbortRef.current?.abort();
    const ac = new AbortController();
    separateAbortRef.current = ac;

    setSeparating(true);
    setError(null);
    setJobStatus("Starting separation…");

    try {
      const started = await startPackJob(file, { transcribe: true });
      if (!started.id) throw new Error("No job id returned");

      const job = await pollPackJob(started.id, {
        signal: ac.signal,
        onStatus: (j) => setJobStatus(jobStatusLabel(j)),
      });

      if (job.status === "failed") {
        throw new Error(
          job.error ||
            "Separation failed. Check codec, duration, or Replicate quota."
        );
      }
      if (!job.vocalsUrl || !job.backingUrl) {
        throw new Error("Job finished without stem URLs.");
      }

      setJobStatus("Downloading stems…");
      const [backing, vocals] = await Promise.all([
        fetchStemAsFile(job.backingUrl, "_backing_track.wav"),
        fetchStemAsFile(job.vocalsUrl, "vocals.wav"),
      ]);
      setBackingFile(backing);
      setVocalsFile(vocals);

      try {
        setWavePeaks(await extractWaveformPeaks(vocals, { barCount: 240 }));
      } catch {
        /* keep existing peaks */
      }

      if (job.segments?.length) {
        applyWhisperSegments(job.segments);
        setJobStatus(
          `Ready — ${job.segments.length} suggested clip${job.segments.length === 1 ? "" : "s"}`
        );
      } else {
        setJobStatus("Ready — backing + vocals attached (no auto clips)");
      }
    } catch (e) {
      if (ac.signal.aborted) {
        setJobStatus(null);
        return;
      }
      const msg = e instanceof Error ? e.message : "Auto-separate failed.";
      setError(msg);
      setJobStatus(null);
    } finally {
      setSeparating(false);
    }
  }, [file, jobsConfigured, applyWhisperSegments]);

  const openReview = useCallback(async () => {
    setError(null);
    if (packKind === "dub" && !file) {
      setError("Choose a video first.");
      return;
    }
    if (packKind === "voice" && clips.length === 0) {
      setError("Import or add at least one clip.");
      return;
    }
    // Read latest clips from the ref so we never miss a just-typed caption.
    const latestClips = clipsRef.current;
    const check = canContinueToReview(latestClips);
    if (!check.ok) {
      if (check.firstMissingId) {
        const miss = latestClips.find((c) => c.id === check.firstMissingId);
        setActiveClipId(check.firstMissingId);
        if (miss) seekTo(miss.startMs);
      }
      setError(check.error);
      return;
    }
    try {
      if (packKind === "voice") {
        const active = clipsRef.current.find(
          (c) => c.id === activeClipIdRef.current
        );
        const imgUrl = active ? clipImageUrlById[active.id] : undefined;
        if (imgUrl) {
          const res = await fetch(imgUrl);
          setReviewThumb(await res.blob());
        }
      } else {
        const frame = await mediaRef.current?.captureFrame();
        if (frame) setReviewThumb(frame);
      }
    } catch {
      setReviewThumb(null);
    }
    setMakerStep("review");
    setPickingFrame(false);
  }, [file, packKind, seekTo, clipImageUrlById]);

  const applyReviewThumb = useCallback((blob: Blob) => {
    setReviewThumb(blob);
    setError(null);
  }, []);

  const handleThumbUpload = useCallback(
    async (list: FileList | null) => {
      const f = list?.[0];
      if (!f) return;
      if (!f.type.startsWith("image/")) {
        setError("Choose an image file for the thumbnail (PNG, JPEG, WebP…).");
        return;
      }
      applyReviewThumb(f);
      setPickingFrame(false);
    },
    [applyReviewThumb]
  );

  const handleCaptureReviewFrame = useCallback(async () => {
    try {
      const frame = await mediaRef.current?.captureFrame();
      if (!frame) {
        setError("Could not capture that frame — try scrubbing and capture again.");
        return;
      }
      applyReviewThumb(frame);
      setPickingFrame(false);
    } catch {
      setError("Could not capture that frame — try again.");
    }
  }, [applyReviewThumb]);

  const handlePickClipThumb = useCallback(
    async (clipId: string) => {
      const imgUrl = clipImageUrlById[clipId];
      if (!imgUrl) return;
      try {
        const res = await fetch(imgUrl);
        applyReviewThumb(await res.blob());
        setPickingFrame(false);
      } catch {
        setError("Could not use that clip image as the thumbnail.");
      }
    },
    [applyReviewThumb, clipImageUrlById]
  );

  const handleExportZip = useCallback(async () => {
    if (!file) {
      setError("Choose a video first.");
      return;
    }
    if (clips.length === 0) {
      setError("Add at least one clip before exporting.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const thumbBlob =
        reviewThumb ?? (await mediaRef.current?.captureFrame()) ?? null;
      if (!thumbBlob) {
        setError("Could not capture a thumbnail — go back and try again.");
        return;
      }
      const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
      const zipBlob = await buildPackZip({
        title: title.trim() || "MyPack",
        creator: creator.trim() || "You",
        characters,
        lines: sorted.map((c) => {
          const ch = characters.find((x) => x.id === c.characterId);
          return {
            id: c.id,
            characterId: c.characterId,
            speaker: ch?.name.trim() || "SPEAKER",
            text: c.text.trim() || "(untitled)",
            startMs: c.startMs,
            endMs: c.endMs,
          };
        }),
        videoBlob: file,
        thumbBlob,
        backingBlob: backingFile,
        vocalsBlob: vocalsFile,
      });
      downloadBlob(zipBlob, `${(title.trim() || "MyPack").replace(/\s+/g, "_")}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ZIP export failed.");
    } finally {
      setExporting(false);
    }
  }, [
    file,
    clips,
    title,
    creator,
    characters,
    backingFile,
    vocalsFile,
    reviewThumb,
  ]);

  const handleSave = useCallback(async () => {
    setError(null);
    if (packKind === "dub" && !file) {
      setError("Choose a video first.");
      return;
    }
    if (packKind === "voice" && clips.length === 0) {
      setError("Add at least one clip.");
      setMakerStep("edit");
      return;
    }
    if (!title.trim()) {
      setError("Add a pack title.");
      return;
    }
    if (clips.length === 0) {
      setError("Add at least one clip.");
      setMakerStep("edit");
      return;
    }
    for (const c of clips) {
      if (!c.text.trim()) {
        setError("Every clip needs a caption.");
        setActiveClipId(c.id);
        setMakerStep("edit");
        return;
      }
    }

    setSaving(true);
    try {
      const thumbBlob =
        reviewThumb ?? (await mediaRef.current?.captureFrame()) ?? null;
      if (!thumbBlob) {
        setError(
          "Could not capture a thumbnail — go back to editing and try again."
        );
        setMakerStep("edit");
        return;
      }
      const dubLines: DubLine[] = [...clips]
        .sort((a, b) => a.startMs - b.startMs)
        .map((c) => {
          const ch = characters.find((x) => x.id === c.characterId);
          return {
            id: c.id,
            speaker: ch?.name.trim() || "SPEAKER",
            text: c.text.trim(),
            startMs: c.startMs,
            endMs: c.endMs,
          };
        });

      const pack = await persistUploadedPack({
        title,
        description: "",
        creator: creator.trim() || profile?.displayName || "You",
        tags: ["upload", "user", packKind === "voice" ? "voice" : "dub"],
        nsfw: false,
        lines: dubLines,
        videoBlob: file,
        thumbBlob,
        backingBlob: backingFile,
        vocalsBlob: vocalsFile,
        lineRefBlobs:
          Object.keys(lineRefByClipId).length > 0 ? lineRefByClipId : undefined,
        existingId: editingPackId ?? undefined,
        publish: user ? { userId: user.id } : null,
      });

      if (pack.publishError) {
        setError(
          `Saved on this device, but library publish failed: ${pack.publishError}`
        );
      }

      onSaved(pack);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [
    file,
    packKind,
    title,
    clips,
    characters,
    creator,
    backingFile,
    vocalsFile,
    reviewThumb,
    lineRefByClipId,
    editingPackId,
    onSaved,
    user,
    profile?.displayName,
  ]);

  useEffect(() => {
    if (clips.length > 0 && !activeClipId) {
      const first = sortedClips[0]?.id ?? null;
      activeClipIdRef.current = first;
      setActiveClipId(first);
    }
  }, [clips.length, activeClipId, sortedClips]);

  const playheadPct = durationMs > 0 ? (currentMs / durationMs) * 100 : 0;
  const timelineWidthPct = Math.max(100, zoom);

  const rulerMarks = useMemo(() => {
    if (!durationMs) return [];
    const marks: number[] = [];
    for (let t = 0; t <= durationMs; t += 5000) marks.push(t);
    return marks;
  }, [durationMs]);

  const renderClip = (c: DraftClip, ch: Character | undefined) => {
    const left = (c.startMs / durationMs) * 100;
    const width = ((c.endMs - c.startMs) / durationMs) * 100;
    const color = ch?.color ?? "#375F57";
    const name = ch?.name ?? "Character";
    return (
      <div
        key={c.id}
        className={`pm-clip ${c.id === activeClipId ? "pm-clip--active" : ""}`}
        style={{
          left: `${left}%`,
          width: `${Math.max(0.8, width)}%`,
          ["--clip-color" as string]: color,
          background: color,
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          setActiveClipId(c.id);
          seekTo(c.startMs);
        }}
      >
        <button
          type="button"
          className="pm-clip__handle pm-clip__handle--start"
          aria-label={`Drag start of ${name}`}
          onPointerDown={(e) => beginEdgeDrag(e, c.id, "start")}
        >
          <span className="pm-clip__grip" />
        </button>
        <span className="pm-clip__label">{name}</span>
        <button
          type="button"
          className="pm-clip__handle pm-clip__handle--end"
          aria-label={`Drag end of ${name}`}
          onPointerDown={(e) => beginEdgeDrag(e, c.id, "end")}
        >
          <span className="pm-clip__grip" />
        </button>
      </div>
    );
  };

  if (hydrating) {
    return (
      <div className="pm-root">
        <header className="pm-topbar">
          <button type="button" className="pm-btn pm-btn-ghost" onClick={onBack}>
            ← Back
          </button>
          <div className="pm-topbar__local">
            <span className="pm-dot" />
            <div>
              <p className="pm-topbar__title">Opening pack</p>
              <p className="pm-topbar__sub">Loading your dub into the maker…</p>
            </div>
          </div>
        </header>
        <div className="pm-empty-load">
          <p className="pm-status-bar" role="status">
            Loading editor…
          </p>
          {error ? <p className="pm-error">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (!editorReady) {
    return (
      <div className="pm-root">
        <header className="pm-topbar">
          <button type="button" className="pm-btn pm-btn-ghost" onClick={onBack}>
            ← Back
          </button>
          <div className="pm-topbar__local">
            <span className="pm-dot" />
            <div>
              <p className="pm-topbar__title">Local workstation</p>
              <p className="pm-topbar__sub">Files stay on this device.</p>
            </div>
          </div>
        </header>
        <div className="pm-empty-load">
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/*"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={zipFileRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => void onPickZip(e.target.files?.[0] ?? null)}
          />
          <h2>Dub pack maker</h2>
          <p>
            Start from scratch with an MP4, or import a Choicer Voicer dub pack
            or voice pack ZIP to edit before publishing.
          </p>
          <div className="pm-empty-load__actions">
            <button
              type="button"
              className="pm-btn pm-btn-primary"
              onClick={() => fileRef.current?.click()}
            >
              Choose MP4
            </button>
            <button
              type="button"
              className="pm-btn pm-btn-ghost"
              disabled={importing}
              onClick={() => zipFileRef.current?.click()}
            >
              {importing ? "Importing…" : "Import CV pack (.zip)"}
            </button>
          </div>
          {importStatus ? (
            <p className="pm-status-bar" role="status">
              {importStatus}
            </p>
          ) : null}
          {error ? <p className="pm-error">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="pm-root">
      <header className="pm-topbar">
        <button
          type="button"
          className="pm-btn pm-btn-ghost"
          onClick={() => {
            if (makerStep === "review") {
              setMakerStep("edit");
              setPickingFrame(false);
              setError(null);
              return;
            }
            onBack();
          }}
        >
          {makerStep === "review" ? "← Edit clips" : "← Back"}
        </button>
        <div className="pm-topbar__local">
          <span className="pm-dot" />
          <div>
            <p className="pm-topbar__title">
              {makerStep === "review"
                ? "Review & save"
                : packKind === "voice"
                  ? "Edit voice pack"
                  : "Mark your lines"}
            </p>
            <p className="pm-topbar__sub">
              {makerStep === "review"
                ? "Name the pack, pick a thumbnail, then publish or download."
                : packKind === "voice"
                  ? "Studio-style lines — edit captions, then publish."
                  : "Files stay on this device."}
            </p>
          </div>
        </div>
        <div className="pm-topbar__actions">
          {makerStep === "edit" ? (
            <>
              <button
                type="button"
                className="pm-btn pm-btn-ghost"
                onClick={undo}
                disabled={!past.length}
              >
                Undo
              </button>
              <button
                type="button"
                className="pm-btn pm-btn-ghost"
                onClick={redo}
                disabled={!future.length}
              >
                Redo
              </button>
              <button
                type="button"
                className="pm-btn pm-btn-ghost"
                onClick={() => zipFileRef.current?.click()}
                disabled={importing}
              >
                {importing ? "Importing…" : "Import ZIP"}
              </button>
              {packKind === "dub" ? (
                <button
                  type="button"
                  className="pm-btn pm-btn-ghost"
                  onClick={() => fileRef.current?.click()}
                >
                  Replace video
                </button>
              ) : null}
              <button
                type="button"
                className="pm-btn pm-btn-primary"
                onClick={() => void openReview()}
              >
                Continue →
              </button>
            </>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/*"
          className="hidden"
          onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={zipFileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => void onPickZip(e.target.files?.[0] ?? null)}
        />
        <input
          ref={backingFileRef}
          type="file"
          accept="audio/*,.ogg,.mp3,.wav,.m4a"
          className="hidden"
          onChange={(e) => onPickBacking(e.target.files?.[0] ?? null)}
        />
      </header>

      {error ? <p className="pm-error pm-error-bar">{error}</p> : null}
      {importStatus && makerStep === "edit" ? (
        <p className="pm-status-bar" role="status">
          {importStatus}
        </p>
      ) : null}
      {jobStatus && makerStep === "edit" ? (
        <p className="pm-status-bar" role="status">
          {jobStatus}
        </p>
      ) : null}

      {makerStep === "review" ? (
        <div className="pm-review">
          <div className="pm-review__card">
            <p className="pm-kicker">
              {editingPackId ? "Update pack" : "Pack details"}
            </p>
            <h2 className="pm-review__heading">
              {editingPackId ? "Save your changes?" : "Ready to publish?"}
            </h2>
            <p className="pm-review__lede">
              {user
                ? editingPackId
                  ? "This updates your pack in the community library and on this device."
                  : "Publishes to Dub Packs for everyone, and keeps a local copy for Studio."
                : "You’re not signed in — this stays on this device only. Sign in to share with other players."}
            </p>

            {!user ? (
              <p className="pm-review__signin">
                <Link href="/login?next=/play">Sign in</Link> to publish to the
                library.
              </p>
            ) : null}

            <label className="pm-field">
              <span>Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Pack title"
                autoFocus
              />
            </label>
            <label className="pm-field">
              <span>Author</span>
              <input
                value={creator}
                placeholder="Your name (optional)"
                onChange={(e) => setCreator(e.target.value)}
              />
            </label>

            <div className="pm-review__thumb">
              <span className="pm-review__thumb-label">Pack thumbnail</span>
              <div className="pm-review__thumb-preview-wrap">
                {reviewThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={reviewThumbUrl}
                    alt="Pack thumbnail preview"
                    className="pm-review__thumb-preview"
                  />
                ) : (
                  <div className="pm-review__thumb-preview pm-review__thumb-preview--empty">
                    No thumbnail yet — upload an image
                    {packKind === "dub" ? " or grab a frame" : ""}.
                  </div>
                )}
              </div>

              <div className="pm-review__thumb-actions">
                <input
                  ref={thumbFileRef}
                  type="file"
                  accept="image/*"
                  className="pm-file-hidden"
                  onChange={(e) => {
                    void handleThumbUpload(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="pm-btn pm-btn-ghost"
                  onClick={() => thumbFileRef.current?.click()}
                >
                  Upload image
                </button>
                {packKind === "dub" && objectUrl ? (
                  <button
                    type="button"
                    className="pm-btn pm-btn-ghost"
                    onClick={() => setPickingFrame((v) => !v)}
                  >
                    {pickingFrame ? "Hide frame picker" : "Grab from video"}
                  </button>
                ) : null}
              </div>

              {packKind === "voice" &&
              Object.keys(clipImageUrlById).length > 0 ? (
                <div className="pm-review__thumb-clips">
                  <p className="pm-review__thumb-hint">Or pick a line image</p>
                  <div className="pm-review__thumb-clip-grid">
                    {sortedClips
                      .filter((c) => clipImageUrlById[c.id])
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="pm-review__thumb-clip"
                          title="Use as thumbnail"
                          onClick={() => void handlePickClipThumb(c.id)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={clipImageUrlById[c.id]} alt="" />
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}

              {pickingFrame && packKind === "dub" && objectUrl ? (
                <div className="pm-review__frame-picker">
                  <p className="pm-review__thumb-hint">
                    Scrub to a frame, then capture it.
                  </p>
                  <div className="pm-review__frame-video">
                    <PackMakerVideo
                      ref={mediaRef}
                      src={objectUrl}
                      ogv={useOgvVideo}
                      bare
                      className="pm-review__frame-video-el"
                      onLoadedMetadata={(sec) => {
                        setDurationMs(Math.round(sec * 1000));
                        mediaRef.current?.seekToSec(currentMs / 1000);
                      }}
                      onTimeUpdate={(sec) =>
                        setCurrentMs(Math.round(sec * 1000))
                      }
                    />
                  </div>
                  <input
                    type="range"
                    className="pm-review__frame-scrub"
                    min={0}
                    max={Math.max(0, durationMs)}
                    step={40}
                    value={Math.min(currentMs, Math.max(0, durationMs))}
                    onChange={(e) => {
                      const ms = Number(e.target.value);
                      setCurrentMs(ms);
                      mediaRef.current?.seekToSec(ms / 1000);
                    }}
                    aria-label="Scrub video for thumbnail frame"
                  />
                  <button
                    type="button"
                    className="pm-btn pm-btn-primary"
                    onClick={() => void handleCaptureReviewFrame()}
                  >
                    Use this frame
                  </button>
                </div>
              ) : null}
            </div>

            <ul className="pm-review__checklist">
              <li>
                <span className="pm-review__check" aria-hidden>
                  ✓
                </span>
                {clips.length} clip{clips.length === 1 ? "" : "s"} ·{" "}
                {characters.length} character
                {characters.length === 1 ? "" : "s"}
              </li>
              <li>
                <span
                  className={`pm-review__check ${
                    backingFile ? "" : "pm-review__check--warn"
                  }`}
                  aria-hidden
                >
                  {backingFile ? "✓" : "!"}
                </span>
                {backingFile
                  ? `Backing: ${backingFile.name}`
                  : "No backing track — Studio will mute video audio (no music/SFX)"}
              </li>
              {vocalsFile ? (
                <li>
                  <span className="pm-review__check" aria-hidden>
                    ✓
                  </span>
                  Vocals stem ready for Replay slices
                </li>
              ) : null}
              <li>
                <span
                  className={`pm-review__check ${
                    user ? "" : "pm-review__check--warn"
                  }`}
                  aria-hidden
                >
                  {user ? "✓" : "!"}
                </span>
                {user
                  ? "Will appear in Browse Dub Packs for everyone"
                  : "Device-only until you sign in"}
              </li>
            </ul>

            {!backingFile && packKind === "dub" ? (
              <button
                type="button"
                className="pm-btn pm-btn-ghost"
                onClick={() => {
                  setMakerStep("edit");
                  setError(null);
                }}
              >
                ← Add a backing track
              </button>
            ) : null}

            <div className="pm-review__actions">
              <button
                type="button"
                className="pm-btn pm-btn-ghost"
                disabled={exporting || (packKind === "dub" && !file)}
                onClick={() => void handleExportZip()}
              >
                {exporting ? "Zipping…" : "Download ZIP"}
              </button>
              <button
                type="button"
                className="pm-btn pm-btn-primary"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving
                  ? user
                    ? "Publishing…"
                    : "Saving…"
                  : editingPackId
                    ? user
                      ? "Save & publish →"
                      : "Save on device →"
                    : user
                      ? "Publish to library →"
                      : "Save on device →"}
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div className="pm-body">
        <div className="pm-main">
          {packKind === "voice" ? (
            <>
              <div className="pm-voice-preview">
                {activeClip && clipImageUrlById[activeClip.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={clipImageUrlById[activeClip.id]}
                    alt=""
                    className="pm-voice-preview__img"
                  />
                ) : (
                  <div className="pm-voice-preview__empty">
                    <p>Voice pack</p>
                    <span>{clips.length} lines imported</span>
                  </div>
                )}
                <div className="pm-voice-preview__meta">
                  <p className="pm-kicker">Choicer Voicer voice pack</p>
                  <h3>{title || "Untitled pack"}</h3>
                  <p>{creator || "Unknown author"}</p>
                </div>
              </div>

              <div className="pm-voice-list-panel">
                <div className="pm-timeline-head">
                  <p className="pm-timeline-label">
                    Lines <span>{clips.length} clip{clips.length === 1 ? "" : "s"}</span>
                  </p>
                  <p className="pm-timeline-hint">
                    Select a line to edit its caption and preview audio
                  </p>
                </div>
                <ul className="pm-voice-list">
                  {sortedClips.map((c, i) => {
                    const ch = charById(c.characterId);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`pm-voice-list__item ${
                            c.id === activeClipId ? "pm-voice-list__item--active" : ""
                          }`}
                          onClick={() => {
                            setActiveClipId(c.id);
                            seekTo(c.startMs);
                          }}
                        >
                          <span className="pm-voice-list__num">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {clipImageUrlById[c.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={clipImageUrlById[c.id]}
                              alt=""
                              className="pm-voice-list__thumb"
                            />
                          ) : (
                            <span className="pm-voice-list__thumb pm-voice-list__thumb--empty" />
                          )}
                          <span className="pm-voice-list__copy">
                            <span
                              className="pm-voice-list__speaker"
                              style={{ color: ch?.color ?? "#375F57" }}
                            >
                              {ch?.name ?? "Speaker"}
                            </span>
                            <span className="pm-voice-list__text">
                              {c.text.trim() || "(needs caption)"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : (
            <>
          {(() => {
            const showPlaceholder =
              !videoFrameReady && Boolean(posterUrl || transcodeLabel);
            return (
              <div
                className={`pm-video-wrap${
                  showPlaceholder ? " pm-video-wrap--converting" : ""
                }`}
              >
                {showPlaceholder && posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={posterUrl}
                    alt=""
                    className="pm-video pm-video--poster"
                  />
                ) : null}
                {showPlaceholder && transcodeLabel ? (
                  <div className="pm-transcode-overlay">
                    <p>{transcodeLabel}</p>
                    <div className="pm-transcode-bar" aria-hidden>
                      <div
                        className="pm-transcode-bar__fill"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, Math.max(transcodeProgress, 8))
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="pm-transcode-hint">
                      {transcodeLabel.toLowerCase().includes("cached")
                        ? "Loading your saved MP4 preview — frame size stays stable."
                        : "You can edit clips on the timeline while this runs. Re-imports use a cached MP4 and load instantly."}
                    </p>
                  </div>
                ) : null}
                {objectUrl ? (
                  <PackMakerVideo
                    ref={mediaRef}
                    src={objectUrl}
                    ogv={useOgvVideo}
                    bare
                    posterUrl={null}
                    className={`pm-video${
                      showPlaceholder ? " pm-video--pending" : ""
                    }`}
                    onLoadedMetadata={onMediaLoaded}
                    onTimeUpdate={onMediaTimeUpdate}
                    onPlayStateChange={onMediaPlayStateChange}
                    onClick={togglePlay}
                    onError={onVideoError}
                  />
                ) : null}
              </div>
            );
          })()}

          <div className="pm-transport">
            <button
              type="button"
              className="pm-play"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="pm-time">
              {formatTimecodePrecise(currentMs)} /{" "}
              {formatTimecodePrecise(durationMs)}
            </span>
            <button
              type="button"
              className="pm-btn pm-btn-primary pm-add-clip"
              onClick={addClipAtPlayhead}
            >
              + Add clip
            </button>
          </div>

          <div className="pm-audio-bar">
            <div className="pm-audio-bar__copy">
              <p className="pm-audio-bar__label">Backing track</p>
              <p className="pm-audio-bar__hint">
                {backingFile
                  ? backingFile.name
                  : "Music & SFX without dialogue — upload or auto-separate"}
              </p>
              {vocalsFile ? (
                <p className="pm-audio-bar__vocals">
                  Vocals stem ready for Replay
                </p>
              ) : null}
            </div>
            <div className="pm-audio-bar__actions">
              <button
                type="button"
                className="pm-btn pm-btn-ghost"
                onClick={() => backingFileRef.current?.click()}
              >
                {backingFile ? "Replace audio" : "Upload audio"}
              </button>
              {backingFile ? (
                <button
                  type="button"
                  className="pm-btn pm-btn-ghost"
                  onClick={() => {
                    setBackingFile(null);
                    setVocalsFile(null);
                  }}
                >
                  Remove
                </button>
              ) : null}
              <button
                type="button"
                className="pm-btn pm-btn-ghost"
                disabled={!file || separating}
                onClick={() => void handleAutoSeparate()}
                title={
                  jobsConfigured === false
                    ? "Set REPLICATE_API_TOKEN in .env.local"
                    : "Split vocals / backing via Replicate Demucs"
                }
              >
                {separating ? "Separating…" : "Auto-separate"}
              </button>
            </div>
          </div>

          <div className="pm-timeline-panel">
            <div className="pm-timeline-head">
              <p className="pm-timeline-label">
                Timeline{" "}
                <span>
                  {clips.length} clip{clips.length === 1 ? "" : "s"}
                  {characters.length > 0
                    ? ` · ${characters.length} lane${
                        characters.length === 1 ? "" : "s"
                      }`
                    : ""}
                </span>
              </p>
              <p className="pm-timeline-hint">
                Drag on an empty lane to create a clip
              </p>
              <div className="pm-zoom">
                <button
                  type="button"
                  className="pm-btn pm-btn-ghost"
                  onClick={() => setZoom((z) => Math.max(100, z - 25))}
                >
                  −
                </button>
                <span>{zoom}%</span>
                <button
                  type="button"
                  className="pm-btn pm-btn-ghost"
                  onClick={() => setZoom((z) => Math.min(400, z + 25))}
                >
                  +
                </button>
              </div>
            </div>

            <div className="pm-timeline-scroll">
              <div
                ref={timelineRef}
                className="pm-timeline"
                style={{ width: `${timelineWidthPct}%` }}
              >
                <div className="pm-ruler" onPointerDown={onRulerPointerDown}>
                  {rulerMarks.map((t) => (
                    <span
                      key={t}
                      className="pm-ruler__mark"
                      style={{ left: `${(t / durationMs) * 100}%` }}
                    >
                      {formatTimecodePrecise(t).slice(0, 5)}
                    </span>
                  ))}
                </div>

                <div className="pm-wave" onPointerDown={onRulerPointerDown}>
                  <div className="pm-wave__bars" aria-hidden>
                    {wavePeaks.map((h, i) => (
                      <span
                        key={i}
                        className="pm-wave__bar"
                        style={{ height: `${Math.max(4, h)}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="pm-lanes">
                  {characters.map((ch) => (
                    <div
                      key={ch.id}
                      className="pm-lane"
                      onPointerDown={(e) => beginLaneCreate(e, ch.id)}
                    >
                      {clips
                        .filter((c) => c.characterId === ch.id)
                        .map((c) => renderClip(c, ch))}
                      {draftCreate?.characterId === ch.id ? (
                        <div
                          className="pm-clip pm-clip--draft"
                          style={{
                            left: `${
                              (draftCreate.startMs / durationMs) * 100
                            }%`,
                            width: `${Math.max(
                              0.3,
                              ((draftCreate.endMs - draftCreate.startMs) /
                                durationMs) *
                                100
                            )}%`,
                            background: ch.color,
                          }}
                        />
                      ) : null}
                    </div>
                  ))}

                  <div
                    className="pm-lane pm-lane--new"
                    onPointerDown={(e) => beginLaneCreate(e, null)}
                  >
                    {characters.length === 0 ? (
                      <span className="pm-lane__hint">
                        Drag here to create the first character clip
                      </span>
                    ) : (
                      <span className="pm-lane__hint">
                        Drag here to add a new character lane
                      </span>
                    )}
                    {draftCreate && draftCreate.characterId === null ? (
                      <div
                        className="pm-clip pm-clip--draft"
                        style={{
                          left: `${(draftCreate.startMs / durationMs) * 100}%`,
                          width: `${Math.max(
                            0.3,
                            ((draftCreate.endMs - draftCreate.startMs) /
                              durationMs) *
                              100
                          )}%`,
                        }}
                      />
                    ) : null}
                  </div>
                </div>

                <div
                  className="pm-playhead"
                  style={{ left: `${playheadPct}%` }}
                />
              </div>
            </div>
          </div>
            </>
          )}
        </div>

        <aside className="pm-side">
          {clips.length === 0 ? (
            <div className="pm-side-empty">
              <div className="pm-scissors" aria-hidden>
                ✂
              </div>
              <h3>
                {packKind === "voice"
                  ? "Edit imported lines"
                  : "Mark speaking lines"}
              </h3>
              <p>
                {packKind === "voice"
                  ? "Select a line to edit its caption, then preview the reference audio."
                  : "Play the video, then add a clip at the playhead — or drag on the empty lane."}
              </p>
              {packKind === "dub" ? (
                <button
                  type="button"
                  className="pm-btn pm-btn-primary pm-btn-block"
                  onClick={addClipAtPlayhead}
                >
                  + Add clip at {formatTimecodePrecise(currentMs)}
                </button>
              ) : null}
            </div>
          ) : activeClip && activeCharacter ? (
            <div className="pm-clip-editor">
              <div className="pm-clip-editor__head">
                <div>
                  <p className="pm-kicker">Current clip</p>
                  <p className="pm-clip-num">
                    {String(activeIndex + 1).padStart(2, "0")}
                  </p>
                </div>
                <button
                  type="button"
                  className="pm-btn pm-btn-danger"
                  onClick={deleteActiveClip}
                >
                  Delete clip
                </button>
              </div>

              <label className="pm-field">
                <span>Caption</span>
                <textarea
                  value={activeClip.text}
                  maxLength={500}
                  placeholder="What this character says"
                  onChange={(e) =>
                    updateClip(activeClip.id, { text: e.target.value })
                  }
                />
                <span className="pm-count">{activeClip.text.length}/500</span>
              </label>

              <label className="pm-field">
                <span>Character</span>
                <div className="pm-char-row">
                  <select
                    value={activeClip.characterId}
                    onChange={(e) =>
                      assignClipCharacter(activeClip.id, e.target.value)
                    }
                  >
                    {characters.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="pm-btn pm-btn-ghost"
                    title="New character lane"
                    onClick={addNewCharacterClip}
                  >
                    +
                  </button>
                </div>
              </label>

              <label className="pm-field">
                <span>Character name</span>
                <div className="pm-char-row">
                  <input
                    value={activeCharacter.name}
                    onChange={(e) =>
                      renameCharacter(activeCharacter.id, e.target.value)
                    }
                  />
                  <input
                    type="color"
                    className="pm-color-swatch"
                    value={activeCharacter.color}
                    title="Lane color"
                    onChange={(e) =>
                      recolorCharacter(activeCharacter.id, e.target.value)
                    }
                  />
                </div>
              </label>

              <div className="pm-timing">
                <label className="pm-field">
                  <span>Start</span>
                  <input
                    value={formatTimecodePrecise(activeClip.startMs)}
                    onChange={(e) => {
                      const ms = parseTimecodeToMs(e.target.value);
                      updateClip(activeClip.id, {
                        startMs: Math.min(ms, activeClip.endMs - MIN_CLIP_MS),
                      });
                    }}
                  />
                </label>
                <label className="pm-field">
                  <span>End</span>
                  <input
                    value={formatTimecodePrecise(activeClip.endMs)}
                    onChange={(e) => {
                      const ms = parseTimecodeToMs(e.target.value);
                      updateClip(activeClip.id, {
                        endMs: Math.max(ms, activeClip.startMs + MIN_CLIP_MS),
                      });
                    }}
                  />
                </label>
              </div>

              <button
                type="button"
                className="pm-btn pm-btn-ghost pm-btn-block"
                onClick={() => void previewClip()}
              >
                ▶ Preview this clip
              </button>

              <div className="pm-clip-nav">
                <button
                  type="button"
                  className="pm-btn pm-btn-ghost"
                  disabled={activeIndex <= 0}
                  onClick={() => {
                    const prev = sortedClips[activeIndex - 1];
                    if (prev) {
                      setActiveClipId(prev.id);
                      seekTo(prev.startMs);
                    }
                  }}
                >
                  Previous
                </button>
                <span>
                  {activeIndex + 1} / {sortedClips.length}
                </span>
                <button
                  type="button"
                  className="pm-btn pm-btn-ghost"
                  disabled={activeIndex >= sortedClips.length - 1}
                  onClick={() => {
                    const next = sortedClips[activeIndex + 1];
                    if (next) {
                      setActiveClipId(next.id);
                      seekTo(next.startMs);
                    }
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
      )}
    </div>
  );
}
