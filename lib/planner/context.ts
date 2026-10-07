import { daysBetweenKeys, localDateKey, normalizeExerciseName, shiftDays, startOfLocalDay, startOfWeekSunday } from "@/lib/format";
import { MUSCLE_LABELS, MUSCLE_REGIONS, type MuscleRegion } from "@/lib/muscles";
import { buildExerciseLookup, computeMuscleActivity, type ExerciseLookup } from "@/lib/muscleCoverage";
import { buildMarathonPlan, currentWeek, RACE_DATE } from "@/lib/marathonPlan";
import type { LiftAnchor, PlannerContext, RegionSnapshot } from "@/lib/planner/types";

/** A region counts as neglected once it's gone this long without direct work. */
const STALE_DAYS = 7;
/** How far back cadence is inferred from. */
const CADENCE_WEEKS = 4;

export interface PlannerSourceRow {
  logged_at: string;
  exercises?: { name?: string | null; sets?: { reps?: number | null; weight?: number | null }[] | null }[] | null;
  muscle_groups?: string[] | null;
  summary?: string | null;
}

export interface PlannerRunRow {
  logged_at: string;
  distance_miles?: number | null;
  run_type?: string | null;
  summary?: string | null;
}

/**
 * Assembles the facts the week generator plans against. Everything here is
 * computed, never inferred by the model — it should only have to decide what
 * to do, not work out what already happened.
 */
