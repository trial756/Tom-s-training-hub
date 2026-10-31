import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateRunCoaching, type StructuredRunInput } from "@/lib/anthropic";
import { localDateKey, shiftDays } from "@/lib/format";
import { formatPaceRange, plannedRunFor, type PlannedRun } from "@/lib/planner/runPlan";
import type { PlanSession } from "@/lib/planner/types";
import { buildRunHistoryContext, composeRunSummary, normalizeRunBody } from "@/lib/runInput";
import { sanitizeIntervals } from "@/lib/intervals";

// ── Garmin runs awaiting confirmation ────────────────────────────────
//
// A fresh Garmin run lands as review_status = 'pending': it already counts
// (mileage, plan, body map) but gets no coaching until it's confirmed, so the
// coaching sees the run type, feel and notes the athlete actually chose.

export interface PlannedForDay {
  title: string;
  run: PlannedRun | null;
}

/** What the plan had on a given day, if anything. */
export async function plannedFor(dateKey: string): Promise<PlannedForDay | null> {
  const weekStart = localDateKey(shiftDays(new Date(`${dateKey}T12:00:00Z`), -7));
  const { data } = await supabaseAdmin()
    .from("week_plans")
    .select("sessions, assignments")
    .gte("week_start", weekStart)
    .lte("week_start", dateKey);
  for (const row of data ?? []) {
    const sessions = (row.sessions ?? []) as PlanSession[];
    for (const [sessionId, date] of Object.entries((row.assignments ?? {}) as Record<string, string>)) {
      if (date !== dateKey) continue;
      const session = sessions.find((s) => s.id === sessionId);
      if (session) return { title: session.title, run: plannedRunFor(session) };
    }
  }
  return null;
}

/** One line for the coaching prompt: what was planned versus what was logged. */
export function planNote(planned: PlannedForDay | null, loggedType: string): string | null {
  if (!planned) return null;
  if (!planned.run) return `${planned.title} (no run planned that day — the athlete logged a ${loggedType} run).`;
  const r = planned.run;
  const target = [r.miles ? `${r.miles} mi` : null, r.type, r.pace ? `@ ${formatPaceRange(r.pace)}/mi` : null, r.structure ? `(${r.structure})` : null]
    .filter(Boolean)
    .join(" ");
  return r.type === loggedType
    ? `${target} — logged as planned.`
    : `${target}. The athlete logged it as ${loggedType} instead.`;
}

type RunRow = Record<string, unknown> & { id: string; logged_at: string };

/** The stored run as coaching input, with any fields from the form laid over it. */
function structuredFrom(run: RunRow, body?: Record<string, unknown>): { structured: StructuredRunInput; shoes: string | null } {
  if (body && Object.keys(body).length) return normalizeRunBody(body);
  const n = (v: unknown) => (v == null ? null : Number(v));
  const t = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    structured: {
      run_type: t(run.run_type) ?? "Other",
      distance_miles: n(run.distance_miles),
      duration_seconds: n(run.duration_seconds),
      pace_seconds_per_mile: n(run.pace_seconds_per_mile),
      avg_hr: n(run.avg_hr),
      max_hr: n(run.max_hr),
      cadence_spm: n(run.cadence_spm),
      elev_gain_ft: n(run.elev_gain_ft),
      elev_loss_ft: n(run.elev_loss_ft),
      calories: n(run.calories),
      temp_f: n(run.temp_f),
      humidity_pct: n(run.humidity_pct),
      surface: t(run.surface),
      notes: t(run.notes),
      feel: t(run.feel),
      intervals: sanitizeIntervals(run.intervals),
    },
    shoes: t(run.shoes),
  };
}

/**
 * Confirms a run: saves the form's values (or the run as it stands), writes
 * coaching that knows the plan, and clears the pending flag.
 */
export async function confirmRun(id: string, body?: Record<string, unknown>) {
  const db = supabaseAdmin();
  const { data: run, error } = await db.from("runs").select("*").eq("id", id).single();
  if (error || !run) throw new Error(error?.message ?? "Run not found.");

  const { structured, shoes } = structuredFrom(run as RunRow, body);
  const dateKey = localDateKey(new Date((body?.logged_at as string) || run.logged_at));
  const planned = await plannedFor(dateKey);
  let coaching: Partial<Awaited<ReturnType<typeof generateRunCoaching>>> = {};
  try {
    coaching = await generateRunCoaching(structured, await buildRunHistoryContext(), planNote(planned, structured.run_type));
  } catch {
    coaching = {};
  }
  const summary = composeRunSummary(structured);
  const update: Record<string, unknown> = {
    distance_miles: structured.distance_miles,
    duration_seconds: structured.duration_seconds,
    pace_seconds_per_mile: structured.pace_seconds_per_mile,
    avg_hr: structured.avg_hr,
    max_hr: structured.max_hr,
    cadence_spm: structured.cadence_spm,
    elev_gain_ft: structured.elev_gain_ft,
    elev_loss_ft: structured.elev_loss_ft,
    calories: structured.calories ?? coaching.calories ?? null,
    temp_f: structured.temp_f,
    humidity_pct: structured.humidity_pct,
    surface: structured.surface,
    run_type: structured.run_type,
    notes: structured.notes,
    feel: structured.feel,
    intervals: structured.intervals,
    shoes,
    raw_text: summary,
    summary: coaching.summary ?? summary,
    coaching_feedback: coaching.coaching_feedback ?? null,
    vs_last_time: coaching.vs_last_time ?? null,
    adjustments: coaching.adjustments ?? [],
    pace_note: coaching.pace_note ?? null,
    weekly_note: coaching.weekly_note ?? null,
    review_status: null,
  };
  if (typeof body?.logged_at === "string" && body.logged_at) update.logged_at = body.logged_at;
  const { data: saved, error: saveError } = await db.from("runs").update(update).eq("id", id).select().single();
  if (saveError) throw new Error(saveError.message);
  return saved;
}

/** Pending runs, newest first, each with what the plan had that day. */
export async function pendingRuns() {
  const { data, error } = await supabaseAdmin()
    .from("runs")
    .select("*")
    .eq("review_status", "pending")
    .order("logged_at", { ascending: false });
  if (error) throw new Error(error.message);
  return Promise.all(
    (data ?? []).map(async (run) => {
      const planned = await plannedFor(localDateKey(new Date(run.logged_at)));
      return { run, planned };
    })
  );
}

// ── Deleted Garmin runs stay deleted ─────────────────────────────────

export async function ignoredGarminIds(): Promise<Set<number>> {
  const { data } = await supabaseAdmin().from("sync_state").select("value").eq("key", "garmin_ignored").maybeSingle();
  return new Set(((data?.value as { ids?: number[] } | undefined)?.ids ?? []).map(Number));
}

/** Remembers a deleted Garmin activity so the next sync doesn't bring it back. */
export async function ignoreGarminId(activityId: number) {
  const ids = await ignoredGarminIds();
  ids.add(activityId);
  await supabaseAdmin()
    .from("sync_state")
    .upsert({ key: "garmin_ignored", value: { ids: Array.from(ids) }, updated_at: new Date().toISOString() }, { onConflict: "key" });
}
