/** EchoStage brand palette — top → bottom priority */
export const PALETTE = {
  coral: "#FF595E",
  pollen: "#FFCA3A",
  green: "#8AC926",
  blue: "#1982C4",
  grape: "#6A4C93",
} as const;

export type PaletteColor = (typeof PALETTE)[keyof typeof PALETTE];

/** Derived shades for UI surfaces */
export const PALETTE_DERIVED = {
  coralHover: "#E04E53",
  coralDeep: "#C43D42",
  pollenHover: "#E0B02E",
  greenHover: "#6FA81C",
  blueHover: "#14699D",
  blueDeep: "#125A87",
  blueNavy: "#0B3A57",
  cream: "#FFF8EB",
  inkMuted: "#555555",
  textOnDark: "#C5DFF0",
} as const;

export const PALETTE_ALL = Object.values(PALETTE);
