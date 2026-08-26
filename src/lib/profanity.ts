/** Display-name profanity checks (client + server-safe, no deps). */

/** Both forms of the racial slur, plus common plurals and evasions. */
const N_SLUR_VARIANTS = [
  "nigger",
  "niggers",
  "nigga",
  "niggas",
  "niggaz",
  "niggah",
  "niggahs",
  "niggar",
  "nibba",
  "nibbas",
  "nibber",
  "nibbers",
] as const;

const BLOCKLIST = [
  "anal",
  "anus",
  "arse",
  "asshole",
  "bastard",
  "bitch",
  "blowjob",
  "bollock",
  "boner",
  "boob",
  "bugger",
  "bullshit",
  "chink",
  "clit",
  "cock",
  "coon",
  "crap",
  "cunt",
  "dick",
  "dildo",
  "dyke",
  "fag",
  "faggot",
  "fuck",
  "gook",
  "handjob",
  "hitler",
  "homo",
  "jap",
  "kike",
  "kunt",
  "milf",
  "muff",
  "nazi",
  "negro",
  "penis",
  "piss",
  "prick",
  "pussy",
  "rape",
  "rapist",
  "retard",
  "scrotum",
  "shit",
  "slut",
  "spastic",
  "spic",
  "tits",
  "twat",
  "vagina",
  "wank",
  "whore",
  "wtf",
  ...N_SLUR_VARIANTS,
] as const;

const SHORT_WORDS = new Set(
  BLOCKLIST.filter((word) => word.length <= 3).map((word) => word)
);
const LONG_WORDS = BLOCKLIST.filter((word) => word.length >= 4);

const LEET: Record<string, string> = {
  "@": "a",
  "4": "a",
  "8": "b",
  "(": "c",
  "3": "e",
  "1": "i",
  "!": "i",
  "|": "i",
  "0": "o",
  "$": "s",
  "5": "s",
  "7": "t",
  "+": "t",
  "9": "g",
};

function applyLeet(text: string): string {
  let out = text.toLowerCase();
  for (const [from, to] of Object.entries(LEET)) {
    out = out.split(from).join(to);
  }
  return out;
}

function normalizeExact(raw: string): string {
  return applyLeet(raw).replace(/[^a-z0-9]/g, "");
}

/** Aggressive repeat collapse for stretched evasions (fuuuuck → fuck). */
function collapseAggressive(text: string): string {
  return text.replace(/(.)\1+/g, "$1");
}

function tokensFromDisplayName(name: string): string[] {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .map(normalizeExact)
    .filter(Boolean);
}

/** Hard check for both N-word slur forms after leet normalization. */
function containsNSlur(exact: string, collapsed: string, tokens: string[]): boolean {
  for (const slur of N_SLUR_VARIANTS) {
    if (tokens.includes(slur)) return true;
    if (exact.includes(slur)) return true;
    if (collapsed.includes(slur)) return true;
  }

  if (/n+i+g+g+[ae3]+r*/.test(exact)) return true;
  if (/n+i+g+g+[ae3]+r*/.test(collapsed)) return true;
  if (/n+i+b+b+[ae3]+r*/.test(exact)) return true;
  if (/n+i+b+b+[ae3]+r*/.test(collapsed)) return true;

  return false;
}

/** True when the display name contains blocked language. */
export function containsProfanity(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;

  const exact = normalizeExact(trimmed);
  const collapsed = collapseAggressive(exact);
  const tokens = tokensFromDisplayName(trimmed);

  if (containsNSlur(exact, collapsed, tokens)) return true;

  for (const word of SHORT_WORDS) {
    if (tokens.includes(word)) return true;
  }

  for (const word of LONG_WORDS) {
    if (tokens.includes(word)) return true;
    if (exact.includes(word)) return true;
    if (collapsed.includes(word)) return true;
  }

  return false;
}

/** Returns an error message, or null when the display name is allowed. */
export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Pick a display name.";
  if (containsProfanity(trimmed)) {
    return "Please choose a display name without inappropriate language.";
  }
  return null;
}
