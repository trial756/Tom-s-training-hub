import { supabaseAdmin } from "@/lib/supabase-admin";
import type { StructuredRunInput } from "@/lib/anthropic";
import { localDateKey, shiftDays } from "@/lib/format";
import { searchActivities } from "@/lib/garmin";
import { plannedRunFor } from "@/lib/planner/runPlan";
import type { PlanSession } from "@/lib/planner/types";
import { composeRunSummary } from "@/lib/runInput";
import { confirmRun, ignoredGarminIds } from "@/lib/runReview";
import type { RunType } from "@/lib/types";

// ── Garmin → runs ────────────────────────────────────────────────────
//
// Runs recorded on the watch land in the runs table on their own. Each
// Garmin activity is imported once (runs.garmin_activity_id is unique) and
// never touched again, so an edit made in the app always sticks.
//
// A Garmin run on a day that already has a hand-logged run is matched to it:
//   • close (distance and time within 10%) — Garmin's numbers replace the
//     typed ones; feel, notes, shoes and run type stay as logged
//   • further apart — the logged numbers stay (only blanks are filled), and
//     the entry is linked so the Garmin run isn't imported again
//   • distances more than 50% apart — a different run (a double day), so it
//     is imported on its own
//
// A new run from the last two days arrives awaiting confirmation; coaching
// waits until it's confirmed (lib/runReview.ts).

/** Start of the 27-week block — how far back the one-time backfill reaches. */
export const BACKFILL_FROM = "2026-06-14";
const RECENT_DAYS = 7;
const THROTTLE_MS = 10 * 60 * 1000;
const BACKFILL_CHUNK = 20;
/**
 * Runs this recent arrive awaiting confirmation (a pop-up in the app) and get
 * coaching once confirmed. Older ones — the backfill — are saved as they are.
 */
const PENDING_WITHIN_DAYS = 2;
const SLIGHT = 0.1;
const DIFFERENT_RUN = 0.5;

const M_PER_MI = 1609.344;
const FT_PER_M = 3.28084;

type GarminActivity = Record<string, unknown> & { activityType?: { typeKey?: string } };

interface SyncState {
  lastRecentSync?: string;
  backfill?: { done: boolean; start: number };
}

export interface SyncResult {
  ok: boolean;
  skipped?: "throttled";
  imported: number;
  merged: number;
  linked: number;
  backfillDone: boolean;
  error?: string;
  code?: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: number | null, dp = 0) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

function isRun(a: GarminActivity): boolean {
  return /run/i.test(a.activityType?.typeKey ?? "");
}

function surfaceFor(typeKey: string): string {
  if (/trail/.test(typeKey)) return "trail";
  if (/treadmill|indoor/.test(typeKey)) return "treadmill";
  if (/track/.test(typeKey)) return "track";
  return "road";
}

