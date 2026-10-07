import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseWorkoutEntry, type ParsedWorkout } from "@/lib/anthropic";
import { APP_TIMEZONE, normalizeExerciseName } from "@/lib/format";
import { cleanRegions } from "@/lib/muscles";
import type { Exercise } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Files any exercise the parser hasn't seen before into the exercise →
 * muscle lookup. First tagging wins: existing rows (including hand-seeded
 * and hand-corrected ones) are never overwritten, so fixing a bad tag is a
 * one-row edit that applies to every session using that movement.
 *
 * Failures are swallowed — this is secondary bookkeeping and must never
 * fail a workout that already saved.
 */
async function recordExerciseMuscles(parsed: ParsedWorkout) {
  try {
    const byKey = new Map<string, { key: string; display_name: string; primary_muscles: string[]; secondary_muscles: string[]; source: string }>();
    for (const ex of parsed.exercises ?? []) {
      const key = normalizeExerciseName(ex.name ?? "");
      if (!key || byKey.has(key)) continue;
      const primary = cleanRegions(ex.primary_muscles);
      const secondary = cleanRegions(ex.secondary_muscles).filter((r) => !primary.includes(r));
      if (primary.length === 0 && secondary.length === 0) continue;
      byKey.set(key, { key, display_name: ex.name, primary_muscles: primary, secondary_muscles: secondary, source: "ai" });
    }
    if (byKey.size === 0) return;
    await supabaseAdmin()
      .from("exercise_muscles")
      .upsert(Array.from(byKey.values()), { onConflict: "key", ignoreDuplicates: true });
  } catch {
    // Non-critical.
  }
}

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

function summarizeExercises(exercises: Exercise[]): string {
  return (exercises ?? [])
    .map((e) => `${e.name}: ${(e.sets ?? []).map((s) => `${s.weight ?? "?"}${s.weight_unit ?? ""}x${s.reps ?? "?"}`).join(",")}`)
    .join(" | ");
}

async function buildWorkoutHistoryContext(): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("workouts")
    .select("logged_at, exercises, muscle_groups")
    .order("logged_at", { ascending: false })
    .limit(10);

  return (data ?? [])
    .map((w) => {
      const date = new Date(w.logged_at).toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric", year: "numeric" });
      const groups = (w.muscle_groups ?? []).length ? ` [${(w.muscle_groups ?? []).join(", ")}]` : "";
      return `${date}${groups} — ${summarizeExercises(w.exercises ?? [])}`;
    })
    .join("\n");
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
    const exercises = (parsed.exercises ?? []).map((ex) => ({ name: ex.name, sets: ex.sets }));

    const { data, error } = await supabaseAdmin()
      .from("workouts")
      .insert({
        raw_text: text,
        exercises,
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
