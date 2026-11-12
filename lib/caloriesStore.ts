import { supabaseAdmin } from "@/lib/supabase-admin";
import { localDateKey, shiftDays, startOfWeekSunday } from "@/lib/format";
import { plannedFor } from "@/lib/runReview";
import { loadGoals } from "@/lib/goalsStore";
import { blockForWeek } from "@/lib/goals";
import { BODYWEIGHT_LB } from "@/lib/marathonPlan";
import { weightSummary } from "@/lib/weight";
import { LIFT_CAL, calorieTarget, observedBaseline, runCalories, type CalorieTarget } from "@/lib/calories";

export const DEFAULT_GOAL_LB = 155;

export interface CalorieDay {
  day: string;
  goalLb: number;
  trendLb: number;
  consumed: number;
  target: CalorieTarget;
}

export async function loadBodyGoal(): Promise<number> {
  const { data } = await supabaseAdmin().from("sync_state").select("value").eq("key", "body_goal").maybeSingle();
  const v = Number((data?.value as { goal_lb?: unknown } | null)?.goal_lb);
  return Number.isFinite(v) && v > 60 ? v : DEFAULT_GOAL_LB;
}

export async function saveBodyGoal(goalLb: number) {
  await supabaseAdmin().from("sync_state").upsert({ key: "body_goal", value: { goal_lb: goalLb }, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** A day's calorie target and what's been eaten, from the logs, the plan, the goals and the weigh-ins. */
export async function loadCalorieDay(day: string): Promise<CalorieDay> {
  const db = supabaseAdmin();
  const mid = new Date(`${day}T12:00:00Z`);
  const from28 = shiftDays(mid, -29).toISOString();
  const to = shiftDays(mid, 1).toISOString();
  const [meals, runs, workouts, weighIns, goalLb, planned, goals] = await Promise.all([
    db.from("meals").select("logged_at, calories").gte("logged_at", from28).lt("logged_at", to),
    db.from("runs").select("logged_at, distance_miles, calories, run_type").gte("logged_at", from28).lt("logged_at", to),
    db.from("workouts").select("logged_at, calories_burned_est").gte("logged_at", from28).lt("logged_at", to),
    db.from("weigh_ins").select("date, weight_lb, note").order("date"),
    loadBodyGoal(),
    plannedFor(day).catch(() => null),
    loadGoals(),
  ]);

  const key = (iso: string) => localDateKey(new Date(iso));
  const lbRows = (weighIns.data ?? []).map((w) => ({ date: String(w.date).slice(0, 10), weight_lb: Number(w.weight_lb), note: w.note ?? null }));
  const summary = weightSummary(lbRows);
  const bodyweight = summary.latest?.weight_lb ?? BODYWEIGHT_LB;
  const trendLb = summary.latest?.trend ?? bodyweight;

  // Training calories per day: Garmin's or the log's own figure, else estimated.
  const trainingByDay = new Map<string, number>();
  const add = (k: string, c: number) => trainingByDay.set(k, (trainingByDay.get(k) ?? 0) + c);
  for (const r of runs.data ?? []) add(key(r.logged_at), r.calories ?? runCalories(Number(r.distance_miles) || 0, bodyweight));
  for (const w of workouts.data ?? []) add(key(w.logged_at), w.calories_burned_est ?? LIFT_CAL);

  const runsToday = (runs.data ?? []).filter((r) => key(r.logged_at) === day);
  const liftsToday = (workouts.data ?? []).filter((w) => key(w.logged_at) === day);
  let trainingCal = trainingByDay.get(day) ?? 0;
  // Not done yet: count what the plan has, so the morning's target already includes it.
  if (!runsToday.length && planned?.run?.miles) trainingCal += runCalories(planned.run.miles, bodyweight);
  if (!liftsToday.length && planned?.session && (planned.session.kind === "lift" || planned.session.kind === "lift_and_run")) trainingCal += LIFT_CAL;
  const isLongRunDay = planned?.run?.type === "Long" || runsToday.some((r) => r.run_type === "Long");

  const block = blockForWeek(goals, localDateKey(startOfWeekSunday(mid)), day);
  const raceSeason = block.kind === "recovery" || (block.kind === "race" && (block.race?.daysToRace ?? 99) <= 42);

  // What the log says about maintenance, over the 28 days before today.
  const intakeByDay = new Map<string, number>();
  for (const m of meals.data ?? []) intakeByDay.set(key(m.logged_at), (intakeByDay.get(key(m.logged_at)) ?? 0) + (m.calories ?? 0));
  const windowDays = Array.from({ length: 28 }, (_, i) => localDateKey(shiftDays(mid, -28 + i)));
  const intake = windowDays.filter((d) => intakeByDay.has(d)).map((d) => ({ day: d, cal: intakeByDay.get(d)! }));
  const avgTrainingCal = windowDays.reduce((s, d) => s + (trainingByDay.get(d) ?? 0), 0) / windowDays.length;
  const observed = observedBaseline({
    weighIns: lbRows.filter((w) => w.date >= windowDays[0] && w.date <= day),
    intake,
    avgTrainingCal,
    windowDays: 28,
  });

  return {
    day,
    goalLb,
    trendLb: Math.round(trendLb * 10) / 10,
    consumed: Math.round(intakeByDay.get(day) ?? 0),
    target: calorieTarget({ bodyweightLb: bodyweight, trendLb, goalLb, trainingCal, isLongRunDay, raceSeason, observed }),
  };
}
