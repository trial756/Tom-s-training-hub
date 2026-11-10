import { supabaseAdmin } from "@/lib/supabase-admin";
import { blockForWeek, goalPaceSeconds, type Goal } from "@/lib/goals";
import { loadGoals } from "@/lib/goalsStore";
import { localDateKey, shiftDays, startOfLocalDay, startOfWeekSunday } from "@/lib/format";
import { computePaceZones, DEFAULT_PACE_ZONES, type PaceZones, type ZoneRun } from "@/lib/paceZones";

/** Runs from the last year, in the shape the zone maths reads. */
export function toZoneRuns(
  rows: {
    logged_at: string;
    run_type: string | null;
    distance_miles: number | string | null;
    pace_seconds_per_mile: number | null;
    avg_hr: number | null;
    max_hr: number | null;
  }[]
): ZoneRun[] {
  return rows.map((r) => ({
    date: localDateKey(new Date(r.logged_at)),
    type: r.run_type,
    miles: r.distance_miles == null ? null : Number(r.distance_miles),
    pace: r.pace_seconds_per_mile,
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
  }));
}

/** The race this week builds toward, when it has a target time to anchor paces. */
export function zoneGoalFor(goals: Goal[], today: Date) {
  const todayKey = localDateKey(today);
  const block = blockForWeek(goals, localDateKey(startOfWeekSunday(today)), todayKey);
  const g = block.kind === "race" ? block.goal : null;
  const pace = g ? goalPaceSeconds(g) : null;
  return g && pace && g.distance_mi && g.target_seconds
    ? { title: g.title, distanceMi: g.distance_mi, paceSeconds: pace, targetSeconds: g.target_seconds }
    : null;
}

/** Today's zones from the athlete's runs and goals. Falls back to the fixed table on any error. */
export async function loadPaceZones(goals?: Goal[]): Promise<PaceZones> {
  try {
    const today = startOfLocalDay(new Date());
    const [{ data, error }, gs] = await Promise.all([
      supabaseAdmin()
        .from("runs")
        .select("logged_at, run_type, distance_miles, pace_seconds_per_mile, avg_hr, max_hr")
        .gte("logged_at", shiftDays(today, -366).toISOString()),
      goals ? Promise.resolve(goals) : loadGoals(),
    ]);
    if (error) return DEFAULT_PACE_ZONES;
    return computePaceZones({ runs: toZoneRuns(data ?? []), today: localDateKey(today), goal: zoneGoalFor(gs, today) });
  } catch {
    return DEFAULT_PACE_ZONES;
  }
}