export function buildPlannerContext(opts: {
  workouts: PlannerSourceRow[];
  runs: PlannerRunRow[];
  exerciseMuscles: { key: string; primary_muscles?: unknown; secondary_muscles?: unknown }[];
  today?: Date;
}): PlannerContext {
  const today = startOfLocalDay(opts.today ?? new Date());
  const todayKey = localDateKey(today);
  const weekStartDate = startOfWeekSunday(today);
  const weekEndDate = shiftDays(weekStartDate, 6);
  const weekStart = localDateKey(weekStartDate);
  const weekEnd = localDateKey(weekEndDate);

  const lookup: ExerciseLookup = buildExerciseLookup(opts.exerciseMuscles);

  // ── Muscle picture over a rolling fortnight ───────────────────────────
  const windowStart = shiftDays(today, -13);
  const inWindow = (iso: string) => localDateKey(new Date(iso)) >= localDateKey(windowStart);

  const windowWorkouts = opts.workouts.filter((w) => inWindow(w.logged_at));
  const windowRuns = opts.runs.filter((r) => inWindow(r.logged_at));
  const activity = computeMuscleActivity(windowWorkouts, windowRuns, lookup, today);

  const regions: RegionSnapshot[] = MUSCLE_REGIONS.map((region) => ({
    region,
    label: MUSCLE_LABELS[region],
    daysSince: activity[region].daysSince,
    primarySets: activity[region].primarySets,
    secondarySets: activity[region].secondarySets,
    sessions: activity[region].sessions,
    runMiles: Math.round(activity[region].runMiles * 10) / 10,
  }));

  // Never trained, or stale, or only ever hit as a bystander.
  const neglected = regions
    .filter((r) => r.daysSince == null || r.daysSince >= STALE_DAYS || r.primarySets === 0)
    .sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999))
    .map((r) => r.label);

  // ── This week so far ──────────────────────────────────────────────────
  const thisWeek = (iso: string) => {
    const key = localDateKey(new Date(iso));
    return key >= weekStart && key <= weekEnd;
  };

  const loggedThisWeek = [
    ...opts.workouts.filter((w) => thisWeek(w.logged_at)).map((w) => ({
      date: localDateKey(new Date(w.logged_at)),
      kind: "workout" as const,
      summary: w.summary || (w.muscle_groups ?? []).join(", ") || "Workout",
    })),
    ...opts.runs.filter((r) => thisWeek(r.logged_at)).map((r) => ({
      date: localDateKey(new Date(r.logged_at)),
      kind: "run" as const,
      summary: r.summary || `${r.run_type ?? "Run"}${r.distance_miles ? ` ${r.distance_miles}mi` : ""}`,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const milesThisWeek =
    Math.round(
      opts.runs.filter((r) => thisWeek(r.logged_at)).reduce((sum, r) => sum + (Number(r.distance_miles) || 0), 0) * 10
    ) / 10;

  // ── Marathon plan position ────────────────────────────────────────────
  const weeks = buildMarathonPlan();
  const active = currentWeek(weeks);
  const marathon = active
    ? {
        planWeek: active.weekNumber,
        phase: active.phase,
        weeklyMileage: active.weeklyMileage,
        longRunMiles: active.longRunMiles,
        focus: active.keyWorkout,
        isRecoveryWeek: active.isRecoveryWeek,
        isRaceWeek: active.isRaceWeek,
        daysToRace: Math.max(0, daysBetweenKeys(todayKey, RACE_DATE)),
      }
    : null;

  // ── Cadence, inferred rather than assumed ─────────────────────────────
  const cadenceStart = shiftDays(weekStartDate, -CADENCE_WEEKS * 7);
  const cadenceKey = localDateKey(cadenceStart);
  const distinctDays = (rows: { logged_at: string }[]) =>
    new Set(rows.map((r) => localDateKey(new Date(r.logged_at))).filter((d) => d >= cadenceKey && d < weekStart)).size;

  const liftDaysPerWeek = Math.max(1, Math.round(distinctDays(opts.workouts) / CADENCE_WEEKS));
  const runDaysPerWeek = Math.max(1, Math.round(distinctDays(opts.runs) / CADENCE_WEEKS));

  // Actual recent volume. The plan's target says what the block wants; this
  // says what the athlete is currently built for, and the gap between them
  // is what stops the planner prescribing an unsafe jump.
  const cadenceRuns = opts.runs.filter((r) => {
    const d = localDateKey(new Date(r.logged_at));
    return d >= cadenceKey && d < weekStart;
  });
  const cadenceMiles = cadenceRuns.reduce((sum, r) => sum + (Number(r.distance_miles) || 0), 0);
  const avgWeeklyMiles = Math.round((cadenceMiles / CADENCE_WEEKS) * 10) / 10;
  const typicalRunMiles = cadenceRuns.length
    ? Math.max(2, Math.round((cadenceMiles / cadenceRuns.length) * 10) / 10)
    : 3;

  // ── Strength anchors: what to progress from ───────────────────────────
  const lifts = new Map<string, { name: string; counts: Map<string, number>; top: number | null; last: string | null; days: Set<string> }>();
  for (const workout of opts.workouts) {
    const day = localDateKey(new Date(workout.logged_at));
    for (const exercise of workout.exercises ?? []) {
      const key = normalizeExerciseName(exercise?.name ?? "");
      if (!key) continue;
      const top = Math.max(0, ...(exercise?.sets ?? []).map((s) => Number(s?.weight) || 0));
      if (!lifts.has(key)) lifts.set(key, { name: exercise!.name!, counts: new Map(), top: null, last: null, days: new Set() });
      const entry = lifts.get(key)!;
      entry.counts.set(exercise!.name!, (entry.counts.get(exercise!.name!) ?? 0) + 1);
      entry.days.add(day);
      if (!entry.last || day > entry.last) {
        entry.last = day;
        entry.top = top > 0 ? top : null;
      }
    }
  }

  const anchors: LiftAnchor[] = Array.from(lifts.entries())
    .map(([key, entry]) => {
      const display = Array.from(entry.counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
      const tags = lookup.get(key);
      return {
        name: display,
        lastTopSet: entry.top,
        lastDate: entry.last,
        sessions: entry.days.size,
        regions: [...(tags?.primary ?? []), ...(tags?.secondary ?? [])] as MuscleRegion[],
      };
    })
    .sort((a, b) => b.sessions - a.sessions || (b.lastDate ?? "").localeCompare(a.lastDate ?? ""))
    .slice(0, 20);

  const daysRemaining = Math.max(0, daysBetweenKeys(todayKey, weekEnd) + 1);

  return {
    today: todayKey,
    weekStart,
    weekEnd,
    daysRemaining,
    marathon,
    milesThisWeek,
    milesRemaining: marathon ? Math.max(0, Math.round((marathon.weeklyMileage - milesThisWeek) * 10) / 10) : 0,
    loggedThisWeek,
    regions,
    neglected,
    liftDaysPerWeek,
    runDaysPerWeek,
    avgWeeklyMiles,
    typicalRunMiles,
    anchors,
  };
}
