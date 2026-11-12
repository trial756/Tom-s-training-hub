import { supabaseAdmin } from "@/lib/supabase-admin";
import { APP_TIMEZONE, localDateKey, shiftDays } from "@/lib/format";
import { plannedFor } from "@/lib/runReview";
import { BODYWEIGHT_LB } from "@/lib/marathonPlan";
import { correctionLines, foodLines, type Food, type MealCorrection } from "@/lib/foods";
import { loadCalorieDay } from "@/lib/caloriesStore";
import type { MealItem } from "@/lib/types";

const hourOf = (iso: string) => Number(new Date(iso).toLocaleString("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", hour12: false }));

/** Average calories eaten after `hour` on previous logged days — what the rest of today probably holds. */
function laterEating(meals: MealRow[], hour: number): { avg: number; days: number } | null {
  const byDay = new Map<string, number>();
  const daysSeen = new Set<string>();
  for (const m of meals) {
    const k = localDateKey(new Date(m.logged_at));
    daysSeen.add(k);
    if (hourOf(m.logged_at) >= hour) byDay.set(k, (byDay.get(k) ?? 0) + num(m.calories));
  }
  const days = Array.from(daysSeen).sort().slice(-14);
  if (days.length < 3) return null;
  return { avg: Math.round(days.reduce((s, d) => s + (byDay.get(d) ?? 0), 0) / days.length), days: days.length };
}

/** Swap material from his own log: lean high-protein items, and the heavy ones he eats often. */
function leanOptions(meals: { items: MealItem[] | null }[], foods: Food[]): { lean: string[]; heavy: string[] } {
  const seen = new Map<string, { name: string; cal: number; p: number; n: number }>();
  const addItem = (name: string, cal: number | null, p: number | null) => {
    if (!name || !cal || cal <= 0) return;
    const k = name.toLowerCase().replace(/\(.*?\)/g, "").trim();
    const cur = seen.get(k);
    if (cur) cur.n++;
    else seen.set(k, { name, cal: Math.round(cal), p: Math.round(p ?? 0), n: 1 });
  };
  for (const m of meals) for (const i of m.items ?? []) addItem(i.name, i.calories_est, i.protein_g);
  for (const f of foods) addItem(f.name, f.calories, f.protein_g);
  const all = Array.from(seen.values());
  const lean = all
    .filter((x) => x.p >= 20)
    .sort((a, b) => b.p / b.cal - a.p / a.cal)
    .slice(0, 6)
    .map((x) => `- ${x.name}: ${x.cal} cal, ${x.p} g protein`);
  const heavy = all
    .filter((x) => x.cal >= 500)
    .sort((a, b) => b.n - a.n || b.cal - a.cal)
    .slice(0, 4)
    .map((x) => `- ${x.name}: ${x.cal} cal${x.n > 1 ? ` (logged ${x.n}×)` : ""}`);
  return { lean, heavy };
}

// ── The day around a meal ─────────────────────────────────────────────
//
// Meal feedback used to see one meal in isolation, so a breakfast eaten in
// two parts got "add some Greek yogurt" an hour after the yogurt. The parser
// now gets the day as a whole: what was already eaten (and the running
// totals), the day's training (done and planned, plus tomorrow's when it's
// evening), bodyweight with a protein range, and the last week's logged
// averages — flagged as logging coverage, not intake.

type MealRow = { logged_at: string; meal_type: string | null; summary: string | null; raw_text: string; calories: number | null; protein_g: number | string | null; carbs_g: number | string | null; fat_g: number | string | null };

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", minute: "2-digit" });

