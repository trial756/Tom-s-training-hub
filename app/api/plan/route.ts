import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateWeekPlan, type GeneratedSession } from "@/lib/anthropic";
import { localDateKey, normalizeExerciseName, shiftDays, startOfLocalDay, startOfWeekSunday } from "@/lib/format";
import { cleanRegions } from "@/lib/muscles";
import { buildExerciseLookup } from "@/lib/muscleCoverage";
import { buildPlannerContext } from "@/lib/planner/context";
import { scheduleWeek, type DayLog } from "@/lib/planner/schedule";
import { fitWeekToTargets, reconcileMileage } from "@/lib/planner/mileage";
import type { PlanDay, PlanSession, PlanWeekMeta, WeekPlan } from "@/lib/planner/types";
import { buildMarathonPlan, currentWeek } from "@/lib/marathonPlan";
import { RUN_TYPES, type RunType } from "@/lib/types";

const marathonWeeks = buildMarathonPlan();

export const runtime = "nodejs";

/** How far back the planner looks when building its picture. */
const HISTORY_DAYS = 60;

function weekDatesFrom(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const [y, m, day] = weekStart.split("-").map(Number);
    return localDateKey(shiftDays(new Date(Date.UTC(y, m - 1, day, 12)), i));
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
    run:
      s.kind === "run" || s.kind === "lift_and_run"
        ? {
            type: s.run?.run_type && (RUN_TYPES as readonly string[]).includes(s.run.run_type) ? (s.run.run_type as RunType) : null,
            structure: s.run?.structure?.trim() || null,
          }
        : null,
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

/** Days either side of today in the strip — 11 days with today in the middle. */
const STRIP_RADIUS = 5;

/** A date key as an instant safely inside that day in the app zone. */
function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 18));
}

type StoredWeek = {
  week_start: string;
  sessions: PlanSession[];
  assignments: Record<string, string>;
  headline: string | null;
};

export async function GET(req: NextRequest) {
  return handle({ regenerate: req.nextUrl.searchParams.get("regenerate") === "1" ? "current" : null, ensure: null });
}

/**
 * `?week=YYYY-MM-DD` regenerates that week (current or future). With
 * `&ensure=1` it only generates when the week has no plan yet — how the
 * client fills in next week without ever paying for two AI calls in one
 * request. No `week` means the current week, as before.
 */
export async function POST(req: NextRequest) {
  const week = req.nextUrl.searchParams.get("week");
  const ensure = req.nextUrl.searchParams.get("ensure") === "1";
  const target = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : "current";
  return ensure ? handle({ regenerate: null, ensure: target }) : handle({ regenerate: target, ensure: null });
}

