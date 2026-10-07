import { daysBetweenKeys, localDateKey, normalizeExerciseName } from "@/lib/format";
import { COARSE_TO_REGIONS, MUSCLE_REGIONS, RUN_REGIONS, type MuscleRegion } from "@/lib/muscles";

export interface ExerciseLookupEntry {
  primary: MuscleRegion[];
  secondary: MuscleRegion[];
}

export type ExerciseLookup = Map<string, ExerciseLookupEntry>;

export interface WorkoutLike {
  logged_at: string;
  exercises?: { name?: string | null; sets?: { reps?: number | null; weight?: number | null }[] | null }[] | null;
  muscle_groups?: string[] | null;
}

export interface RunLike {
  logged_at: string;
  distance_miles?: number | null;
}

export interface RegionActivity {
  region: MuscleRegion;
  /** Local date key of the most recent session touching this region. */
  lastWorked: string | null;
  daysSince: number | null;
  /** Sets where this region was the target. */
  primarySets: number;
  /** Sets where it assisted. */
  secondarySets: number;
  /** Distinct days this region was trained. */
  sessions: number;
  /** Run mileage credited to this region (legs only). */
  runMiles: number;
}

export type MuscleActivity = Record<MuscleRegion, RegionActivity>;

/** Builds the lookup map from exercise_muscles rows. */
export function buildExerciseLookup(
  rows: { key: string; primary_muscles?: unknown; secondary_muscles?: unknown }[]
): ExerciseLookup {
  const map: ExerciseLookup = new Map();
  for (const row of rows) {
    map.set(row.key, {
      primary: (Array.isArray(row.primary_muscles) ? row.primary_muscles : []) as MuscleRegion[],
      secondary: (Array.isArray(row.secondary_muscles) ? row.secondary_muscles : []) as MuscleRegion[],
    });
  }
  return map;
}

function emptyActivity(): MuscleActivity {
  return Object.fromEntries(
    MUSCLE_REGIONS.map((region) => [
      region,
      { region, lastWorked: null, daysSince: null, primarySets: 0, secondarySets: 0, sessions: 0, runMiles: 0 },
    ])
  ) as MuscleActivity;
}

/**
 * Resolves logged work into per-region activity. Deliberately factual —
 * sets, days and mileage — so the avatar and the planner can each decide
 * what "enough" looks like rather than inheriting a threshold baked in here.
 *
 * Workouts resolve through the per-exercise lookup; entries whose exercises
 * aren't tagged (or that have no exercises at all, like a logged walk) fall
 * back to the coarse muscle_groups field so they don't read as blank.
 * Running credits the leg regions, because a marathoner's legs are under
 * real load even in a week with no leg day.
 */
export function computeMuscleActivity(
  workouts: WorkoutLike[],
  runs: RunLike[],
  lookup: ExerciseLookup,
  today: Date = new Date()
): MuscleActivity {
  const activity = emptyActivity();
  const todayKey = localDateKey(today);
  const daysBetween = (dayKey: string) => daysBetweenKeys(dayKey, todayKey);

  // Distinct days per region, so two sessions in one day count once.
  const daysByRegion = new Map<MuscleRegion, Set<string>>();
  const touch = (region: MuscleRegion, dayKey: string) => {
    if (!daysByRegion.has(region)) daysByRegion.set(region, new Set());
    daysByRegion.get(region)!.add(dayKey);
    const entry = activity[region];
    if (!entry.lastWorked || dayKey > entry.lastWorked) entry.lastWorked = dayKey;
  };

  for (const workout of workouts) {
    const dayKey = localDateKey(new Date(workout.logged_at));
    const exercises = workout.exercises ?? [];
    let tagged = false;

    for (const exercise of exercises) {
      const entry = lookup.get(normalizeExerciseName(exercise?.name ?? ""));
      if (!entry) continue;
      tagged = true;
      const setCount = Math.max(1, (exercise?.sets ?? []).length);
      for (const region of entry.primary) {
        activity[region].primarySets += setCount;
        touch(region, dayKey);
      }
      for (const region of entry.secondary) {
        activity[region].secondarySets += setCount;
        touch(region, dayKey);
      }
    }

    // Nothing resolved through the lookup — fall back to coarse groups.
    if (!tagged) {
      for (const group of workout.muscle_groups ?? []) {
        for (const region of COARSE_TO_REGIONS[group] ?? []) touch(region, dayKey);
      }
    }
  }

  for (const run of runs) {
    const dayKey = localDateKey(new Date(run.logged_at));
    const miles = Number(run.distance_miles) || 0;
    for (const region of RUN_REGIONS) {
      activity[region].runMiles += miles;
      touch(region, dayKey);
    }
  }

  for (const region of MUSCLE_REGIONS) {
    const entry = activity[region];
    entry.sessions = daysByRegion.get(region)?.size ?? 0;
    entry.daysSince = entry.lastWorked ? daysBetween(entry.lastWorked) : null;
  }

  return activity;
}

/** Regions with no logged work in the window, stalest first. */
export function stalestRegions(activity: MuscleActivity): RegionActivity[] {
  return MUSCLE_REGIONS.map((r) => activity[r]).sort((a, b) => {
    if (a.daysSince == null && b.daysSince == null) return 0;
    if (a.daysSince == null) return -1; // never trained sorts first
    if (b.daysSince == null) return 1;
    return b.daysSince - a.daysSince;
  });
}
