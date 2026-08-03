import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { localDateKey, startOfLocalDay } from "@/lib/format";

export const runtime = "nodejs";

interface ExerciseLike {
  name: string;
}

export async function GET(req: NextRequest) {
  try {
    const range = req.nextUrl.searchParams.get("range") === "month" ? "month" : "7day";
    const totalDays = range === "month" ? 30 : 7;

    const start = startOfLocalDay(new Date());
    start.setDate(start.getDate() - (totalDays - 1));

    const db = supabaseAdmin();
    const [workoutsRes, runsRes, mealsRes] = await Promise.all([
      db.from("workouts").select("*").gte("logged_at", start.toISOString()).order("logged_at", { ascending: false }),
      db.from("runs").select("*").gte("logged_at", start.toISOString()).order("logged_at", { ascending: false }),
      db.from("meals").select("*").gte("logged_at", start.toISOString()).order("logged_at", { ascending: false }),
    ]);

    const err = workoutsRes.error || runsRes.error || mealsRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const workouts = workoutsRes.data ?? [];
    const runs = runsRes.data ?? [];
    const meals = mealsRes.data ?? [];

    const workoutCaloriesBurned = workouts.reduce((sum, w) => sum + (Number(w.calories_burned_est) || 0), 0);
    const runCaloriesBurned = runs.reduce((sum, r) => sum + (Number(r.calories) || 0), 0);
    const caloriesBurned = Math.round(workoutCaloriesBurned + runCaloriesBurned);
    const caloriesConsumed = Math.round(meals.reduce((sum, m) => sum + (Number(m.calories) || 0), 0));
    const proteinG = Math.round(meals.reduce((sum, m) => sum + (Number(m.protein_g) || 0), 0));
    const netCalories = caloriesConsumed - caloriesBurned;

    const gymTimeMinutes = workouts.reduce((sum, w) => sum + (Number(w.duration_minutes) || 0), 0);
    const runsWithPace = runs.filter((r) => r.pace_seconds_per_mile != null);
    const avgPaceSecondsPerMile = runsWithPace.length
      ? Math.round(runsWithPace.reduce((sum, r) => sum + Number(r.pace_seconds_per_mile), 0) / runsWithPace.length)
      : null;

    const muscleGroupCounts = new Map<string, number>();
    for (const w of workouts) {
      for (const g of (w.muscle_groups ?? []) as string[]) {
        muscleGroupCounts.set(g, (muscleGroupCounts.get(g) ?? 0) + 1);
      }
    }
    const muscleGroups = Array.from(muscleGroupCounts.entries())
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count);

    // Every local day in range, oldest first, so days with no activity are
    // still represented (and easy to filter out client-side if desired).
    const dayBuckets = new Map<
      string,
      { date: string; label: string; workouts: string[]; runs: string[]; meals: string[] }
    >();
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = localDateKey(d);
      dayBuckets.set(key, {
        date: key,
        label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        workouts: [],
        runs: [],
        meals: [],
      });
    }
    for (const w of workouts) {
      const bucket = dayBuckets.get(localDateKey(new Date(w.logged_at)));
      if (bucket) {
        bucket.workouts.push(
          w.summary || ((w.exercises ?? []) as ExerciseLike[]).map((e) => e.name).join(", ") || "Workout"
        );
      }
    }
    for (const r of runs) {
      const bucket = dayBuckets.get(localDateKey(new Date(r.logged_at)));
      if (bucket) {
        bucket.runs.push(r.summary || `${r.run_type ?? "Run"}${r.distance_miles ? ` ${r.distance_miles}mi` : ""}`);
      }
    }
    for (const m of meals) {
      const bucket = dayBuckets.get(localDateKey(new Date(m.logged_at)));
      if (bucket) bucket.meals.push(m.summary || m.meal_type || "Meal");
    }
    const dailySummary = Array.from(dayBuckets.values()).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      range,
      stats: {
        workoutCount: workouts.length,
        runCount: runs.length,
        caloriesBurned,
        caloriesConsumed,
        proteinG,
        netCalories,
      },
      avgPaceSecondsPerMile,
      gymTimeMinutes,
      muscleGroups,
      dailySummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
