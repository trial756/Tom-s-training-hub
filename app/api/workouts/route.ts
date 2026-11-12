import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseWorkoutEntry } from "@/lib/anthropic";
import { existingByClientId, isDuplicate, readClientId } from "@/lib/clientId";
import { canonicalExerciseName } from "@/lib/exerciseNames";
import { localDateKey } from "@/lib/format";
import { plannedFor, type PlannedForDay } from "@/lib/runReview";
import type { Exercise } from "@/lib/types";
import { buildWorkoutHistoryContext, recordExerciseMuscles } from "@/lib/workoutLog";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const { data, error } = await supabaseAdmin()
    .from("workouts")
    .select("*")
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ workouts: data });
}

/**
 * What the plan prescribed that day, so coaching judges the log against it:
 * Nov 11 2026's calf raises were planned without a weight, then flagged for
 * having no load.
 */
function planContextFor(planned: PlannedForDay | null): string {
  const s = planned?.session;
  if (!s?.exercises.length) return "";
  const lines = s.exercises.map(
    (e) => `- ${e.name}: ${e.sets} × ${e.reps}${e.target ? ` @ ${e.target}` : " (no load prescribed — bodyweight or the athlete's choice)"}`
  );
  return `The plan for this day was "${s.title}". It prescribed:\n${lines.join("\n")}`;
}

function exactExercises(raw: unknown): Exercise[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 2000 ? v : null);
  const out: Exercise[] = [];
  for (const e of raw as { name?: unknown; sets?: unknown }[]) {
    if (typeof e?.name !== "string" || !e.name.trim() || !Array.isArray(e.sets)) return null;
    out.push({
      name: canonicalExerciseName(e.name.trim().slice(0, 80)),
      sets: (e.sets as { reps?: unknown; weight?: unknown; seconds?: unknown }[]).slice(0, 30).map((st) => {
        const weight = n(st?.weight);
        const seconds = n(st?.seconds);
        return { reps: n(st?.reps), weight, weight_unit: weight ? "lb" : null, ...(seconds ? { seconds } : {}) };
      }),
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const clientId = readClientId(body);
    const already = await existingByClientId("workouts", clientId);
    if (already) return NextResponse.json({ workout: already }, { status: 200 });
    const text: string = body.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Missing 'text' field." }, { status: 400 });
    }

    const loggedAt: string = typeof body.logged_at === "string" ? body.logged_at : new Date().toISOString();
    const [historyContext, planned] = await Promise.all([
      buildWorkoutHistoryContext(),
      plannedFor(localDateKey(new Date(loggedAt))).catch(() => null),
    ]);
    const parsed = await parseWorkoutEntry(text, historyContext, planContextFor(planned));

    // Muscle tags live in the exercise_muscles lookup, not on the workout
    // row — storing them per session would let the same movement drift into
    // disagreeing tags across entries.
    // Workout mode sends the ticked sets exactly; they're stored as-is (under
    // the standard lift names) rather than re-read from the text.
    const exact = exactExercises(body.exercises);
    const exercises = exact ?? (parsed.exercises ?? []).map((ex) => ({ name: ex.name, sets: ex.sets }));
    const duration =
      typeof body.duration_minutes === "number" && body.duration_minutes > 0 && body.duration_minutes < 600
        ? Math.round(body.duration_minutes)
        : parsed.duration_minutes;

    const { data, error } = await supabaseAdmin()
      .from("workouts")
      .insert({
        raw_text: text,
        client_id: clientId,
        exercises,
        duration_minutes: duration,
        notes: parsed.notes,
        coaching_feedback: parsed.coaching_feedback,
        vs_last_time: parsed.vs_last_time,
        adjustments: parsed.adjustments,
        type: parsed.type,
        muscle_groups: parsed.muscle_groups,
        intensity: parsed.intensity,
        calories_burned_est: parsed.calories_burned_est,
        summary: parsed.summary,
        weekly_note: parsed.weekly_note,
        logged_at: loggedAt,
      })
      .select()
      .single();

    if (isDuplicate(error)) return NextResponse.json({ workout: await existingByClientId("workouts", clientId) }, { status: 200 });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await recordExerciseMuscles(parsed);

    return NextResponse.json({ workout: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
