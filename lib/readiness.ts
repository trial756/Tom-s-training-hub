import { buildMarathonPlan, GOAL_PACE_SECONDS_PER_MILE, RACE_DATE } from "@/lib/marathonPlan";
import { localDateKey, shiftDays, startOfLocalDay, startOfWeekSunday } from "@/lib/format";

/**
 * Hard evidence for whether the 3:30 attempt is on track, checked against
 * the things that actually decide a marathon: how far you can run, how far
 * you can hold goal pace, and how much you're running weekly.
 *
 * The point is a decision point. Each marker has a week by which it must be
 * met, so the answer arrives while there's still time to act on it rather
 * than at mile 20 on race day.
 */

/** Average pace at or under this counts as goal-pace work. */
const MP_PACE_CEILING = GOAL_PACE_SECONDS_PER_MILE + 14; // 8:15/mi
const WEEKS_AVG = 3;

export type MarkerStatus = "on_track" | "behind" | "critical";

export interface ReadinessMarker {
  key: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  dueWeek: number;
  status: MarkerStatus;
  note: string;
}

export interface Readiness {
  daysToRace: number;
  markers: ReadinessMarker[];
  /** Riegel-equivalent marathon time from the best hard effort logged. */
  projectedSeconds: number | null;
  projectedFrom: string | null;
  verdict: string;
}

export interface ReadinessRun {
  logged_at: string;
  distance_miles?: number | null;
  duration_seconds?: number | null;
  pace_seconds_per_mile?: number | null;
}

function riegel(seconds: number, from: number, to: number): number {
  return seconds * Math.pow(to / from, 1.06);
}

/**
 * Judged on whether the remaining gap can still be closed, not on how much
 * time has passed — measuring elapsed time marks everything "on track" at
 * the start of a block and then flips straight to "critical", which is
 * exactly when the warning is useless.
 *
 * `plausibleRate` is how much that marker can realistically move per week
 * without inviting injury.
 */
function statusFor(current: number, target: number, weeksToDeadline: number, plausibleRate: number): MarkerStatus {
  const gap = target - current;
  if (gap <= 0) return "on_track";
  if (weeksToDeadline <= 0) return "critical";
  const ratio = gap / weeksToDeadline / plausibleRate;
  if (ratio <= 0.7) return "on_track";
  if (ratio <= 1) return "behind";
  return "critical";
}

/** Weeks from today until the end of a given plan week. */
function weeksUntilPlanWeek(weekNumber: number, now: Date): number {
  const week = buildMarathonPlan().find((w) => w.weekNumber === weekNumber);
  if (!week) return 0;
  const end = new Date(`${week.endDate}T00:00:00`);
  return Math.max(0, (end.getTime() - now.getTime()) / 86400000 / 7);
}

export function computeReadiness(runs: ReadinessRun[], today: Date = new Date()): Readiness {
  const now = startOfLocalDay(today);
  const race = new Date(`${RACE_DATE}T00:00:00`);
  const daysToRace = Math.max(0, Math.round((race.getTime() - now.getTime()) / 86400000));

  const valid = runs.filter((r) => (Number(r.distance_miles) || 0) > 0);

  // 1. Longest run
  const longest = valid.reduce((max, r) => Math.max(max, Number(r.distance_miles) || 0), 0);

  // 2. Longest run held at or near goal pace
  const mpRuns = valid.filter(
    (r) => r.pace_seconds_per_mile != null && Number(r.pace_seconds_per_mile) <= MP_PACE_CEILING
  );
  const longestAtPace = mpRuns.reduce((max, r) => Math.max(max, Number(r.distance_miles) || 0), 0);

  // 3. Recent weekly volume
  const weekStart = startOfWeekSunday(now);
  const cutoff = shiftDays(weekStart, -WEEKS_AVG * 7);
  const cutoffKey = localDateKey(cutoff);
  const weekStartKey = localDateKey(weekStart);
  const recentMiles = valid
    .filter((r) => {
      const d = localDateKey(new Date(r.logged_at));
      return d >= cutoffKey && d < weekStartKey;
    })
    .reduce((sum, r) => sum + (Number(r.distance_miles) || 0), 0);
  const weeklyVolume = Math.round((recentMiles / WEEKS_AVG) * 10) / 10;

  const markers: ReadinessMarker[] = [
    {
      key: "long_run",
      label: "Longest run",
      current: Math.round(longest * 10) / 10,
      target: 20,
      unit: "mi",
      dueWeek: 24,
      status: statusFor(longest, 20, weeksUntilPlanWeek(24, now), 2),
      note: "Needs at least one 20 before the taper — ideally two.",
    },
    {
      key: "goal_pace",
      label: "Longest run at ≤8:15/mi",
      current: Math.round(longestAtPace * 10) / 10,
      target: 10,
      unit: "mi",
      dueWeek: 23,
      status: statusFor(longestAtPace, 10, weeksUntilPlanWeek(23, now), 2),
      note: "The real test. Holding goal pace for 10 is what makes 26 plausible.",
    },
    {
      key: "volume",
      label: "Weekly volume (3wk avg)",
      current: weeklyVolume,
      target: 30,
      unit: "mi",
      dueWeek: 24,
      status: statusFor(weeklyVolume, 30, weeksUntilPlanWeek(24, now), 3),
      note: "Durability for the last 10K comes from weekly miles, not long runs alone.",
    },
  ];

  // Best hard effort -> Riegel equivalent
  let projectedSeconds: number | null = null;
  let projectedFrom: string | null = null;
  let best = Infinity;
  for (const r of valid) {
    const miles = Number(r.distance_miles) || 0;
    const secs = Number(r.duration_seconds) || 0;
    if (miles < 3 || secs <= 0) continue;
    const equivalent = riegel(secs, miles, 26.2);
    if (equivalent < best) {
      best = equivalent;
      projectedFrom = `${Math.round(miles * 10) / 10}mi at ${Math.floor((secs / miles) / 60)}:${String(
        Math.round((secs / miles) % 60)
      ).padStart(2, "0")}/mi`;
    }
  }
  if (Number.isFinite(best)) projectedSeconds = Math.round(best);

  const critical = markers.filter((m) => m.status === "critical").length;
  const behind = markers.filter((m) => m.status === "behind").length;
  const verdict =
    critical >= 2
      ? "Off track for 3:30. The honest call is to run this one by effort and move the goal to a spring race."
      : critical === 1
      ? "At risk. One marker is well behind — close it in the next two weeks or plan a slower, even race."
      : behind >= 1
      ? "Live but tight. Protect the long run and the goal-pace work above everything else."
      : "On track. Keep the build honest and don't chase extra miles on tired legs.";

  return { daysToRace, markers, projectedSeconds, projectedFrom, verdict };
}
