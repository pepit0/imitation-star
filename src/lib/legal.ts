/** Shared legal / store-compliance copy. */

export const APP_NAME = "Imitation Star";
export const APP_DOMAIN = "imitation.site";
export const APP_ORIGIN = `https://www.${APP_DOMAIN}`;

export const SUPPORT_EMAIL = `support@${APP_DOMAIN}`;
export const LEGAL_EMAIL = `legal@${APP_DOMAIN}`;

/** ISO date string shown on policy pages. */
export const LEGAL_EFFECTIVE_DATE = "2026-08-26";

export const LEGAL_ROUTES = {
  privacy: "/privacy",
  terms: "/terms",
  support: "/support",
} as const;

export function legalUrl(path: keyof typeof LEGAL_ROUTES): string {
  return `${APP_ORIGIN}${LEGAL_ROUTES[path]}`;
}
