import { supabaseAdmin } from "@/lib/supabase-admin";
import { localDateKey, shiftDays } from "@/lib/format";
import { plannedFor } from "@/lib/runReview";
import { BODYWEIGHT_LB } from "@/lib/marathonPlan";
import { waterTarget, type WaterTarget } from "@/lib/water";

export interface WaterDay {
  day: string;
  totalOz: number;
  target: WaterTarget;
  entries: { id: string; logged_at: string; oz: number }[];
}

/** One day's water: what was drunk, and the target from bodyweight, training and heat. */
export async function loadWaterDay(day: string): Promise<WaterDay> {
  const db = supabaseAdmin();
  const mid = new Date(`${day}T12:00:00Z`);
  const from = shiftDays(mid, -1).toISOString();
  const to = shiftDays(mid, 1).toISOString();
  const [water, runs, workouts, weight, planned] = await Promise.all([
    db.from("water_logs").select("id, logged_at, oz").gte("logged_at", from).lt("logged_at", to).order("logged_at"),
    db.from("runs").select("logged_at, duration_seconds, temp_f").gte("logged_at", from).lt("logged_at", to),
    db.from("workouts").select("logged_at").gte("logged_at", from).lt("logged_at", to),
    db.from("weigh_ins").select("weight_lb").order("date", { ascending: false }).limit(1).maybeSingle(),
    plannedFor(day).catch(() => null),
  ]);
  const sameDay = (iso: string) => localDateKey(new Date(iso)) === day;
  const entries = (water.data ?? []).filter((w) => sameDay(w.logged_at)).map((w) => ({ id: w.id, logged_at: w.logged_at, oz: Number(w.oz) }));
  const runsToday = (runs.data ?? []).filter((r) => sameDay(r.logged_at));
  const loggedMinutes = runsToday.reduce((s, r) => s + (r.duration_seconds ?? 0) / 60, 0);
  // Not run yet: count the plan's run at about 10 min/mi, so the target is right from the morning.
  const plannedMinutes = planned?.run?.miles ? planned.run.miles * 10 : 0;
  const temps = runsToday.map((r) => r.temp_f).filter((t): t is number => t != null);
  const target = waterTarget({
    bodyweightLb: weight.data?.weight_lb != null ? Number(weight.data.weight_lb) : BODYWEIGHT_LB,
    runMinutes: Math.max(loggedMinutes, plannedMinutes),
    liftSessions: (workouts.data ?? []).filter((w) => sameDay(w.logged_at)).length,
    maxTempF: temps.length ? Math.max(...temps) : null,
  });
  return { day, totalOz: entries.reduce((s, e) => s + e.oz, 0), target, entries };
}

/** Daily totals for the last `days` days, oldest first, for the Progress trend. */
export async function loadWaterHistory(today: string, days = 14): Promise<{ day: string; oz: number }[]> {
  const mid = new Date(`${today}T12:00:00Z`);
  const { data } = await supabaseAdmin()
    .from("water_logs")
    .select("logged_at, oz")
    .gte("logged_at", shiftDays(mid, -days).toISOString());
  const byDay = new Map<string, number>();
  for (const w of data ?? []) {
    const k = localDateKey(new Date(w.logged_at));
    byDay.set(k, (byDay.get(k) ?? 0) + Number(w.oz));
  }
  return Array.from({ length: days }, (_, i) => {
    const k = localDateKey(shiftDays(mid, i - days + 1));
    return { day: k, oz: byDay.get(k) ?? 0 };
  });
}
