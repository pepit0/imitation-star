/** Shared legal / store-compliance copy — update contact email before launch. */

export const APP_NAME = "Imitation Star";
export const APP_DOMAIN = "imitation-star.vercel.app";
export const APP_ORIGIN = `https://${APP_DOMAIN}`;

export const SUPPORT_EMAIL = "support@imitationstar.app";
export const LEGAL_EMAIL = "legal@imitationstar.app";

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
