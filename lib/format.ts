export function formatPace(secondsPerMile: number | null | undefined): string {
  if (!secondsPerMile || secondsPerMile <= 0) return "—";
  const min = Math.floor(secondsPerMile / 60);
  const sec = Math.round(secondsPerMile % 60);
  return `${min}:${sec.toString().padStart(2, "0")}/mi`;
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Short label for a workout's exercise list when no AI summary is
// available (e.g. entries logged before the summary field existed) — caps
// at `max` names so a long session doesn't turn into an unreadable wall of
// text wherever it's used as a one-line fallback.
export function summarizeExerciseNames(exercises: { name: string }[], max = 3): string {
  const names = exercises.map((e) => e.name);
  if (names.length === 0) return "";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}

export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatMinutes(totalMinutes: number | null | undefined): string {
  if (!totalMinutes || totalMinutes <= 0) return "—";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

// ── Dates ─────────────────────────────────────────────────────────────
//
// Every "what day is it" question resolves in the athlete's own timezone,
// never the machine's. On Vercel the server runs in UTC, so machine-local
// date math rolled the app over to tomorrow at 7pm Central — the plan, body
// map and stats would jump a day mid-evening while the log's date picker
// (running on the phone) still showed today.
//
// Single-tenant app, so the zone is a constant rather than plumbed through
// every request. Change this one line if the athlete relocates.
export const APP_TIMEZONE = "America/Chicago";

/** Minutes the zone is ahead of UTC at that instant (handles DST). */
function tzOffsetMinutes(date: Date, tz: string = APP_TIMEZONE): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value])) as Record<string, string>;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

/** Midnight of the given calendar day in the app zone, as a UTC instant. */
function midnightOf(year: number, month1: number, day: number): Date {
  const guess = Date.UTC(year, month1 - 1, day, 0, 0, 0);
  return new Date(guess - tzOffsetMinutes(new Date(guess)) * 60000);
}

/** YYYY-MM-DD for the instant, as seen in the app's timezone. */
export function localDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function startOfLocalDay(d: Date): Date {
  const [y, m, day] = localDateKey(d).split("-").map(Number);
  return midnightOf(y, m, day);
}

/**
 * Shifts by whole calendar days in the app zone. Plain `setDate` arithmetic
 * drifts an hour across a DST boundary — which Nov 1 lands inside this
 * training block — and an hour is enough to report the wrong day.
 */
export function shiftDays(d: Date, days: number): Date {
  const [y, m, day] = localDateKey(d).split("-").map(Number);
  return midnightOf(y, m, day + days);
}

/**
 * Whole calendar days from one YYYY-MM-DD key to another (positive when `to`
 * is later). Pure calendar math, so it is exact in any zone and across DST —
 * parsing keys as local midnights and dividing by 24h gives 23/25-hour days
 * on the clock-change nights, and mixing a machine-local midnight with an
 * app-zone one is off by the zone gap.
 */
export function daysBetweenKeys(from: string, to: string): number {
  const utc = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86400000);
}

/** Sunday that starts the training week containing `d` (weeks run Sun–Sat). */
export function startOfWeekSunday(d: Date): Date {
  const [y, m, day] = localDateKey(d).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return midnightOf(y, m, day - dow);
}

// Equipment words that get dropped when grouping lifts, because the AI
// parser has historically logged the same movement both with and without
// them ("Incline Barbell Bench Press" vs "Incline Bench Press"). Only words
// that don't distinguish a genuinely different lift belong here — "dumbbell"
// and "machine" must stay, since those are different movements.
const GROUPING_STOPWORDS = new Set(["barbell"]);

/**
 * Collapses spelling variants of the same lift into one grouping key, so
 * progress on a lift isn't split across near-identical names. Grouping only —
 * display always uses the most common original spelling.
 */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !GROUPING_STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}
