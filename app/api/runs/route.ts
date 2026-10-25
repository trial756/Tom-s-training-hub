import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateRunCoaching } from "@/lib/anthropic";
import { buildRunHistoryContext, composeRunSummary, normalizeRunBody } from "@/lib/runInput";

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

    const { structured, shoes } = normalizeRunBody(body);

    const historyContext = await buildRunHistoryContext();
    const coaching = await generateRunCoaching(structured, historyContext);

    const { data, error } = await supabaseAdmin()
      .from("runs")
      .insert({
        raw_text: composeRunSummary(structured),
        distance_miles: structured.distance_miles,
        duration_seconds: structured.duration_seconds,
        pace_seconds_per_mile: structured.pace_seconds_per_mile,
        avg_hr: structured.avg_hr,
        max_hr: structured.max_hr,
        cadence_spm: structured.cadence_spm,
        elev_gain_ft: structured.elev_gain_ft,
        elev_loss_ft: structured.elev_loss_ft,
        calories: coaching.calories,
        temp_f: structured.temp_f,
        humidity_pct: structured.humidity_pct,
        surface: structured.surface,
        run_type: structured.run_type,
        notes: structured.notes,
        feel: structured.feel,
        intervals: structured.intervals,
        shoes,
        coaching_feedback: coaching.coaching_feedback,
        vs_last_time: coaching.vs_last_time,
        adjustments: coaching.adjustments,
        pace_note: coaching.pace_note,
        summary: coaching.summary,
        weekly_note: coaching.weekly_note,
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
