import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateRunCoaching, type StructuredRunInput } from "@/lib/anthropic";
import { formatDuration, formatPace } from "@/lib/format";
import { RUN_TYPES } from "@/lib/types";

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

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function composeSummary(input: StructuredRunInput): string {
  const bits: string[] = [];
  if (input.distance_miles != null) bits.push(`${input.distance_miles}mi`);
  bits.push(`${input.run_type} run`);
  if (input.duration_seconds != null) bits.push(`in ${formatDuration(input.duration_seconds)}`);
  if (input.pace_seconds_per_mile != null) bits.push(`(${formatPace(input.pace_seconds_per_mile)})`);
  let summary = bits.join(" ");
  if (input.notes) summary += ` — ${input.notes}`;
  return summary;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const run_type = typeof body.run_type === "string" ? body.run_type : "";
    if (!RUN_TYPES.includes(run_type as (typeof RUN_TYPES)[number])) {
      return NextResponse.json({ error: `Missing or invalid 'run_type'. Must be one of: ${RUN_TYPES.join(", ")}` }, { status: 400 });
    }

    const distance_miles = toNullableNumber(body.distance_miles);
    const duration_seconds = toNullableNumber(body.duration_seconds);
    let pace_seconds_per_mile = toNullableNumber(body.pace_seconds_per_mile);
    if (pace_seconds_per_mile == null && distance_miles && duration_seconds) {
      pace_seconds_per_mile = Math.round(duration_seconds / distance_miles);
    }

    const structured: StructuredRunInput = {
      run_type,
      distance_miles,
      duration_seconds,
      pace_seconds_per_mile,
      avg_hr: toNullableNumber(body.avg_hr),
      max_hr: toNullableNumber(body.max_hr),
      cadence_spm: toNullableNumber(body.cadence_spm),
      elev_gain_ft: toNullableNumber(body.elev_gain_ft),
      elev_loss_ft: toNullableNumber(body.elev_loss_ft),
      calories: toNullableNumber(body.calories),
      temp_f: toNullableNumber(body.temp_f),
      humidity_pct: toNullableNumber(body.humidity_pct),
      surface: typeof body.surface === "string" && body.surface.trim() ? body.surface.trim() : null,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    };

    const coaching = await generateRunCoaching(structured);

    const { data, error } = await supabaseAdmin()
      .from("runs")
      .insert({
        raw_text: composeSummary(structured),
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
        coaching_feedback: coaching.coaching_feedback,
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
