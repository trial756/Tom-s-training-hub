import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { localDateKey, normalizeExerciseName, startOfLocalDay, startOfWeekSunday } from "@/lib/format";

export const runtime = "nodejs";

// Weekly series always cover a fixed window regardless of the Stats range
// toggle — a trend needs more history than 7 days to mean anything. The
// per-day fuel series follows the toggle instead.
const TREND_WEEKS = 12;
const MAX_LIFTS = 3;

interface SetLike {
  reps: number | null;
  weight: number | null;
}
interface ExerciseLike {
  name: string;
  sets: SetLike[];
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

export async function GET(req: NextRequest) {
  try {
    const range = req.nextUrl.searchParams.get("range") === "month" ? "month" : "7day";
    const fuelDays = range === "month" ? 30 : 7;

    const today = startOfLocalDay(new Date());
    const weekStart = startOfWeekSunday(today);
    const trendStart = new Date(weekStart);
    trendStart.setDate(trendStart.getDate() - (TREND_WEEKS - 1) * 7);

    const fuelStart = new Date(today);
    fuelStart.setDate(fuelStart.getDate() - (fuelDays - 1));

    const db = supabaseAdmin();
    const [runsRes, workoutsRes, mealsRes] = await Promise.all([
      db.from("runs").select("logged_at, distance_miles, pace_seconds_per_mile, run_type, calories").gte("logged_at", trendStart.toISOString()),
      db.from("workouts").select("logged_at, exercises, calories_burned_est").gte("logged_at", trendStart.toISOString()),
      db.from("meals").select("logged_at, calories, protein_g").gte("logged_at", fuelStart.toISOString()),
    ]);

    const err = runsRes.error || workoutsRes.error || mealsRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const runs = runsRes.data ?? [];
    const workouts = workoutsRes.data ?? [];
    const meals = mealsRes.data ?? [];

    // ── Weekly buckets (Sun–Sat), oldest first ──────────────────────────
    const weekKeys: string[] = [];
    const mileageByWeek = new Map<string, number>();
    const volumeByWeek = new Map<string, number>();
    const weekLabels = new Map<string, string>();
    for (let i = 0; i < TREND_WEEKS; i++) {
      const d = new Date(trendStart);
      d.setDate(d.getDate() + i * 7);
      const key = localDateKey(d);
      weekKeys.push(key);
      mileageByWeek.set(key, 0);
      volumeByWeek.set(key, 0);
      weekLabels.set(key, shortDate(d));
    }

    const weekKeyFor = (iso: string) => localDateKey(startOfWeekSunday(new Date(iso)));

    for (const r of runs) {
      const key = weekKeyFor(r.logged_at);
      if (mileageByWeek.has(key)) mileageByWeek.set(key, mileageByWeek.get(key)! + (Number(r.distance_miles) || 0));
    }

    for (const w of workouts) {
      const key = weekKeyFor(w.logged_at);
      if (!volumeByWeek.has(key)) continue;
      let volume = 0;
      for (const ex of (w.exercises ?? []) as ExerciseLike[]) {
        for (const set of ex.sets ?? []) {
          const reps = Number(set.reps) || 0;
          const weight = Number(set.weight) || 0;
          volume += reps * weight;
        }
      }
      volumeByWeek.set(key, volumeByWeek.get(key)! + volume);
    }

    const weeklyMileage = weekKeys.map((k) => ({
      week: k,
      label: weekLabels.get(k)!,
      miles: Math.round(mileageByWeek.get(k)! * 10) / 10,
    }));

    const weeklyVolume = weekKeys.map((k) => ({
      week: k,
      label: weekLabels.get(k)!,
      volume: Math.round(volumeByWeek.get(k)!),
    }));

    // ── Pace per run, as days since the window start ────────────────────
    const dayIndex = (iso: string) =>
      Math.round((startOfLocalDay(new Date(iso)).getTime() - trendStart.getTime()) / 86400000);

    const runPaces = runs
      .filter((r) => r.pace_seconds_per_mile != null && Number(r.pace_seconds_per_mile) > 0)
      .map((r) => ({
        dayIndex: dayIndex(r.logged_at),
        label: shortDate(new Date(r.logged_at)),
        pace_seconds_per_mile: Number(r.pace_seconds_per_mile),
        run_type: r.run_type ?? "Other",
        distance_miles: Number(r.distance_miles) || null,
      }))
      .sort((a, b) => a.dayIndex - b.dayIndex);

    // ── Per-day fuel over the selected range ────────────────────────────
    const fuelDayKeys: string[] = [];
    const consumed = new Map<string, number>();
    const burned = new Map<string, number>();
    const protein = new Map<string, number>();
    const fuelLabels = new Map<string, string>();
    for (let i = 0; i < fuelDays; i++) {
      const d = new Date(fuelStart);
      d.setDate(d.getDate() + i);
      const key = localDateKey(d);
      fuelDayKeys.push(key);
      consumed.set(key, 0);
      burned.set(key, 0);
      protein.set(key, 0);
      fuelLabels.set(key, shortDate(d));
    }

    for (const m of meals) {
      const key = localDateKey(new Date(m.logged_at));
      if (!consumed.has(key)) continue;
      consumed.set(key, consumed.get(key)! + (Number(m.calories) || 0));
      protein.set(key, protein.get(key)! + (Number(m.protein_g) || 0));
    }
    for (const r of runs) {
      const key = localDateKey(new Date(r.logged_at));
      if (burned.has(key)) burned.set(key, burned.get(key)! + (Number(r.calories) || 0));
    }
    for (const w of workouts) {
      const key = localDateKey(new Date(w.logged_at));
      if (burned.has(key)) burned.set(key, burned.get(key)! + (Number(w.calories_burned_est) || 0));
    }

    const dailyFuel = fuelDayKeys.map((k) => ({
      date: k,
      label: fuelLabels.get(k)!,
      consumed: Math.round(consumed.get(k)!),
      burned: Math.round(burned.get(k)!),
      protein_g: Math.round(protein.get(k)!),
    }));

    // ── Top-set progression for the most-logged lifts ───────────────────
    // Grouped on a normalized name so spelling drift doesn't split one lift
    // into several series; the most common original spelling is displayed.
    const lifts = new Map<
      string,
      { spellings: Map<string, number>; byDay: Map<string, { weight: number; iso: string }> }
    >();

    for (const w of workouts) {
      const dayKey = localDateKey(new Date(w.logged_at));
      for (const ex of (w.exercises ?? []) as ExerciseLike[]) {
        if (!ex?.name) continue;
        const topWeight = Math.max(0, ...(ex.sets ?? []).map((s) => Number(s.weight) || 0));
        if (topWeight <= 0) continue;
        const key = normalizeExerciseName(ex.name);
        if (!key) continue;
        if (!lifts.has(key)) lifts.set(key, { spellings: new Map(), byDay: new Map() });
        const lift = lifts.get(key)!;
        lift.spellings.set(ex.name, (lift.spellings.get(ex.name) ?? 0) + 1);
        const existing = lift.byDay.get(dayKey);
        if (!existing || topWeight > existing.weight) lift.byDay.set(dayKey, { weight: topWeight, iso: w.logged_at });
      }
    }

    const topLifts = Array.from(lifts.values())
      .filter((l) => l.byDay.size >= 2) // needs at least two sessions to show a trend
      .sort((a, b) => b.byDay.size - a.byDay.size)
      .slice(0, MAX_LIFTS)
      .map((l) => {
        const name = Array.from(l.spellings.entries()).sort((a, b) => b[1] - a[1])[0][0];
        const points = Array.from(l.byDay.entries())
          .map(([day, v]) => ({
            dayIndex: dayIndex(v.iso),
            label: shortDate(new Date(day + "T00:00:00")),
            weight: v.weight,
          }))
          .sort((a, b) => a.dayIndex - b.dayIndex);
        return { name, points };
      });

    return NextResponse.json({
      range,
      trendWeeks: TREND_WEEKS,
      weeklyMileage,
      weeklyVolume,
      runPaces,
      dailyFuel,
      topLifts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
