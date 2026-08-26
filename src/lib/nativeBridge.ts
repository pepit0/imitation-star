"use client";

/** Post JSON messages from the web app to the Expo WebView shell. */
export function postToNativeApp(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const bridge = (
    window as Window & {
      ReactNativeWebView?: { postMessage: (message: string) => void };
    }
  ).ReactNativeWebView;
  if (!bridge?.postMessage) return;
  try {
    bridge.postMessage(JSON.stringify(payload));
  } catch {
    /* best-effort */
  }
}

export function hasNativeBridge(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (
      window as Window & {
        ReactNativeWebView?: { postMessage: (message: string) => void };
      }
    ).ReactNativeWebView?.postMessage
  );
}
