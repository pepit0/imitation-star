"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isNativeApp } from "@/lib/nativeApp";
import {
  listenForNativeSubscriptionStatus,
  presentNativePaywall,
  readNativeSubscriptionStatus,
  refreshNativeSubscription,
  restoreNativePurchases,
  type SubscriptionStatus,
} from "@/lib/subscriptionClient";

type SubscriptionContextValue = {
  isPro: boolean;
  status: SubscriptionStatus;
  loading: boolean;
  nativeBillingAvailable: boolean;
  presentPaywall: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(
  null
);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const nativeBillingAvailable = isNativeApp();
  const [status, setStatus] = useState<SubscriptionStatus>(() =>
    readNativeSubscriptionStatus()
  );
  const [loading, setLoading] = useState(nativeBillingAvailable);

  useEffect(() => {
    if (!nativeBillingAvailable) {
      setLoading(false);
      return;
    }

    const stop = listenForNativeSubscriptionStatus((next) => {
      setStatus(next);
      setLoading(false);
    });

    void refreshNativeSubscription();

    return stop;
  }, [nativeBillingAvailable]);

  const presentPaywall = useCallback(async () => {
    await presentNativePaywall();
  }, []);

  const restorePurchases = useCallback(async () => {
    await restoreNativePurchases();
  }, []);

  const refresh = useCallback(async () => {
    await refreshNativeSubscription();
  }, []);

  const value = useMemo(
    () => ({
      isPro: status.isPro,
      status,
      loading,
      nativeBillingAvailable,
      presentPaywall,
      restorePurchases,
      refresh,
    }),
    [
      status,
      loading,
      nativeBillingAvailable,
      presentPaywall,
      restorePurchases,
      refresh,
    ]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }
  return ctx;
}

/** Safe hook for components that may render outside the provider on web. */
export function useSubscriptionOptional(): SubscriptionContextValue | null {
  return useContext(SubscriptionContext);
}
