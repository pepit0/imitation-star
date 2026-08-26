/** Profile animal icons + background colors from the app palette. */

export const DEFAULT_AVATAR_ICON = "cat";
export const DEFAULT_AVATAR_COLOR = "#ff595e";

export const PROFILE_ICONS = [
  { id: "cat", label: "Cat" },
  { id: "dog", label: "Dog" },
  { id: "bear", label: "Bear" },
  { id: "pig", label: "Pig" },
  { id: "frog", label: "Frog" },
  { id: "rabbit", label: "Rabbit" },
  { id: "gorilla", label: "Gorilla" },
  { id: "turtle", label: "Turtle" },
  { id: "ox", label: "Ox" },
  { id: "buffalo", label: "Buffalo" },
] as const;

export type ProfileIconId = (typeof PROFILE_ICONS)[number]["id"];

export const AVATAR_COLORS = [
  { id: "coral", label: "Coral", value: "#ff595e" },
  { id: "pollen", label: "Pollen", value: "#ffca3a" },
  { id: "green", label: "Green", value: "#8ac926" },
  { id: "blue", label: "Blue", value: "#1982c4" },
  { id: "grape", label: "Grape", value: "#6a4c93" },
  { id: "black", label: "Black", value: "#111111" },
] as const;

const ICON_IDS = new Set<string>(PROFILE_ICONS.map((icon) => icon.id));
const COLOR_VALUES = new Set<string>(AVATAR_COLORS.map((color) => color.value));

export function normalizeAvatarIcon(icon: string | null | undefined): ProfileIconId {
  if (icon && ICON_IDS.has(icon)) return icon as ProfileIconId;
  return DEFAULT_AVATAR_ICON;
}

export function resolveAvatarColor(color: string | null | undefined): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  if (color && COLOR_VALUES.has(color.toLowerCase())) return color.toLowerCase();
  return DEFAULT_AVATAR_COLOR;
}

export function getProfileIconSrc(icon: string | null | undefined): string {
  const id = normalizeAvatarIcon(icon);
  return `/profile-icons/${id}.png`;
}

/** Pick white or dark icon fill for contrast on avatar backgrounds. */
export function avatarIconFill(backgroundColor: string): string {
  const hex = resolveAvatarColor(backgroundColor).replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111111" : "#ffffff";
}
