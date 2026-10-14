import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { composeRunSummary, normalizeRunBody } from "@/lib/runInput";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from("runs").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ run: data });
}

/**
 * Saves the edited form under the same rules as logging. No AI call — the
 * coaching note stays as written for the original entry; the summary is
 * rebuilt from the corrected numbers so nothing downstream reads stale miles.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { structured, shoes } = normalizeRunBody(body);
    const summary = composeRunSummary(structured);

    const update: Record<string, unknown> = {
      raw_text: summary,
      summary,
      distance_miles: structured.distance_miles,
      duration_seconds: structured.duration_seconds,
      pace_seconds_per_mile: structured.pace_seconds_per_mile,
      avg_hr: structured.avg_hr,
      max_hr: structured.max_hr,
      cadence_spm: structured.cadence_spm,
      elev_gain_ft: structured.elev_gain_ft,
      elev_loss_ft: structured.elev_loss_ft,
      calories: structured.calories,
      temp_f: structured.temp_f,
      humidity_pct: structured.humidity_pct,
      surface: structured.surface,
      run_type: structured.run_type,
      notes: structured.notes,
      feel: structured.feel,
      intervals: structured.intervals,
      shoes,
    };
    if (typeof body.logged_at === "string" && body.logged_at) update.logged_at = body.logged_at;

    const { data, error } = await supabaseAdmin().from("runs").update(update).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ run: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin().from("runs").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