export async function buildMealDayContext(loggedAt: string): Promise<string> {
  try {
    const db = supabaseAdmin();
    const at = new Date(loggedAt);
    const dayKey = localDateKey(at);
    const from = shiftDays(at, -8).toISOString();
    const to = shiftDays(at, 2).toISOString();
    const [meals, runs, workouts, weight, planned, plannedTomorrow, foods, corrections, water, calories, month] = await Promise.all([
      db.from("meals").select("logged_at, meal_type, summary, raw_text, calories, protein_g, carbs_g, fat_g").gte("logged_at", from).lt("logged_at", to).order("logged_at"),
      db.from("runs").select("logged_at, run_type, distance_miles, summary").gte("logged_at", shiftDays(at, -1).toISOString()).lt("logged_at", to),
      db.from("workouts").select("logged_at, summary").gte("logged_at", shiftDays(at, -1).toISOString()).lt("logged_at", to),
      db.from("weigh_ins").select("weight_lb").order("date", { ascending: false }).limit(1).maybeSingle(),
      plannedFor(dayKey).catch(() => null),
      plannedFor(localDateKey(shiftDays(at, 1))).catch(() => null),
      db.from("foods").select("*").order("updated_at", { ascending: false }).limit(80),
      db.from("meal_corrections").select("before, after, created_at").order("created_at", { ascending: false }).limit(8),
      db.from("water_logs").select("logged_at, oz").gte("logged_at", shiftDays(at, -1).toISOString()).lte("logged_at", at.toISOString()),
      loadCalorieDay(dayKey).catch(() => null),
      db.from("meals").select("logged_at, items").gte("logged_at", shiftDays(at, -30).toISOString()).lt("logged_at", at.toISOString()),
    ]);

    const all = (meals.data ?? []) as MealRow[];
    const sameDay = (iso: string) => localDateKey(new Date(iso)) === dayKey;
    const earlier = all.filter((m) => sameDay(m.logged_at) && new Date(m.logged_at) <= at);
    const lines: string[] = [];
    lines.push(`This meal was eaten at ${time(loggedAt)}.`);

    if (earlier.length) {
      lines.push(`Already eaten today, before this meal:`);
      for (const m of earlier) {
        lines.push(`- ${time(m.logged_at)} ${m.meal_type ?? "meal"}: ${m.summary ?? m.raw_text} — ${num(m.calories)} cal, ${num(m.protein_g)} g protein`);
      }
      const t = earlier.reduce((s, m) => ({ cal: s.cal + num(m.calories), p: s.p + num(m.protein_g), c: s.c + num(m.carbs_g), f: s.f + num(m.fat_g) }), { cal: 0, p: 0, c: 0, f: 0 });
      lines.push(`Running total before this meal: ${Math.round(t.cal)} cal, ${Math.round(t.p)} g protein, ${Math.round(t.c)} g carbs, ${Math.round(t.f)} g fat.`);
    } else {
      lines.push("Nothing else logged yet today.");
    }

    const runsToday = (runs.data ?? []).filter((r) => sameDay(r.logged_at));
    const liftsToday = (workouts.data ?? []).filter((w) => sameDay(w.logged_at));
    const done = [
      ...runsToday.map((r) => `${r.run_type ?? "run"} ${r.distance_miles ?? ""} mi at ${time(r.logged_at)}`.replace("  ", " ")),
      ...liftsToday.map((w) => `${w.summary ?? "lift"} at ${time(w.logged_at)}`),
    ];
    lines.push(`Training logged today: ${done.length ? done.join("; ") : "none yet"}.`);
    if (planned) lines.push(`Today's plan: ${planned.title}${planned.run ? ` (${planned.run.type}${planned.run.miles ? `, ${planned.run.miles} mi` : ""})` : ""}.`);
    const hour = Number(new Date(loggedAt).toLocaleString("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", hour12: false }));
    if (plannedTomorrow && hour >= 15) {
      lines.push(`Tomorrow's plan: ${plannedTomorrow.title}${plannedTomorrow.run ? ` (${plannedTomorrow.run.type}${plannedTomorrow.run.miles ? `, ${plannedTomorrow.run.miles} mi` : ""})` : ""}.`);
    }

    const waterOz = (water.data ?? []).filter((w) => sameDay(w.logged_at)).reduce((s, w) => s + Number(w.oz), 0);
    lines.push(`Water logged today so far: ${Math.round(waterOz)} oz (logging may be incomplete).`);

    const lb = weight.data?.weight_lb != null ? Number(weight.data.weight_lb) : BODYWEIGHT_LB;
    const kg = lb / 2.2046;
    lines.push(`Bodyweight ${lb} lb. A day's protein for someone running and lifting: about ${Math.round(kg * 1.6)}–${Math.round(kg * 2.2)} g, spread over the day.`);

    // Previous 7 days, logged days only.
    const prev = new Map<string, { cal: number; p: number }>();
    for (const m of all) {
      const k = localDateKey(new Date(m.logged_at));
      if (k >= dayKey) continue;
      const d = prev.get(k) ?? { cal: 0, p: 0 };
      prev.set(k, { cal: d.cal + num(m.calories), p: d.p + num(m.protein_g) });
    }
    const days = Array.from(prev.values()).slice(-7);
    if (days.length) {
      const avg = (f: (d: { cal: number; p: number }) => number) => Math.round(days.reduce((s, d) => s + f(d), 0) / days.length);
      lines.push(
        `Last 7 days: meals logged on ${days.length} of 7 days (gaps are logging habits, not missed meals); on logged days about ${avg((d) => d.cal)} cal and ${avg((d) => d.p)} g protein.`
      );
    }

    // The calorie target, and what the rest of the day usually adds.
    if (calories) {
      const t = calories.target;
      const eatenBefore = Math.round(
        earlier.reduce((s, m) => s + num(m.calories), 0)
      );
      lines.push(
        "",
        `Calorie target today: ${t.target} (${t.mode}: ${t.reason} Maintenance ${t.maintenance} = baseline ${t.baseline}` +
          `${t.baselineSource === "estimate" ? " (estimated from bodyweight; refined as weigh-ins and logged days build up)" : " (measured from his log and weigh-ins)"}` +
          ` + training ${t.training}; adjustment ${t.adjustment >= 0 ? "+" : ""}${t.adjustment}).`,
        `Goal: about ${calories.goalLb} lb while adding muscle; weight trend now ${calories.trendLb} lb.`,
        `Eaten before this meal: ${eatenBefore} cal — ${t.target - eatenBefore} left before this meal is counted.`
      );
      const hourNow = hourOf(loggedAt);
      const later = laterEating(all.filter((m) => localDateKey(new Date(m.logged_at)) < dayKey), hourNow);
      if (later) lines.push(`On his logged days, he usually eats about ${later.avg} more cal after this time of day (${later.days} days).`);
    }
    const options = leanOptions((month.data ?? []) as { items: MealItem[] | null }[], (foods.data ?? []) as Food[]);
    if (options.lean.length) lines.push("", "Lean, high-protein things he has eaten (for swaps):", ...options.lean);
    if (options.heavy.length) lines.push("Heavy regulars in his log:", ...options.heavy);

    // What Tom has taught it: his foods, and the mistakes it made before.
    const library = foodLines((foods.data ?? []) as Food[]);
    if (library.length) {
      lines.push("", "Tom's food library — his corrected numbers for foods he eats, in the amount he eats them:", ...library);
    }
    const fixes = correctionLines((corrections.data ?? []) as MealCorrection[]);
    if (fixes.length) lines.push("", "Past corrections (what was logged → what it really was):", ...fixes);
    return lines.join("\n");
  } catch {
    return "";
  }
}
