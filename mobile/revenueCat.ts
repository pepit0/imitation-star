import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
} from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import {
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_OFFERING_ID,
  type NativeSubscriptionStatus,
  type WebToNativeMessage,
} from "./subscriptionConstants";

let configured = false;

function resolveApiKey(): string | null {
  const shared = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY?.trim();
  if (shared) return shared;

  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() ?? null;
  }
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() ?? null;
  }
  return null;
}

export function isRevenueCatConfigured(): boolean {
  return Boolean(resolveApiKey());
}

export function configureRevenueCat(): void {
  if (configured) return;
  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.warn(
      "[RevenueCat] Missing EXPO_PUBLIC_REVENUECAT_API_KEY (or platform-specific keys)."
    );
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey });
  configured = true;
}

export function customerInfoToStatus(
  info: CustomerInfo | null | undefined
): NativeSubscriptionStatus {
  const entitlement =
    info?.entitlements.active[REVENUECAT_ENTITLEMENT_ID] ?? null;
  return {
    isPro: Boolean(entitlement?.isActive),
    entitlementId: REVENUECAT_ENTITLEMENT_ID,
    expirationDate: entitlement?.expirationDate ?? null,
    managementUrl: info?.managementURL ?? null,
  };
}

export async function fetchSubscriptionStatus(): Promise<NativeSubscriptionStatus> {
  if (!configured) {
    return {
      isPro: false,
      entitlementId: REVENUECAT_ENTITLEMENT_ID,
      expirationDate: null,
      managementUrl: null,
    };
  }
  try {
    const info = await Purchases.getCustomerInfo();
    return customerInfoToStatus(info);
  } catch (e) {
    console.warn("[RevenueCat] getCustomerInfo failed", e);
    return customerInfoToStatus(null);
  }
}

async function resolvePaywallOffering() {
  const offerings = await Purchases.getOfferings();
  return (
    offerings.all[REVENUECAT_OFFERING_ID] ??
    offerings.current ??
    null
  );
}

export async function presentSubscriptionPaywall(): Promise<PAYWALL_RESULT> {
  if (!configured) return PAYWALL_RESULT.NOT_PRESENTED;
  try {
    const offering = await resolvePaywallOffering();
    return await RevenueCatUI.presentPaywall({
      offering: offering ?? undefined,
      displayCloseButton: true,
    });
  } catch (e) {
    console.warn("[RevenueCat] presentPaywall failed", e);
    return PAYWALL_RESULT.ERROR;
  }
}

export async function presentPaywallIfNeeded(): Promise<PAYWALL_RESULT> {
  if (!configured) return PAYWALL_RESULT.NOT_PRESENTED;
  try {
    const offering = await resolvePaywallOffering();
    return await RevenueCatUI.presentPaywallIfNeeded({
      offering: offering ?? undefined,
      requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_ID,
      displayCloseButton: true,
    });
  } catch (e) {
    console.warn("[RevenueCat] presentPaywallIfNeeded failed", e);
    return PAYWALL_RESULT.ERROR;
  }
}

export async function restorePurchases(): Promise<NativeSubscriptionStatus> {
  if (!configured) return customerInfoToStatus(null);
  try {
    const info = await Purchases.restorePurchases();
    return customerInfoToStatus(info);
  } catch (e) {
    console.warn("[RevenueCat] restorePurchases failed", e);
    return fetchSubscriptionStatus();
  }
}

export async function logInRevenueCat(userId: string): Promise<void> {
  if (!configured || !userId.trim()) return;
  try {
    await Purchases.logIn(userId.trim());
  } catch (e) {
    console.warn("[RevenueCat] logIn failed", e);
  }
}

export async function logOutRevenueCat(): Promise<void> {
  if (!configured) return;
  try {
    const info = await Purchases.getCustomerInfo();
    if (info.originalAppUserId.startsWith("$RCAnonymousID:")) return;
    await Purchases.logOut();
  } catch (e) {
    console.warn("[RevenueCat] logOut failed", e);
  }
}

export function addCustomerInfoListener(
  listener: (status: NativeSubscriptionStatus) => void
): () => void {
  if (!configured) return () => undefined;
  const wrapped = (info: CustomerInfo) => {
    listener(customerInfoToStatus(info));
  };
  Purchases.addCustomerInfoUpdateListener(wrapped);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(wrapped);
  };
}

export async function handleWebSubscriptionMessage(
  raw: string
): Promise<{ status?: NativeSubscriptionStatus; paywallResult?: PAYWALL_RESULT }> {
  let message: WebToNativeMessage;
  try {
    message = JSON.parse(raw) as WebToNativeMessage;
  } catch {
    return {};
  }

  switch (message.type) {
    case "subscription:present-paywall": {
      const paywallResult = await presentSubscriptionPaywall();
      const status = await fetchSubscriptionStatus();
      return { status, paywallResult };
    }
    case "subscription:present-paywall-if-needed": {
      const paywallResult = await presentPaywallIfNeeded();
      const status = await fetchSubscriptionStatus();
      return { status, paywallResult };
    }
    case "subscription:restore": {
      const status = await restorePurchases();
      return { status };
    }
    case "subscription:login":
      await logInRevenueCat(message.userId);
      return { status: await fetchSubscriptionStatus() };
    case "subscription:logout":
      await logOutRevenueCat();
      return { status: await fetchSubscriptionStatus() };
    case "subscription:refresh":
      return { status: await fetchSubscriptionStatus() };
    default:
      return {};
  }
}

export function injectSubscriptionStatusScript(
  status: NativeSubscriptionStatus
): string {
  const payload = JSON.stringify(status);
  return `
    (function() {
      try {
        window.__IMITATION_SUBSCRIPTION__ = ${payload};
        window.dispatchEvent(new CustomEvent('imitation-subscription-status', {
          detail: ${payload}
        }));
      } catch (e) {}
      true;
    })();
  `;
}
