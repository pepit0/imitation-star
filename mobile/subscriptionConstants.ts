/** RevenueCat entitlement lookup_key (Imitation Star Pro). */
export const REVENUECAT_ENTITLEMENT_ID = "imitation_star_pro";

/** Offering with the dashboard paywall attached. */
export const REVENUECAT_OFFERING_ID = "star-subscriptions";

export type NativeSubscriptionStatus = {
  isPro: boolean;
  entitlementId: string;
  expirationDate: string | null;
  managementUrl: string | null;
};

export type NativeToWebMessage =
  | { type: "subscription:status"; status: NativeSubscriptionStatus }
  | { type: "subscription:paywall-result"; result: string };

export type WebToNativeMessage =
  | { type: "subscription:present-paywall" }
  | { type: "subscription:present-paywall-if-needed" }
  | { type: "subscription:restore" }
  | { type: "subscription:login"; userId: string }
  | { type: "subscription:logout" }
  | { type: "subscription:refresh" };
