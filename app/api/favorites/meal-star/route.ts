import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeMealKey } from "@/lib/mealFavorites";

export const runtime = "nodejs";

// Toggles the manual star for a meal, keyed off its normalized text rather
// than a favorites row id — the row may not exist yet if this is the first
// time the meal is being starred (auto-favoriting via count only kicks in
// at 3+ logs).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body.text;
    const manual = Boolean(body.manual);
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Missing 'text' field." }, { status: 400 });
    }

    const key = normalizeMealKey(text);
    const db = supabaseAdmin();
    const { data: existing } = await db.from("favorites").select("id").eq("type", "meal").eq("key", key).maybeSingle();

    if (existing) {
      const { data, error } = await db
        .from("favorites")
        .update({ manual, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ favorite: data });
    }

    const { data, error } = await db
      .from("favorites")
      .insert({ type: "meal", name: text.slice(0, 60), raw_text: text, key, count: 1, manual })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ favorite: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
