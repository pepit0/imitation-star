/** Session flag so Expo / store clients keep app chrome across navigations. */
export const NATIVE_APP_STORAGE_KEY = "imitation-star:native-app";

export function readNativeAppFlagFromSearch(
  search: string | URLSearchParams
): boolean {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get("client") === "app" || params.get("native") === "1";
}

/** Sync URL → sessionStorage (+ html dataset), then return whether this session is the native app. */
export function syncNativeAppFlag(): boolean {
  if (typeof window === "undefined") return false;
  if (readNativeAppFlagFromSearch(window.location.search)) {
    try {
      sessionStorage.setItem(NATIVE_APP_STORAGE_KEY, "1");
    } catch {
      /* private mode */
    }
    document.documentElement.dataset.nativeApp = "1";
    return true;
  }
  try {
    if (sessionStorage.getItem(NATIVE_APP_STORAGE_KEY) === "1") {
      document.documentElement.dataset.nativeApp = "1";
      return true;
    }
  } catch {
    /* private mode */
  }
  return document.documentElement.dataset.nativeApp === "1";
}

export function isNativeApp(): boolean {
  return syncNativeAppFlag();
}
