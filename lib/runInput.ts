import type { StructuredRunInput } from "@/lib/anthropic";
import { APP_TIMEZONE, formatDuration, formatPace } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeIntervals } from "@/lib/intervals";
import { RUN_TYPES } from "@/lib/types";

/**
 * Lenient on purpose: "4 mi", "4mi" and "4,0" from a phone keyboard all mean
 * 4. A strict Number() turned those into null and the value vanished silently.
 */
export function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const match = String(v).replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The Runs form body → clean structured fields. Shared by logging and editing
 * so an edited run is held to exactly the same rules as a new one.
 */
export function normalizeRunBody(body: Record<string, unknown>): { structured: StructuredRunInput; shoes: string | null } {
  // Nothing on the run form is required, run type included — an unset or
  // unrecognized type falls back to "Other" rather than rejecting the log.
  const submittedType = typeof body.run_type === "string" ? body.run_type.trim() : "";
  const run_type = RUN_TYPES.includes(submittedType as (typeof RUN_TYPES)[number]) ? submittedType : "Other";

  // Any two of distance, duration and pace give the third. Copying time and
  // pace off a watch without the distance used to save no mileage at all —
  // the week's miles read 0 though the AI summary said "Easy 4mi".
  let distance_miles = toNullableNumber(body.distance_miles);
  let duration_seconds = toNullableNumber(body.duration_seconds);
  let pace_seconds_per_mile = toNullableNumber(body.pace_seconds_per_mile);
  if (pace_seconds_per_mile == null && distance_miles && duration_seconds) {
    pace_seconds_per_mile = Math.round(duration_seconds / distance_miles);
  }
  if (distance_miles == null && duration_seconds && pace_seconds_per_mile) {
    distance_miles = Math.round((duration_seconds / pace_seconds_per_mile) * 100) / 100;
  }
  if (duration_seconds == null && distance_miles && pace_seconds_per_mile) {
    duration_seconds = Math.round(distance_miles * pace_seconds_per_mile);
  }

  return {
    structured: {
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
      surface: text(body.surface),
      notes: text(body.notes),
      feel: text(body.feel),
      intervals: sanitizeIntervals(body.intervals),
    },
    shoes: text(body.shoes),
  };
}

export function composeRunSummary(input: StructuredRunInput): string {
  const bits: string[] = [];
  if (input.distance_miles != null) bits.push(`${input.distance_miles}mi`);
  bits.push(`${input.run_type} run`);
  if (input.duration_seconds != null) bits.push(`in ${formatDuration(input.duration_seconds)}`);
  if (input.pace_seconds_per_mile != null) bits.push(`(${formatPace(input.pace_seconds_per_mile)})`);
  let summary = bits.join(" ");
  if (input.notes) summary += ` — ${input.notes}`;
  return summary;
}

/** The last 15 runs as one line each, for the coaching prompt. */
export async function buildRunHistoryContext(): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("runs")
    .select("logged_at, run_type, distance_miles, duration_seconds, pace_seconds_per_mile, avg_hr, elev_gain_ft, feel")
    .order("logged_at", { ascending: false })
    .limit(15);

  return (data ?? [])
    .map((r) => {
      const date = new Date(r.logged_at).toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric", year: "numeric" });
      const bits = [`${r.run_type ?? "Run"}`];
      if (r.distance_miles != null) bits.push(`${r.distance_miles}mi`);
      if (r.duration_seconds != null) bits.push(`in ${formatDuration(r.duration_seconds)}`);
      if (r.pace_seconds_per_mile != null) bits.push(`(${formatPace(r.pace_seconds_per_mile)})`);
      if (r.avg_hr != null) bits.push(`avg HR ${r.avg_hr}`);
      if (r.elev_gain_ft != null) bits.push(`+${r.elev_gain_ft}ft`);
      if (r.feel) bits.push(`felt ${r.feel}`);
      return `${date} — ${bits.join(" ")}`;
    })
    .join("\n");
}
