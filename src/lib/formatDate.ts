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
