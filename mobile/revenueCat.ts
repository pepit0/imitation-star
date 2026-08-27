import { Alert, Platform } from "react-native";
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
let configureAttempted = false;

function resolveApiKey(): string | null {
  const ios = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim();
  const android = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();
  const shared = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY?.trim();

  if (Platform.OS === "ios" && ios) return ios;
  if (Platform.OS === "android" && android) return android;
  if (shared) return shared;
  return null;
}

/** Test Store keys (`test_…`) crash release / TestFlight builds by design in RevenueCat. */
function isTestStoreKey(apiKey: string): boolean {
  return apiKey.startsWith("test_");
}

function canUseApiKeyInThisBuild(apiKey: string): boolean {
  if (isTestStoreKey(apiKey) && !__DEV__) {
    console.warn(
      "[RevenueCat] Refusing Test Store API key in a release build (would crash). Use an appl_/goog_ key for TestFlight."
    );
    return false;
  }
  return true;
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

export function isRevenueCatAvailable(): boolean {
  const apiKey = resolveApiKey();
  return Boolean(apiKey && canUseApiKeyInThisBuild(apiKey));
}

export function configureRevenueCat(): boolean {
  if (configured) return true;
  if (configureAttempted) return false;
  configureAttempted = true;

  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.warn(
      "[RevenueCat] Missing EXPO_PUBLIC_REVENUECAT_IOS_API_KEY / ANDROID / shared API key."
    );
    return false;
  }
  if (!canUseApiKeyInThisBuild(apiKey)) {
    return false;
  }

  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    Purchases.configure({ apiKey });
    configured = true;
    return true;
  } catch (e) {
    console.warn("[RevenueCat] configure failed", e);
    configured = false;
    return false;
  }
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

const emptyStatus = (): NativeSubscriptionStatus => ({
  isPro: false,
  entitlementId: REVENUECAT_ENTITLEMENT_ID,
  expirationDate: null,
  managementUrl: null,
});

export async function fetchSubscriptionStatus(): Promise<NativeSubscriptionStatus> {
  if (!configured) return emptyStatus();
  try {
    const info = await Purchases.getCustomerInfo();
    return customerInfoToStatus(info);
  } catch (e) {
    console.warn("[RevenueCat] getCustomerInfo failed", e);
    return emptyStatus();
  }
}

async function resolvePaywallOffering() {
  const offerings = await Purchases.getOfferings();
  return (
    offerings.all[REVENUECAT_OFFERING_ID] ?? offerings.current ?? null
  );
}

function alertBillingUnavailable(detail?: string): void {
  Alert.alert(
    "Star Club unavailable",
    detail ??
      "Subscriptions aren’t ready on this build yet. Please try again after the next update."
  );
}

export async function presentSubscriptionPaywall(): Promise<PAYWALL_RESULT> {
  if (!configureRevenueCat()) {
    alertBillingUnavailable(
      "Billing isn’t configured for this build. A TestFlight update with the App Store RevenueCat key is required."
    );
    return PAYWALL_RESULT.NOT_PRESENTED;
  }
  try {
    const offering = await resolvePaywallOffering();
    if (!offering) {
      alertBillingUnavailable(
        "No subscription packages are available yet. Check the RevenueCat offering and App Store products."
      );
      return PAYWALL_RESULT.NOT_PRESENTED;
    }
    return await RevenueCatUI.presentPaywall({
      offering,
      displayCloseButton: true,
    });
  } catch (e) {
    console.warn("[RevenueCat] presentPaywall failed", e);
    alertBillingUnavailable(
      e instanceof Error ? e.message : "Could not open the paywall."
    );
    return PAYWALL_RESULT.ERROR;
  }
}

export async function presentPaywallIfNeeded(): Promise<PAYWALL_RESULT> {
  if (!configureRevenueCat()) {
    return PAYWALL_RESULT.NOT_PRESENTED;
  }
  try {
    const offering = await resolvePaywallOffering();
    if (!offering) return PAYWALL_RESULT.NOT_PRESENTED;
    return await RevenueCatUI.presentPaywallIfNeeded({
      offering,
      requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_ID,
      displayCloseButton: true,
    });
  } catch (e) {
    console.warn("[RevenueCat] presentPaywallIfNeeded failed", e);
    return PAYWALL_RESULT.ERROR;
  }
}

export async function restorePurchases(): Promise<NativeSubscriptionStatus> {
  if (!configureRevenueCat()) return emptyStatus();
  try {
    const info = await Purchases.restorePurchases();
    return customerInfoToStatus(info);
  } catch (e) {
    console.warn("[RevenueCat] restorePurchases failed", e);
    return fetchSubscriptionStatus();
  }
}

export async function logInRevenueCat(userId: string): Promise<void> {
  if (!configureRevenueCat() || !userId.trim()) return;
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
  try {
    Purchases.addCustomerInfoUpdateListener(wrapped);
    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(wrapped);
      } catch {
        /* ignore */
      }
    };
  } catch (e) {
    console.warn("[RevenueCat] addCustomerInfoUpdateListener failed", e);
    return () => undefined;
  }
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

  try {
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
  } catch (e) {
    console.warn("[RevenueCat] handleWebSubscriptionMessage failed", e);
    return { status: emptyStatus() };
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
