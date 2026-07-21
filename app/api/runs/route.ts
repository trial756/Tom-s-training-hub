import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseRunEntry } from "@/lib/anthropic";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const { data, error } = await supabaseAdmin()
    .from("runs")
    .select("*")
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ runs: data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Missing 'text' field." }, { status: 400 });
    }

    const parsed = await parseRunEntry(text);

    const { data, error } = await supabaseAdmin()
      .from("runs")
      .insert({
        raw_text: text,
        distance_miles: parsed.distance_miles,
        duration_seconds: parsed.duration_seconds,
        pace_seconds_per_mile: parsed.pace_seconds_per_mile,
        avg_hr: parsed.avg_hr,
        max_hr: parsed.max_hr,
        run_type: parsed.run_type,
        notes: parsed.notes,
        coaching_feedback: parsed.coaching_feedback,
        logged_at: body.logged_at ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ run: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
