import { supabaseAdmin } from "@/lib/supabase-admin";
import { APP_TIMEZONE, localDateKey, shiftDays } from "@/lib/format";
import { plannedFor } from "@/lib/runReview";
import { BODYWEIGHT_LB } from "@/lib/marathonPlan";
import { correctionLines, foodLines, type Food, type MealCorrection } from "@/lib/foods";

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
    const [meals, runs, workouts, weight, planned, plannedTomorrow, foods, corrections] = await Promise.all([
      db.from("meals").select("logged_at, meal_type, summary, raw_text, calories, protein_g, carbs_g, fat_g").gte("logged_at", from).lt("logged_at", to).order("logged_at"),
      db.from("runs").select("logged_at, run_type, distance_miles, summary").gte("logged_at", shiftDays(at, -1).toISOString()).lt("logged_at", to),
      db.from("workouts").select("logged_at, summary").gte("logged_at", shiftDays(at, -1).toISOString()).lt("logged_at", to),
      db.from("weigh_ins").select("weight_lb").order("date", { ascending: false }).limit(1).maybeSingle(),
      plannedFor(dayKey).catch(() => null),
      plannedFor(localDateKey(shiftDays(at, 1))).catch(() => null),
      db.from("foods").select("*").order("updated_at", { ascending: false }).limit(80),
      db.from("meal_corrections").select("before, after, created_at").order("created_at", { ascending: false }).limit(8),
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
