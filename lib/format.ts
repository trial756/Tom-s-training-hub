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

// Local-date helpers (not toISOString() slicing) so day boundaries follow
// the local calendar rather than rolling over at UTC midnight.
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
