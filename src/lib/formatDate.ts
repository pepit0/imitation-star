/** Simple forum timestamps: Today / Yesterday / This week / Aug 26 (/ year if needed). */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatForumPostDate(
  iso: string,
  now: Date = new Date()
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const today = startOfLocalDay(now);
  const postDay = startOfLocalDay(date);
  const diffDays = Math.round(
    (today.getTime() - postDay.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays >= 2 && diffDays < 7) return "This week";

  const month = MONTHS[date.getMonth()] ?? "";
  const day = date.getDate();
  if (date.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${date.getFullYear()}`;
  }
  return `${month} ${day}`;
}

function formatLocalTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Human-readable save timestamp for pack progress (e.g. "Today at 3:45 PM"). */
export function formatProgressSavedAt(
  iso: string,
  now: Date = new Date()
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const today = startOfLocalDay(now);
  const savedDay = startOfLocalDay(date);
  const diffDays = Math.round(
    (today.getTime() - savedDay.getTime()) / (24 * 60 * 60 * 1000)
  );
  const time = formatLocalTime(date);

  if (diffDays === 0) return `Today at ${time}`;
  if (diffDays === 1) return `Yesterday at ${time}`;

  const month = MONTHS[date.getMonth()] ?? "";
  const day = date.getDate();
  if (date.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${date.getFullYear()} at ${time}`;
  }
  return `${month} ${day} at ${time}`;
}
