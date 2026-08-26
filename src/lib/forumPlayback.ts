/** Ensures only one forum dub mix plays at a time. */

type StopFn = () => void;

let activeStop: StopFn | null = null;

/** Register this player as the sole active playback; stops any previous one. */
export function claimForumPlayback(stop: StopFn): () => void {
  if (activeStop && activeStop !== stop) {
    try {
      activeStop();
    } catch {
      /* ignore */
    }
  }
  activeStop = stop;
  return () => {
    if (activeStop === stop) activeStop = null;
  };
}

export function stopAllForumPlayback(): void {
  if (!activeStop) return;
  const stop = activeStop;
  activeStop = null;
  try {
    stop();
  } catch {
    /* ignore */
  }
}
