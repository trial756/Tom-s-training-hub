import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// Re-logs a favorite without calling Claude again — the structured data was
// already parsed once and is stored on the favorite.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();
  const { data: favorite, error: favError } = await db
    .from("favorites")
    .select("*")
    .eq("id", id)
    .single();

  if (favError || !favorite) {
    return NextResponse.json({ error: favError?.message ?? "Favorite not found." }, { status: 404 });
  }

  const fav = favorite as { type: string; raw_text: string; data: Record<string, unknown> };
  const now = new Date().toISOString();
  const d = fav.data;

  if (fav.type === "workout") {
    const { data, error } = await db
      .from("workouts")
      .insert({
        raw_text: fav.raw_text,
        exercises: d.exercises ?? [],
        duration_minutes: d.duration_minutes ?? null,
        notes: d.notes ?? null,
        coaching_feedback: d.coaching_feedback ?? null,
        logged_at: now,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ type: "workout", entry: data }, { status: 201 });
  }

  if (fav.type === "run") {
    const { data, error } = await db
      .from("runs")
      .insert({
        raw_text: fav.raw_text,
        distance_miles: d.distance_miles ?? null,
        duration_seconds: d.duration_seconds ?? null,
        pace_seconds_per_mile: d.pace_seconds_per_mile ?? null,
        avg_hr: d.avg_hr ?? null,
        max_hr: d.max_hr ?? null,
        run_type: d.run_type ?? null,
        notes: d.notes ?? null,
        coaching_feedback: d.coaching_feedback ?? null,
        logged_at: now,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ type: "run", entry: data }, { status: 201 });
  }

  if (fav.type === "meal") {
    const { data, error } = await db
      .from("meals")
      .insert({
        raw_text: fav.raw_text,
        meal_type: d.meal_type ?? null,
        calories: d.calories ?? null,
        protein_g: d.protein_g ?? null,
        carbs_g: d.carbs_g ?? null,
        fat_g: d.fat_g ?? null,
        items: d.items ?? [],
        notes: d.notes ?? null,
        coaching_feedback: d.coaching_feedback ?? null,
        logged_at: now,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ type: "meal", entry: data }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown favorite type." }, { status: 400 });
}
