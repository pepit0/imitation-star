"use client";

import { useEffect, useState } from "react";
import { syncNativeAppFlag } from "@/lib/nativeApp";

/**
 * True when launched from the Expo / store shell (`?client=app`).
 * Starts false during SSR + hydration, then syncs on mount to avoid mismatches.
 */
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(syncNativeAppFlag());
  }, []);

  return isNative;
}
