import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day; // shift so week starts Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfDay(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function GET() {
  const db = supabaseAdmin();
  const now = new Date();
  const weekStart = startOfWeek(now).toISOString();
  const dayStart = startOfDay(now).toISOString();

  const [workoutsRes, runsRes, mealsRes, allRunsRes] = await Promise.all([
    db.from("workouts").select("*").gte("logged_at", weekStart).order("logged_at", { ascending: false }),
    db.from("runs").select("*").gte("logged_at", weekStart).order("logged_at", { ascending: false }),
    db.from("meals").select("*").gte("logged_at", dayStart).order("logged_at", { ascending: false }),
    db.from("runs").select("distance_miles, logged_at").order("logged_at", { ascending: false }).limit(200),
  ]);

  if (workoutsRes.error || runsRes.error || mealsRes.error || allRunsRes.error) {
    const err = workoutsRes.error || runsRes.error || mealsRes.error || allRunsRes.error;
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }

  const weekWorkouts = workoutsRes.data ?? [];
  const weekRuns = runsRes.data ?? [];
  const todayMeals = mealsRes.data ?? [];

  const weekMileage = weekRuns.reduce((sum, r) => sum + (Number(r.distance_miles) || 0), 0);
  const weekRunSeconds = weekRuns.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0);

  const todayCalories = todayMeals.reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
  const todayProtein = todayMeals.reduce((sum, m) => sum + (Number(m.protein_g) || 0), 0);
  const todayCarbs = todayMeals.reduce((sum, m) => sum + (Number(m.carbs_g) || 0), 0);
  const todayFat = todayMeals.reduce((sum, m) => sum + (Number(m.fat_g) || 0), 0);

  // Last 8 weeks of mileage for a trend sparkline.
  const byWeek = new Map<string, number>();
  for (const r of allRunsRes.data ?? []) {
    const wk = startOfWeek(new Date(r.logged_at)).toISOString().slice(0, 10);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + (Number(r.distance_miles) || 0));
  }
  const weeklyMileageTrend = Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([week, miles]) => ({ week, miles: Math.round(miles * 10) / 10 }));

  return NextResponse.json({
    week: {
      workoutCount: weekWorkouts.length,
      runCount: weekRuns.length,
      mileage: Math.round(weekMileage * 10) / 10,
      runSeconds: weekRunSeconds,
    },
    today: {
      calories: Math.round(todayCalories),
      protein_g: Math.round(todayProtein),
      carbs_g: Math.round(todayCarbs),
      fat_g: Math.round(todayFat),
      mealCount: todayMeals.length,
    },
    recentWorkouts: weekWorkouts.slice(0, 3),
    recentRuns: weekRuns.slice(0, 3),
    weeklyMileageTrend,
  });
}
