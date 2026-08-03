import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { summarizeTraining } from "@/lib/anthropic";
import { formatPace, localDateKey, startOfLocalDay } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const range = req.nextUrl.searchParams.get("range") === "month" ? "month" : "7day";
    const totalDaysInRange = range === "month" ? 30 : 7;
    const rangeLabel = range === "month" ? "the last 30 days" : "the last 7 days";

    const start = startOfLocalDay(new Date());
    start.setDate(start.getDate() - (totalDaysInRange - 1));

    const db = supabaseAdmin();
    const [workoutsRes, runsRes, mealsRes] = await Promise.all([
      db
        .from("workouts")
        .select("logged_at, type, muscle_groups, duration_minutes")
        .gte("logged_at", start.toISOString())
        .order("logged_at", { ascending: false }),
      db
        .from("runs")
        .select("logged_at, run_type, distance_miles, pace_seconds_per_mile, feel")
        .gte("logged_at", start.toISOString())
        .order("logged_at", { ascending: false }),
      db
        .from("meals")
        .select("logged_at, meal_type, calories, protein_g")
        .gte("logged_at", start.toISOString())
        .order("logged_at", { ascending: false }),
    ]);

    const err = workoutsRes.error || runsRes.error || mealsRes.error;
    if (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const workouts = workoutsRes.data ?? [];
    const runs = runsRes.data ?? [];
    const meals = mealsRes.data ?? [];

    const workoutsSummary = workouts
      .map((w) => {
        const date = new Date(w.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const groups = (w.muscle_groups ?? []).join("/") || w.type || "workout";
        return `${date} — ${groups}${w.duration_minutes ? ` (${w.duration_minutes} min)` : ""}`;
      })
      .join("\n");

    const runsSummary = runs
      .map((r) => {
        const date = new Date(r.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const bits = [r.run_type ?? "Run"];
        if (r.distance_miles != null) bits.push(`${r.distance_miles}mi`);
        if (r.pace_seconds_per_mile != null) bits.push(formatPace(r.pace_seconds_per_mile));
        if (r.feel) bits.push(`felt ${r.feel}`);
        return `${date} — ${bits.join(" ")}`;
      })
      .join("\n");

    const mealsSummary = meals
      .map((m) => {
        const date = new Date(m.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `${date} — ${m.meal_type ?? "meal"}${m.calories ? `, ${m.calories} cal` : ""}`;
      })
      .join("\n");

    const daysWithMealsLogged = new Set(meals.map((m) => localDateKey(new Date(m.logged_at)))).size;

    const result = await summarizeTraining({
      rangeLabel,
      workoutsSummary,
      runsSummary,
      mealsSummary,
      totalDaysInRange,
      daysWithMealsLogged,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
