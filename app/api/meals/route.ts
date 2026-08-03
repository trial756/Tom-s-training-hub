import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseMealEntry } from "@/lib/anthropic";

export const runtime = "nodejs";

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

    return NextResponse.json({ meal: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
