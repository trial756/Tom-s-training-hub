import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseMealEntry } from "@/lib/anthropic";
import { normalizeMealKey } from "@/lib/mealFavorites";

export const runtime = "nodejs";

// Called after every meal log so repeated meals build a count toward the
// auto-favorite threshold. Preserves an existing manual star; never
// overwrites it. Awaited (not fire-and-forget) so this can't race the meal
// insert itself. Failures here are swallowed — favorite bookkeeping is
// secondary and must never fail a meal that already saved successfully.
async function bumpMealFavoriteCount(text: string, summary: string) {
  try {
    const key = normalizeMealKey(text);
    const db = supabaseAdmin();
    const { data: existing } = await db.from("favorites").select("id, count").eq("type", "meal").eq("key", key).maybeSingle();

    if (existing) {
      await db
        .from("favorites")
        .update({ count: (existing.count ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await db.from("favorites").insert({
        type: "meal",
        name: summary.slice(0, 60),
        raw_text: text,
        key,
        count: 1,
        manual: false,
      });
    }
  } catch {
    // Non-critical — a rare race on the unique key index shouldn't fail the meal log.
  }
}

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const { data, error } = await supabaseAdmin()
    .from("meals")
    .select("*")
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ meals: data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Missing 'text' field." }, { status: 400 });
    }

    const parsed = await parseMealEntry(text);

    const { data, error } = await supabaseAdmin()
      .from("meals")
      .insert({
        raw_text: text,
        meal_type: parsed.meal_type,
        calories: parsed.calories,
        protein_g: parsed.protein_g,
        carbs_g: parsed.carbs_g,
        fat_g: parsed.fat_g,
        items: parsed.items,
        notes: parsed.notes,
        coaching_feedback: parsed.coaching_feedback,
        summary: parsed.summary,
        logged_at: body.logged_at ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await bumpMealFavoriteCount(text, parsed.summary);

    return NextResponse.json({ meal: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
