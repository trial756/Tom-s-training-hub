import { supabaseAdmin } from "@/lib/supabase-admin";
import { localDateKey, shiftDays } from "@/lib/format";
import { garminGet } from "@/lib/garmin";

// ── Garmin daily wellness → garmin_daily ─────────────────────────────
//
// What the personal key can read beyond activities (checked with
// /api/garmin/probe, Nov 2026): Body Battery daily reports, and HRV.
// One row per day. Backfilled from the block start in month-sized chunks,
// then the last week is refreshed on every sync so late-arriving data lands.

const CHUNK_DAYS = 28;
const REFRESH_DAYS = 7;
const MAX_CHUNKS = 4;

export interface WellnessState {
  /** Next day the backfill still has to fetch; null once caught up. */
  next: string | null;
}

type Row = {
  day: string;
  bb_charged: number | null;
  bb_drained: number | null;
  bb_high: number | null;
  bb_low: number | null;
  hrv_last_night: number | null;
  hrv_weekly_avg: number | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/** A Body Battery sample is [timestamp, level] or [timestamp, status, level, version]: the level is the 0–100 number. */
function levels(samples: unknown): number[] {
  if (!Array.isArray(samples)) return [];
  const out: number[] = [];
  for (const s of samples) {
    if (!Array.isArray(s)) continue;
    const level = s.slice(1).find((v) => typeof v === "number" && v >= 0 && v <= 100);
    if (typeof level === "number") out.push(level);
  }
  return out;
}

async function bodyBattery(from: string, to: string): Promise<Map<string, Partial<Row>>> {
  const body = await garminGet("/wellness-service/wellness/bodyBattery/reports/daily", { startDate: from, endDate: to });
  const out = new Map<string, Partial<Row>>();
  for (const d of Array.isArray(body) ? (body as Record<string, unknown>[]) : []) {
    const day = typeof d.date === "string" ? d.date.slice(0, 10) : null;
    if (!day) continue;
    const lv = levels(d.bodyBatteryValuesArray);
    out.set(day, {
      bb_charged: num(d.charged),
      bb_drained: num(d.drained),
      bb_high: lv.length ? Math.max(...lv) : null,
      bb_low: lv.length ? Math.min(...lv) : null,
    });
  }
  return out;
}

async function hrv(day: string): Promise<Partial<Row> | null> {
  try {
    const body = (await garminGet(`/hrv-service/hrv/${day}`)) as { hrvSummary?: Record<string, unknown> } | null;
    const s = body?.hrvSummary;
    if (!s) return null;
    return { hrv_last_night: num(s.lastNightAvg), hrv_weekly_avg: num(s.weeklyAvg) };
  } catch {
    return null; // no reading that night
  }
}

async function save(rows: Map<string, Partial<Row>>) {
  if (!rows.size) return;
  const payload = Array.from(rows, ([day, r]) => ({ day, ...r, updated_at: new Date().toISOString() }));
  const { error } = await supabaseAdmin().from("garmin_daily").upsert(payload, { onConflict: "day" });
  if (error) throw new Error(error.message);
}

/**
 * One pass: a chunk of the backfill if it isn't finished, plus the last
 * week's Body Battery and HRV. Failures here never break the run sync.
 */
export async function syncWellness(state: WellnessState | undefined, backfillFrom: string): Promise<WellnessState> {
  const today = localDateKey(new Date());
  const next = state ? state.next : backfillFrom;
  const rows = new Map<string, Partial<Row>>();
  const merge = (m: Map<string, Partial<Row>>) => m.forEach((v, k) => rows.set(k, { ...(rows.get(k) ?? {}), ...v }));

  // Up to MAX_CHUNKS month-sized requests per pass, so the backfill finishes
  // in one or two syncs without risking the function's time limit.
  let after: string | null = next;
  for (let i = 0; i < MAX_CHUNKS && after && after <= today; i++) {
    const end = localDateKey(shiftDays(new Date(`${after}T12:00:00`), CHUNK_DAYS - 1));
    const to = end < today ? end : today;
    merge(await bodyBattery(after, to));
    after = to >= today ? null : localDateKey(shiftDays(new Date(`${to}T12:00:00`), 1));
  }

  const weekAgo = localDateKey(shiftDays(new Date(), -(REFRESH_DAYS - 1)));
  merge(await bodyBattery(weekAgo, today));
  for (let i = 0; i < REFRESH_DAYS; i++) {
    const day = localDateKey(shiftDays(new Date(), -i));
    const h = await hrv(day);
    if (h && (h.hrv_last_night != null || h.hrv_weekly_avg != null)) rows.set(day, { ...(rows.get(day) ?? {}), ...h });
  }

  await save(rows);
  return { next: after };
}
