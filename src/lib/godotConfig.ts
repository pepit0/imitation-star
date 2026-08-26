/** Minimal Godot ConfigFile (.ini / .txt) parser for Choicer Voicer packs. */

export type GodotConfigSection = Record<string, unknown>;

export type GodotConfig = Record<string, GodotConfigSection>;

function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(";");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
}

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (!v) return "";

  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }

  if (v === "true") return true;
  if (v === "false") return false;

  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseScalar(part.trim()));
  }

  const num = Number(v);
  if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(v)) return num;

  return v;
}

/** Parse a Godot ConfigFile string into sections. */
export function parseGodotConfig(text: string): GodotConfig {
  const config: GodotConfig = {};
  let section = "data";

  for (const line of stripComments(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1]!.trim();
      if (!config[section]) config[section] = {};
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const valueRaw = trimmed.slice(eq + 1).trim();
    if (!config[section]) config[section] = {};
    config[section]![key] = parseScalar(valueRaw);
  }

  return config;
}

/** Read the `[data]` section (CV packs always use this). */
export function readConfigData(text: string): GodotConfigSection {
  const config = parseGodotConfig(text);
  return config.data ?? config[Object.keys(config)[0] ?? "data"] ?? {};
}
