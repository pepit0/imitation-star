"use client";

import { isNativeApp } from "@/lib/nativeApp";

declare global {
  interface Window {
    __IMITATION_PUSH_TOKEN__?: string;
    __IMITATION_PUSH_PLATFORM__?: string;
  }
}

/** Register Expo push token with the server when running inside the native shell. */
export async function registerNativePushToken(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isNativeApp()) return;

  const token = window.__IMITATION_PUSH_TOKEN__?.trim();
  if (!token) return;

  try {
    await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        platform: window.__IMITATION_PUSH_PLATFORM__ ?? undefined,
      }),
    });
  } catch {
    /* best-effort */
  }
}

/** Listen for token injection from the Expo WebView shell. */
export function listenForNativePushToken(
  onToken?: () => void
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ token?: string; platform?: string }>)
      .detail;
    if (detail?.token) {
      window.__IMITATION_PUSH_TOKEN__ = detail.token;
      if (detail.platform) {
        window.__IMITATION_PUSH_PLATFORM__ = detail.platform;
      }
      void registerNativePushToken().then(() => onToken?.());
    }
  };

  window.addEventListener("imitation-push-token", handler as EventListener);
  return () => {
    window.removeEventListener(
      "imitation-push-token",
      handler as EventListener
    );
  };
}