async function handle(opts: { regenerate: string | null; ensure: string | null }) {
  try {
    const db = supabaseAdmin();
    const today = startOfLocalDay(new Date());
    const todayKey = localDateKey(today);
    const weekStart = localDateKey(startOfWeekSunday(today));
    const weekDates = weekDatesFrom(weekStart);
    const weekEnd = weekDates[6];
    const resolve = (w: string | null) => (w === "current" ? weekStart : w);
    const regenerateWeek = resolve(opts.regenerate);
    const ensureWeek = resolve(opts.ensure);

    // The strip, and every training week it touches (two, or three midweek).
    const stripDates = Array.from({ length: STRIP_RADIUS * 2 + 1 }, (_, i) =>
      localDateKey(shiftDays(today, i - STRIP_RADIUS))
    );
    const stripWeeks = Array.from(new Set(stripDates.map((d) => localDateKey(startOfWeekSunday(keyToDate(d))))));

    const historyStart = shiftDays(today, -HISTORY_DAYS);

    const [workoutsRes, runsRes, lookupRes, storedRes] = await Promise.all([
      db
        .from("workouts")
        .select("logged_at, exercises, muscle_groups, summary")
        .gte("logged_at", historyStart.toISOString())
        .order("logged_at", { ascending: false }),
      db
        .from("runs")
        .select("logged_at, distance_miles, run_type, summary, feel")
        .gte("logged_at", historyStart.toISOString())
        .order("logged_at", { ascending: false }),
      db.from("exercise_muscles").select("key, primary_muscles, secondary_muscles"),
      db.from("week_plans").select("week_start, sessions, assignments, headline").in("week_start", stripWeeks),
    ]);

    const err = workoutsRes.error || runsRes.error || lookupRes.error || storedRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const workouts = workoutsRes.data ?? [];
    const runs = runsRes.data ?? [];
    const lookup = buildExerciseLookup(lookupRes.data ?? []);
    // Duplicate session ids (an old mileage-reconciler bug) are dropped on read.
    const uniqueSessions = (list: PlanSession[]) => {
      const seen = new Set<string>();
      return (list ?? []).filter((s) => !seen.has(s.id) && !!seen.add(s.id));
    };
    // A stored week holding only code-made sessions (catch-up runs, filler)
    // never got a real plan — a truncated AI response once saved exactly that.
    // Treat it as unplanned so it regenerates.
    const isPlanned = (row: StoredWeek | undefined) =>
      !!row?.sessions?.some((s) => !s.id.startsWith("add-") && !s.id.startsWith("fallback-"));
    const storedByWeek = new Map(
      ((storedRes.data ?? []) as StoredWeek[]).map((row) => [row.week_start, { ...row, sessions: uniqueSessions(row.sessions) }])
    );

    const contextFor = (week: string, plannedBeforeWeek?: Parameters<typeof buildPlannerContext>[0]["plannedBeforeWeek"]) =>
      buildPlannerContext({
        workouts,
        runs,
        exerciseMuscles: lookupRes.data ?? [],
        today,
        weekOf: week === weekStart ? undefined : keyToDate(week),
        plannedBeforeWeek,
      });

    async function generate(week: string, context: ReturnType<typeof buildPlannerContext>): Promise<StoredWeek> {
      const generated = await generateWeekPlan(JSON.stringify(context, null, 2));
      const { sessions } = fitWeekToTargets(toSessions(generated.sessions ?? []), {
        weeklyTarget: context.marathon?.weeklyMileage ?? null,
        longRunMiles: context.marathon?.longRunMiles ?? null,
        milesAlreadyRun: context.milesThisWeek,
      });
      const row = {
        week_start: week,
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
      if (upsertError) throw new Error(upsertError.message);
      const stored = { week_start: week, sessions, assignments: {}, headline: generated.headline };
      storedByWeek.set(week, stored);
      return stored;
    }

    /** Saves where each session landed, so placement stays stable between loads. */
    async function persistPlacement(week: string, sessions: PlanSession[], days: PlanDay[]) {
      const assignments: Record<string, string> = {};
      for (const day of days) {
        if (day.sessionId && (day.status === "done" || day.status === "today" || day.status === "upcoming")) {
          assignments[day.sessionId] = day.date;
        }
      }
      await db
        .from("week_plans")
        .update({ sessions, assignments, updated_at: new Date().toISOString() })
        .eq("week_start", week);
    }

    // ── What actually happened, per day (every day of every touched week) ──
    const logs: Record<string, DayLog> = {};
    for (const week of stripWeeks) {
      for (const date of weekDatesFrom(week)) logs[date] = { hasWorkout: false, hasRun: false, summary: "", regions: [], runs: [] };
    }

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
        runs: [...(logs[date].runs ?? []), { type: run.run_type ?? null, miles: run.distance_miles == null ? null : Number(run.distance_miles) }],
      };
    }

    // ── Current week: stored, or generated once, then placed ────────────
    const context = contextFor(weekStart);
    let current = storedByWeek.get(weekStart);
    if (!current || !isPlanned(current) || regenerateWeek === weekStart) current = await generate(weekStart, context);

    const scheduled = scheduleWeek({
      sessions: [...(current.sessions ?? [])],
      weekDates,
      today: todayKey,
      logs,
      priorAssignments: current.assignments ?? {},
    });

    // Falling behind shouldn't just reshuffle — the miles have to reappear.
    const reconciled = reconcileMileage({
      sessions: [...(current.sessions ?? [])],
      days: scheduled,
      today: todayKey,
      milesThisWeek: context.milesThisWeek,
      weeklyTarget: context.marathon?.weeklyMileage ?? null,
      avgWeeklyMiles: context.avgWeeklyMiles,
      typicalRunMiles: context.typicalRunMiles,
    });

    await persistPlacement(weekStart, reconciled.sessions, reconciled.days);

    // ── The other weeks the strip touches ───────────────────────────────
    type WeekResult = { meta: PlanWeekMeta; sessions: PlanSession[]; days: PlanDay[] };
    const results: WeekResult[] = [];

    for (const week of stripWeeks) {
      const dates = weekDatesFrom(week);
      const marathon = currentWeek(marathonWeeks, week);
      const baseMeta = {
        weekStart: week,
        weekEnd: dates[6],
        planWeek: marathon?.weekNumber ?? null,
        phase: marathon?.phase ?? null,
        weeklyMileage: marathon?.weeklyMileage ?? null,
      };

      if (week === weekStart) {
        results.push({
          meta: { ...baseMeta, headline: current.headline ?? "", pending: false },
          sessions: reconciled.sessions,
          days: reconciled.days,
        });
        continue;
      }

      let stored = storedByWeek.get(week);
      if (week > weekStart && !isPlanned(stored)) stored = undefined;

      if (week < weekStart) {
        // The past is read-only: show what was planned and what got logged.
        const days: PlanDay[] = stored
          ? scheduleWeek({
              sessions: [...(stored.sessions ?? [])],
              weekDates: dates,
              today: todayKey,
              logs,
              priorAssignments: stored.assignments ?? {},
            })
          : dates.map((date) => {
              const log = logs[date];
              const logged = !!log && (log.hasWorkout || log.hasRun);
              return {
                date,
                sessionId: null,
                runNote: null,
                isKeyRunDay: false,
                status: logged ? "done" : "missed",
                loggedSummary: logged ? log.summary : null,
                loggedRun: !!log?.hasRun,
                loggedLift: !!log?.hasWorkout,
              };
            });
        results.push({ meta: { ...baseMeta, headline: stored?.headline ?? "", pending: false }, sessions: stored?.sessions ?? [], days });
        continue;
      }

      // A future week. Its planner hears what the current week still has
      // scheduled, so a Thursday leg day isn't followed by a Sunday one.
      const stillPlanned = reconciled.days
        .filter((d) => d.date >= todayKey && d.status !== "done" && d.sessionId)
        .map((d) => {
          const s = reconciled.sessions.find((x) => x.id === d.sessionId)!;
          return { date: d.date, title: s.title, kind: s.kind, regions: s.regions };
        });
      const futureContext = contextFor(week, stillPlanned);

      if (!stored && ensureWeek !== week && regenerateWeek !== week) {
        // Not generated inline — one AI call per request. The client sees
        // `pending` and asks for this week on its own.
        results.push({
          meta: { ...baseMeta, headline: "", pending: true },
          sessions: [],
          days: dates.map((date) => ({ date, sessionId: null, runNote: null, isKeyRunDay: false, status: "upcoming", loggedSummary: null })),
        });
        continue;
      }
      if (!stored || regenerateWeek === week) stored = await generate(week, futureContext);

      // Placed as if the week started now, then every day reads as upcoming.
      const placed = scheduleWeek({
        sessions: [...(stored.sessions ?? [])],
        weekDates: dates,
        today: week,
        logs,
        priorAssignments: stored.assignments ?? {},
      });
      const futureReconciled = reconcileMileage({
        sessions: [...(stored.sessions ?? [])],
        days: placed,
        today: week,
        milesThisWeek: 0,
        weeklyTarget: futureContext.marathon?.weeklyMileage ?? null,
        avgWeeklyMiles: futureContext.avgWeeklyMiles,
        typicalRunMiles: futureContext.typicalRunMiles,
      });
      const days = futureReconciled.days.map((d) => ({ ...d, status: "upcoming" as const }));
      await persistPlacement(week, futureReconciled.sessions, days);
      results.push({ meta: { ...baseMeta, headline: stored.headline ?? "", pending: false }, sessions: futureReconciled.sessions, days });
    }

    // ── Stitch the strip together ───────────────────────────────────────
    const stripSet = new Set(stripDates);
    const prefixed = (week: string, id: string | null) => (id ? `${week}:${id}` : null);

    const plan: WeekPlan = {
      today: todayKey,
      weekStart,
      weekEnd,
      planWeek: context.marathon?.planWeek ?? null,
      phase: context.marathon?.phase ?? null,
      headline: current.headline ?? "",
      sessions: results.flatMap((r) => r.sessions.map((s) => ({ ...s, id: prefixed(r.meta.weekStart, s.id)! }))),
      days: results
        .flatMap((r) => r.days.map((d) => ({ ...d, weekStart: r.meta.weekStart, sessionId: prefixed(r.meta.weekStart, d.sessionId) })))
        .filter((d) => stripSet.has(d.date))
        .sort((a, b) => a.date.localeCompare(b.date)),
      weeks: results.map((r) => r.meta),
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ plan, context, mileage: { gap: reconciled.gap, added: reconciled.added, residual: reconciled.residual, note: reconciled.note } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
