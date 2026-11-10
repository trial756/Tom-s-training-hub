import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseWorkoutEntry } from "@/lib/anthropic";
import { canonicalExerciseName } from "@/lib/exerciseNames";
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

function exactExercises(raw: unknown): Exercise[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 2000 ? v : null);
  const out: Exercise[] = [];
  for (const e of raw as { name?: unknown; sets?: unknown }[]) {
    if (typeof e?.name !== "string" || !e.name.trim() || !Array.isArray(e.sets)) return null;
    out.push({
      name: canonicalExerciseName(e.name.trim().slice(0, 80)),
      sets: (e.sets as { reps?: unknown; weight?: unknown }[]).slice(0, 30).map((st) => {
        const weight = n(st?.weight);
        return { reps: n(st?.reps), weight, weight_unit: weight ? "lb" : null };
      }),
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Missing 'text' field." }, { status: 400 });
    }

    const historyContext = await buildWorkoutHistoryContext();
    const parsed = await parseWorkoutEntry(text, historyContext);

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
        logged_at: body.logged_at ?? new Date().toISOString(),
      })
      .select()
      .single();

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
