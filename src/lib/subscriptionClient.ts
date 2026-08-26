"use client";

import { isNativeApp } from "@/lib/nativeApp";
import { postToNativeApp } from "@/lib/nativeBridge";

/** RevenueCat entitlement lookup_key — keep in sync with mobile/subscriptionConstants.ts */
export const SUBSCRIPTION_ENTITLEMENT_ID = "imitation_star_pro";

export type SubscriptionStatus = {
  isPro: boolean;
  entitlementId: string;
  expirationDate: string | null;
  managementUrl: string | null;
};

declare global {
  interface Window {
    __IMITATION_SUBSCRIPTION__?: SubscriptionStatus;
  }
}

const DEFAULT_STATUS: SubscriptionStatus = {
  isPro: false,
  entitlementId: SUBSCRIPTION_ENTITLEMENT_ID,
  expirationDate: null,
  managementUrl: null,
};

export function readNativeSubscriptionStatus(): SubscriptionStatus {
  if (typeof window === "undefined") return DEFAULT_STATUS;
  return window.__IMITATION_SUBSCRIPTION__ ?? DEFAULT_STATUS;
}

export function isNativeSubscriptionAvailable(): boolean {
  return isNativeApp();
}

export async function refreshNativeSubscription(): Promise<void> {
  if (!isNativeApp()) return;
  postToNativeApp({ type: "subscription:refresh" });
}

export async function presentNativePaywall(): Promise<void> {
  if (!isNativeApp()) return;
  postToNativeApp({ type: "subscription:present-paywall" });
}

export async function presentNativePaywallIfNeeded(): Promise<void> {
  if (!isNativeApp()) return;
  postToNativeApp({ type: "subscription:present-paywall-if-needed" });
}

export async function restoreNativePurchases(): Promise<void> {
  if (!isNativeApp()) return;
  postToNativeApp({ type: "subscription:restore" });
}

export function syncNativeSubscriptionUser(userId: string | null): void {
  if (!isNativeApp()) return;
  if (userId) {
    postToNativeApp({ type: "subscription:login", userId });
  } else {
    postToNativeApp({ type: "subscription:logout" });
  }
}

export function listenForNativeSubscriptionStatus(
  onStatus: (status: SubscriptionStatus) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<SubscriptionStatus>).detail;
    if (!detail || typeof detail.isPro !== "boolean") return;
    window.__IMITATION_SUBSCRIPTION__ = detail;
    onStatus(detail);
  };

  window.addEventListener(
    "imitation-subscription-status",
    handler as EventListener
  );

  const cached = readNativeSubscriptionStatus();
  if (window.__IMITATION_SUBSCRIPTION__) {
    onStatus(cached);
  }

  return () => {
    window.removeEventListener(
      "imitation-subscription-status",
      handler as EventListener
    );
  };
}
