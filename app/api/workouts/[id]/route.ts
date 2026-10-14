import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseWorkoutEntry } from "@/lib/anthropic";
import { buildWorkoutHistoryContext, recordExerciseMuscles, sanitizeExercises } from "@/lib/workoutLog";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from("workouts").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ workout: data });
}

/**
 * Two kinds of edit. Hand-edited exercises save as-is — no AI call, so it's
 * instant and nothing corrected gets reinterpreted. Sending `text` instead
 * re-parses the entry from scratch, for a rewrite too big to fix row by row.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = supabaseAdmin();
    const update: Record<string, unknown> = {};

    if (typeof body.logged_at === "string" && body.logged_at) update.logged_at = body.logged_at;

    if (typeof body.text === "string" && body.text.trim()) {
      const parsed = await parseWorkoutEntry(body.text, await buildWorkoutHistoryContext());
      Object.assign(update, {
        raw_text: body.text,
        exercises: (parsed.exercises ?? []).map((ex) => ({ name: ex.name, sets: ex.sets })),
        duration_minutes: parsed.duration_minutes,
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
      });
      await recordExerciseMuscles(parsed);
    } else {
      if (body.exercises !== undefined) update.exercises = sanitizeExercises(body.exercises);
      if (body.notes !== undefined) update.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

    const { data, error } = await db.from("workouts").update(update).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ workout: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin().from("workouts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
