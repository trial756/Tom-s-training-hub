import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseWorkoutEntry } from "@/lib/anthropic";
import type { Exercise } from "@/lib/types";

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
      const date = new Date(w.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

    const { data, error } = await supabaseAdmin()
      .from("workouts")
      .insert({
        raw_text: text,
        exercises: parsed.exercises,
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

    return NextResponse.json({ workout: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
