import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { startOfLocalDay } from "@/lib/format";
import { MUSCLE_LABELS, MUSCLE_REGIONS } from "@/lib/muscles";
import { buildExerciseLookup, computeMuscleActivity } from "@/lib/muscleCoverage";

export const runtime = "nodejs";

/**
 * Weighted sets in the window that count as a fully worked region, and the
 * run mileage that does the same for legs. Thresholds live here rather than
 * in the resolver so the body map can be tuned without touching the data.
 */
const FULL_SETS = 12;
const FULL_RUN_MILES = 20;

export async function GET(req: NextRequest) {
  try {
    const windowParam = req.nextUrl.searchParams.get("window");
    const allTime = windowParam === "all";
    const days = allTime ? 3650 : 7;

    const today = startOfLocalDay(new Date());
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));

    const db = supabaseAdmin();
    const [workoutsRes, runsRes, lookupRes] = await Promise.all([
      db.from("workouts").select("logged_at, exercises, muscle_groups").gte("logged_at", start.toISOString()),
      db.from("runs").select("logged_at, distance_miles").gte("logged_at", start.toISOString()),
      db.from("exercise_muscles").select("key, primary_muscles, secondary_muscles"),
    ]);

    const err = workoutsRes.error || runsRes.error || lookupRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const lookup = buildExerciseLookup(lookupRes.data ?? []);
    const activity = computeMuscleActivity(workoutsRes.data ?? [], runsRes.data ?? [], lookup, today);

    // All-time saturates almost everything, so scale the bar with the window.
    const setTarget = allTime ? FULL_SETS * 6 : FULL_SETS;
    const mileTarget = allTime ? FULL_RUN_MILES * 6 : FULL_RUN_MILES;

    const regions = MUSCLE_REGIONS.map((region) => {
      const a = activity[region];
      const liftScore = Math.min(1, (a.primarySets + a.secondarySets * 0.5) / setTarget);
      const runScore = Math.min(1, a.runMiles / mileTarget);
      return {
        region,
        label: MUSCLE_LABELS[region],
        daysSince: a.daysSince,
        primarySets: a.primarySets,
        secondarySets: a.secondarySets,
        sessions: a.sessions,
        runMiles: Math.round(a.runMiles * 10) / 10,
        intensity: Math.max(liftScore, runScore),
        /** Which kind of training is doing the loading here. */
        source: runScore > liftScore ? ("run" as const) : ("lift" as const),
      };
    });

    return NextResponse.json({ window: allTime ? "all" : "7d", regions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
