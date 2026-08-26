"use client";

import { useEffect, useState } from "react";
import { syncNativeAppFlag } from "@/lib/nativeApp";

function readInitialNativeFlag(): boolean {
  if (typeof window === "undefined") return false;
  return syncNativeAppFlag();
}

/** True when launched from the Expo / store shell (`?client=app`). */
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(readInitialNativeFlag);

  useEffect(() => {
    setIsNative(syncNativeAppFlag());
  }, []);

  return isNative;
}
