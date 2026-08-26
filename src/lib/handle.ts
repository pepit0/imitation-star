/** Normalize a public @handle (stored without @). */
export function sanitizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

export function formatHandle(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const clean = sanitizeHandle(raw);
  return clean ? `@${clean}` : undefined;
}

export function isValidHandle(raw: string): boolean {
  const clean = sanitizeHandle(raw);
  return clean.length >= 3 && clean.length <= 32;
}
