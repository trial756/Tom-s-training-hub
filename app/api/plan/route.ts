import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateWeekPlan, type GeneratedSession } from "@/lib/anthropic";
import { localDateKey, normalizeExerciseName, startOfLocalDay, startOfWeekSunday } from "@/lib/format";
import { cleanRegions } from "@/lib/muscles";
import { buildExerciseLookup } from "@/lib/muscleCoverage";
import { buildPlannerContext } from "@/lib/planner/context";
import { scheduleWeek, type DayLog } from "@/lib/planner/schedule";
import { reconcileMileage } from "@/lib/planner/mileage";
import type { PlanSession, WeekPlan } from "@/lib/planner/types";

export const runtime = "nodejs";

/** How far back the planner looks when building its picture. */
const HISTORY_DAYS = 60;

function weekDatesFrom(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + i);
    return localDateKey(d);
  });
}

function toSessions(generated: GeneratedSession[]): PlanSession[] {
  return generated.map((s, i) => ({
    id: `s${i + 1}`,
    kind: s.kind,
    title: s.title,
    rationale: s.rationale,
    regions: cleanRegions(s.regions),
    priority: Number.isFinite(s.priority) ? s.priority : 50,
    preferredDow: s.preferred_dow != null && s.preferred_dow >= 0 && s.preferred_dow <= 6 ? s.preferred_dow : null,
    taxesLegs: !!s.taxes_legs,
    miles: typeof s.miles === "number" && s.miles > 0 ? s.miles : null,
    exercises: (s.exercises ?? []).map((e) => ({
      name: e.name,
      sets: Number(e.sets) || 3,
      reps: e.reps ?? "",
      target: e.target ?? null,
      cue: e.cue ?? null,
      isNew: !!e.is_new,
      regions: cleanRegions(e.regions),
    })),
  }));
}

export async function GET(req: NextRequest) {
  return handle(req, req.nextUrl.searchParams.get("regenerate") === "1");
}

/** Forces a fresh generation for the current week. */
export async function POST(req: NextRequest) {
  return handle(req, true);
}

async function handle(_req: NextRequest, forceRegenerate: boolean) {
  try {
    const db = supabaseAdmin();
    const today = startOfLocalDay(new Date());
    const todayKey = localDateKey(today);
    const weekStart = localDateKey(startOfWeekSunday(today));
    const weekDates = weekDatesFrom(weekStart);
    const weekEnd = weekDates[6];

    const historyStart = new Date(today);
    historyStart.setDate(historyStart.getDate() - HISTORY_DAYS);

    const [workoutsRes, runsRes, lookupRes, storedRes] = await Promise.all([
      db
        .from("workouts")
        .select("logged_at, exercises, muscle_groups, summary")
        .gte("logged_at", historyStart.toISOString())
        .order("logged_at", { ascending: false }),
      db
        .from("runs")
        .select("logged_at, distance_miles, run_type, summary")
        .gte("logged_at", historyStart.toISOString())
        .order("logged_at", { ascending: false }),
      db.from("exercise_muscles").select("key, primary_muscles, secondary_muscles"),
      db.from("week_plans").select("*").eq("week_start", weekStart).maybeSingle(),
    ]);

    const err = workoutsRes.error || runsRes.error || lookupRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const workouts = workoutsRes.data ?? [];
    const runs = runsRes.data ?? [];
    const lookup = buildExerciseLookup(lookupRes.data ?? []);

    const context = buildPlannerContext({
      workouts,
      runs,
      exerciseMuscles: lookupRes.data ?? [],
      today,
    });

    // ── The week's sessions: stored, or generated once ──────────────────
    let stored = storedRes.data as
      | { sessions: PlanSession[]; assignments: Record<string, string>; headline: string | null }
      | null;

    if (!stored || forceRegenerate) {
      const generated = await generateWeekPlan(JSON.stringify(context, null, 2));
      const sessions = toSessions(generated.sessions ?? []);
      const row = {
        week_start: weekStart,
        plan_week: context.marathon?.planWeek ?? null,
        phase: context.marathon?.phase ?? null,
        headline: generated.headline,
        sessions,
        assignments: {},
        context,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error: upsertError } = await db.from("week_plans").upsert(row, { onConflict: "week_start" });
      if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
      stored = { sessions, assignments: {}, headline: generated.headline };
    }

    // ── What actually happened, per day ─────────────────────────────────
    const logs: Record<string, DayLog> = {};
    for (const date of weekDates) logs[date] = { hasWorkout: false, hasRun: false, summary: "", regions: [] };

    for (const workout of workouts) {
      const date = localDateKey(new Date(workout.logged_at));
      if (!logs[date]) continue;
      const regions = new Set(logs[date].regions);
      for (const exercise of (workout.exercises ?? []) as { name?: string }[]) {
        const entry = lookup.get(normalizeExerciseName(exercise?.name ?? ""));
        for (const r of entry?.primary ?? []) regions.add(r);
      }
      logs[date] = {
        hasWorkout: true,
        hasRun: logs[date].hasRun,
        summary: [logs[date].summary, workout.summary || (workout.muscle_groups ?? []).join(", ")].filter(Boolean).join(" · "),
        regions: Array.from(regions),
      };
    }

    for (const run of runs) {
      const date = localDateKey(new Date(run.logged_at));
      if (!logs[date]) continue;
      const label = run.summary || `${run.run_type ?? "Run"}${run.distance_miles ? ` ${run.distance_miles}mi` : ""}`;
      logs[date] = {
        ...logs[date],
        hasRun: true,
        summary: [logs[date].summary, label].filter(Boolean).join(" · "),
      };
    }

    // ── Place sessions, then persist the placement so it stays stable ───
    const initialSessions = [...(stored.sessions ?? [])];
    const scheduled = scheduleWeek({
      sessions: initialSessions,
      weekDates,
      today: todayKey,
      logs,
      priorAssignments: stored.assignments ?? {},
    });

    // Falling behind shouldn't just reshuffle — the miles have to reappear.
    const reconciled = reconcileMileage({
      sessions: initialSessions,
      days: scheduled,
      today: todayKey,
      milesThisWeek: context.milesThisWeek,
      weeklyTarget: context.marathon?.weeklyMileage ?? null,
      avgWeeklyMiles: context.avgWeeklyMiles,
      typicalRunMiles: context.typicalRunMiles,
    });
    const sessions = reconciled.sessions;
    const days = reconciled.days;

    const assignments: Record<string, string> = {};
    for (const day of days) {
      if (day.sessionId && (day.status === "done" || day.status === "today" || day.status === "upcoming")) {
        assignments[day.sessionId] = day.date;
      }
    }

    await db
      .from("week_plans")
      .update({ sessions, assignments, updated_at: new Date().toISOString() })
      .eq("week_start", weekStart);

    const plan: WeekPlan = {
      weekStart,
      weekEnd,
      planWeek: context.marathon?.planWeek ?? null,
      phase: context.marathon?.phase ?? null,
      headline: stored.headline ?? "",
      sessions,
      days,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ plan, context, mileage: { gap: reconciled.gap, added: reconciled.added, residual: reconciled.residual, note: reconciled.note } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