/** Garmin's GMT start ("2026-10-24 13:05:00") as an instant. */
function startOf(a: GarminActivity): Date {
  const gmt = String(a.startTimeGMT ?? a.startTimeLocal ?? "");
  const d = new Date(gmt.includes("T") ? gmt : `${gmt.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Run type when the plan doesn't say: from distance and pace against the zones. */
function typeFromPace(miles: number | null, pace: number | null): RunType {
  if (miles != null && miles >= 10) return "Long";
  if (pace != null && pace <= 465) return "Tempo";
  if (pace != null && pace <= 500) return "Marathon Pace";
  return "Easy";
}

function clock(s: number | null): string | null {
  if (!s) return null;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

interface Mapped {
  activityId: number;
  loggedAt: string;
  dateKey: string;
  fields: {
    distance_miles: number | null;
    duration_seconds: number | null;
    pace_seconds_per_mile: number | null;
    avg_hr: number | null;
    max_hr: number | null;
    cadence_spm: number | null;
    elev_gain_ft: number | null;
    elev_loss_ft: number | null;
    calories: number | null;
  };
  surface: string;
  extras: Record<string, unknown>;
  noteLine: string | null;
}

function mapActivity(a: GarminActivity): Mapped | null {
  const activityId = num(a.activityId);
  if (activityId == null) return null;
  const start = startOf(a);
  const meters = num(a.distance);
  const miles = meters != null && meters > 0 ? round(meters / M_PER_MI, 2) : null;
  const duration = round(num(a.duration) ?? num(a.movingDuration));
  const pace = miles && duration ? Math.round(duration / miles) : null;
  const ft = (m: unknown) => (num(m) == null ? null : Math.round(num(m)! * FT_PER_M));

  const fastestMile = round(num(a.fastestSplit_1609));
  const zones = [1, 2, 3, 4, 5].map((z) => round((num(a[`hrTimeInZone_${z}`]) ?? 0) / 60));
  const extras = {
    name: a.activityName ?? null,
    typeKey: a.activityType?.typeKey ?? null,
    movingSeconds: round(num(a.movingDuration)),
    elapsedSeconds: round(num(a.elapsedDuration)),
    gradeAdjustedPace: num(a.avgGradeAdjustedSpeed) ? Math.round(M_PER_MI / num(a.avgGradeAdjustedSpeed)!) : null,
    fastestMileSeconds: fastestMile,
    fastest5kSeconds: round(num(a.fastestSplit_5000)),
    aerobicTrainingEffect: round(num(a.aerobicTrainingEffect), 1),
    anaerobicTrainingEffect: round(num(a.anaerobicTrainingEffect), 1),
    trainingLoad: round(num(a.activityTrainingLoad)),
    hrZoneMinutes: zones,
    bodyBatteryChange: round(num(a.differenceBodyBattery)),
    strideLengthCm: round(num(a.avgStrideLength), 1),
    groundContactMs: round(num(a.avgGroundContactTime)),
    verticalOscillationCm: round(num(a.avgVerticalOscillation), 1),
    steps: round(num(a.steps)),
    location: a.locationName ?? null,
    lapCount: num(a.lapCount),
  };
  const bits = [
    fastestMile ? `fastest mile ${clock(fastestMile)}` : null,
    extras.aerobicTrainingEffect ? `aerobic TE ${extras.aerobicTrainingEffect}` : null,
    extras.trainingLoad ? `load ${extras.trainingLoad}` : null,
  ].filter(Boolean);

  return {
    activityId,
    loggedAt: start.toISOString(),
    dateKey: localDateKey(start),
    fields: {
      distance_miles: miles,
      duration_seconds: duration,
      pace_seconds_per_mile: pace,
      avg_hr: round(num(a.averageHR)),
      max_hr: round(num(a.maxHR)),
      cadence_spm: round(num(a.averageRunningCadenceInStepsPerMinute)),
      elev_gain_ft: ft(a.elevationGain),
      elev_loss_ft: ft(a.elevationLoss),
      calories: round(num(a.calories)),
    },
    surface: surfaceFor(String(a.activityType?.typeKey ?? "")),
    extras,
    noteLine: bits.length ? `Garmin · ${bits.join(" · ")}` : null,
  };
}

type ManualRun = {
  id: string;
  logged_at: string;
  distance_miles: number | null;
  duration_seconds: number | null;
  [k: string]: unknown;
};

const gap = (a: number | null, b: number | null) =>
  a != null && b != null && Math.max(a, b) > 0 ? Math.abs(a - b) / Math.max(a, b) : null;

type Match = { run: ManualRun; kind: "slight" | "big" } | null;

/** Pairs a Garmin run with a hand-logged run on the same day, if one fits. */
function matchManual(g: Mapped, candidates: ManualRun[]): Match {
  let best: { run: ManualRun; d: number } | null = null;
  for (const run of candidates) {
    const d = gap(g.fields.distance_miles, run.distance_miles == null ? null : Number(run.distance_miles));
    if (d != null && d > DIFFERENT_RUN) continue;
    const score = d ?? 0.25;
    if (!best || score < best.d) best = { run, d: score };
  }
  if (!best) return null;
  const d = gap(g.fields.distance_miles, best.run.distance_miles == null ? null : Number(best.run.distance_miles));
  const t = gap(g.fields.duration_seconds, best.run.duration_seconds);
  const slight = (d == null || d <= SLIGHT) && (t == null || t <= SLIGHT);
  return { run: best.run, kind: slight ? "slight" : "big" };
}

/**
 * The logged numbers win; Garmin only fills blanks. Pace follows the logged
 * distance and time when both are there, so it can't contradict them.
 */
function keepLogged(run: Record<string, unknown>, garmin: Mapped["fields"]): Mapped["fields"] {
  const out = Object.fromEntries(Object.entries(garmin).map(([k, v]) => [k, run[k] ?? v])) as Mapped["fields"];
  const miles = run.distance_miles == null ? null : Number(run.distance_miles);
  const secs = run.duration_seconds == null ? null : Number(run.duration_seconds);
  if (run.pace_seconds_per_mile == null && miles && secs) out.pace_seconds_per_mile = Math.round(secs / miles);
  return out;
}

/** Planned run type per date, from the stored week plans. */
async function plannedTypes(dateKeys: string[]): Promise<Map<string, RunType>> {
  const out = new Map<string, RunType>();
  if (!dateKeys.length) return out;
  const { data } = await supabaseAdmin()
    .from("week_plans")
    .select("sessions, assignments")
    .gte("week_start", localDateKey(shiftDays(new Date(`${dateKeys.slice().sort()[0]}T12:00:00Z`), -7)));
  for (const row of data ?? []) {
    const sessions = (row.sessions ?? []) as PlanSession[];
    for (const [sessionId, date] of Object.entries((row.assignments ?? {}) as Record<string, string>)) {
      const s = sessions.find((x) => x.id === sessionId);
      const run = s ? plannedRunFor(s) : null;
      if (run && dateKeys.includes(date)) out.set(date, run.type);
    }
  }
  return out;
}

async function readState(): Promise<SyncState> {
  const { data } = await supabaseAdmin().from("sync_state").select("value").eq("key", "garmin").maybeSingle();
  return (data?.value ?? {}) as SyncState;
}

async function writeState(state: SyncState) {
  await supabaseAdmin()
    .from("sync_state")
    .upsert({ key: "garmin", value: state, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Imports one batch of Garmin activities. Returns counts. */
async function importActivities(activities: GarminActivity[], opts: { fresh: boolean }) {
  const db = supabaseAdmin();
  const counts = { imported: 0, merged: 0, linked: 0 };
  const mapped = activities.filter(isRun).map(mapActivity).filter((m): m is Mapped => !!m);
  if (!mapped.length) return counts;

  const { data: existing } = await db
    .from("runs")
    .select("garmin_activity_id")
    .in("garmin_activity_id", mapped.map((m) => m.activityId));
  const known = new Set((existing ?? []).map((r) => Number(r.garmin_activity_id)));
  // Garmin runs deleted in the app stay deleted.
  for (const id of await ignoredGarminIds()) known.add(id);
  const fresh = mapped.filter((m) => !known.has(m.activityId)).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  if (!fresh.length) return counts;

  const types = await plannedTypes(Array.from(new Set(fresh.map((m) => m.dateKey))));
  const pendingCutoff = shiftDays(new Date(), -PENDING_WITHIN_DAYS).toISOString();

  for (const g of fresh) {
    // Hand-logged, not-yet-linked runs on the same local day.
    const dayStart = new Date(`${g.dateKey}T00:00:00`);
    const { data: sameDay } = await db
      .from("runs")
      .select("*")
      .is("garmin_activity_id", null)
      .gte("logged_at", shiftDays(dayStart, -1).toISOString())
      .lte("logged_at", shiftDays(dayStart, 2).toISOString());
    const candidates = ((sameDay ?? []) as ManualRun[]).filter((r) => localDateKey(new Date(r.logged_at)) === g.dateKey);
    const match = matchManual(g, candidates);

    if (match) {
      const run = match.run as Record<string, unknown>;
      const fields =
        match.kind === "slight"
          ? { ...g.fields, calories: g.fields.calories ?? (run.calories as number | null) }
          : keepLogged(run, g.fields);
      const structured = {
        run_type: (run.run_type as string) || types.get(g.dateKey) || "Other",
        ...fields,
        notes: (run.notes as string) ?? null,
      } as StructuredRunInput;
      const summary = composeRunSummary(structured);
      const { error } = await db
        .from("runs")
        .update({
          ...fields,
          surface: run.surface ?? g.surface,
          garmin_activity_id: g.activityId,
          garmin_data: { ...g.extras, matched: match.kind },
          raw_text: summary,
          summary,
        })
        .eq("id", run.id);
      if (!error) counts[match.kind === "slight" ? "merged" : "linked"]++;
      continue;
    }

    // A new run.
    const runType = types.get(g.dateKey) ?? typeFromPace(g.fields.distance_miles, g.fields.pace_seconds_per_mile);
    const { data: lastShoes } = await db
      .from("runs")
      .select("shoes")
      .not("shoes", "is", null)
      .lt("logged_at", g.loggedAt)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const structured: StructuredRunInput = {
      run_type: runType,
      ...g.fields,
      temp_f: null,
      humidity_pct: null,
      surface: g.surface,
      notes: g.noteLine,
      feel: null,
      intervals: null,
    };

    const pending = opts.fresh && g.loggedAt >= pendingCutoff;
    if (pending) {
      // A new run is in, so one still waiting is saved as it stands — with
      // coaching for its prefilled type — rather than piling up.
      const { data: waiting } = await db.from("runs").select("id").eq("review_status", "pending");
      for (const w of waiting ?? []) {
        try {
          await confirmRun(w.id as string);
        } catch {
          // Leave it pending; the next sync tries again.
        }
      }
    }
    const summary = composeRunSummary(structured);
    const { error } = await db.from("runs").insert({
      ...g.fields,
      run_type: runType,
      surface: g.surface,
      // A run awaiting review leaves notes for the athlete (the extras show on
      // the review card); a backfilled one keeps the Garmin summary line.
      notes: pending ? null : g.noteLine,
      shoes: lastShoes?.shoes ?? null,
      raw_text: summary,
      summary,
      adjustments: [],
      garmin_activity_id: g.activityId,
      garmin_data: g.extras,
      review_status: pending ? "pending" : null,
      logged_at: g.loggedAt,
      // The real start time, so it shows as "Sat, Oct 24, 7:05 AM".
      created_at: g.loggedAt,
    });
    // 23505: a parallel sync got there first.
    if (!error) counts.imported++;
  }
  return counts;
}

/**
 * One sync pass: the last week of activities (throttled to every 10 minutes
 * unless forced), then one chunk of the backfill until it's complete.
 */
export async function syncGarmin(opts: { force?: boolean } = {}): Promise<SyncResult> {
  if (!process.env.GARMIN_PERSONAL_API_KEY) {
    return { ok: false, code: "no_key", error: "Garmin isn't connected.", imported: 0, merged: 0, linked: 0, backfillDone: true };
  }
  const state = await readState();
  const backfill = state.backfill ?? { done: false, start: 0 };
  const totals = { imported: 0, merged: 0, linked: 0 };
  const add = (c: typeof totals) => {
    totals.imported += c.imported;
    totals.merged += c.merged;
    totals.linked += c.linked;
  };

  const due = opts.force || !state.lastRecentSync || Date.now() - Date.parse(state.lastRecentSync) >= THROTTLE_MS;
  if (!due && backfill.done) return { ok: true, skipped: "throttled", ...totals, backfillDone: true };

  const today = localDateKey(new Date());
  if (due) {
    const recent = (await searchActivities({
      limit: 50,
      startDate: localDateKey(shiftDays(new Date(), -RECENT_DAYS)),
      endDate: today,
    })) as GarminActivity[];
    add(await importActivities(Array.isArray(recent) ? recent : [], { fresh: true }));
    state.lastRecentSync = new Date().toISOString();
  }

  if (!backfill.done) {
    const page = (await searchActivities({ start: backfill.start, limit: BACKFILL_CHUNK, startDate: BACKFILL_FROM, endDate: today })) as GarminActivity[];
    const items = Array.isArray(page) ? page : [];
    add(await importActivities(items, { fresh: false }));
    backfill.start += items.length;
    backfill.done = items.length < BACKFILL_CHUNK;
  }
  state.backfill = backfill;
  await writeState(state);
  return { ok: true, ...totals, backfillDone: backfill.done };
}
