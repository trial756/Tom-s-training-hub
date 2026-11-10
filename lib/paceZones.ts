import type { RunType } from "@/lib/types";

// ── Pace zones and heart-rate caps from the athlete's own runs ────────
//
// Two anchors, each from the best evidence there is:
//
//   • Heart rate. Max HR is the highest a run has recorded in the last year
//     (185, Jul 2026); the easy cap is 80% of it and the long-run cap 84%.
//   • Pace. Easy and long paces are what the athlete actually runs at those
//     caps — a recency-weighted fit of pace against average HR over recent
//     steady runs. Quality paces (MP, tempo, intervals, race) hang off a
//     reference marathon pace: the race goal's pace while a race block is on,
//     otherwise an estimate from the best recent run (Riegel), labelled as such.
//
// Pure and client-safe: the server loads the runs and goal, the plan carries
// the result, and every surface reads paces from it.

export interface PaceRange {
  low: number; // fastest, s/mi
  high: number; // slowest, s/mi
}

export interface ZoneRun {
  date: string; // local date key
  type: string | null;
  miles: number | null;
  /** Average pace, s/mi. */
  pace: number | null;
  avgHr: number | null;
  maxHr: number | null;
}

export interface PaceZones {
  zones: Record<RunType, PaceRange | null>;
  maxHr: number;
  maxHrSource: "runs" | "default";
  easyHrCap: number;
  longHrCap: number;
  /** Reference marathon pace every quality zone hangs off. */
  mpPace: number;
  mpSource: "goal" | "fitness" | "default";
  /** What the reference is, in words: "Dallas Marathon goal (3:30:00)". */
  mpLabel: string;
  /** Where the easy and long paces came from. */
  easySource: "runs" | "default";
  /** Steady runs the HR fit used, and the pace it gives at each cap. */
  fit: { runs: number; paceAtEasyCap: number; paceAtLongCap: number } | null;
}

export const DEFAULT_MAX_HR = 185;
export const DEFAULT_MP = 8 * 60 + 1; // 8:01/mi — the Dallas goal
export const EASY_HR_FRACTION = 0.8;
export const LONG_HR_FRACTION = 0.84;

const MARATHON_MI = 26.2;
const FIT_WINDOW_DAYS = 90;
const FITNESS_WINDOW_DAYS = 84;
const HALF_LIFE_DAYS = 30;
const MIN_FIT_RUNS = 6;
const QUALITY = new Set(["Tempo", "Interval", "Marathon Pace", "Race"]);

/** Zones as fixed offsets from a marathon pace — 8:01 gives the original table. */
export function zonesFromMp(mp: number): Record<RunType, PaceRange | null> {
  const r = (low: number, high: number) => ({ low: mp + low, high: mp + high });
  return {
    Easy: r(89, 149), // 9:30–10:30 at 8:01
    Long: r(59, 89), // 9:00–9:30
    "Marathon Pace": r(0, 0),
    Tempo: r(-41, -21), // 7:20–7:40
    Interval: r(-61, -21), // 7:00–7:40
    Race: r(0, 0),
    Other: null,
  };
}

export const DEFAULT_PACE_ZONES: PaceZones = {
  zones: zonesFromMp(DEFAULT_MP),
  maxHr: DEFAULT_MAX_HR,
  maxHrSource: "default",
  easyHrCap: Math.round(DEFAULT_MAX_HR * EASY_HR_FRACTION),
  longHrCap: Math.round(DEFAULT_MAX_HR * LONG_HR_FRACTION),
  mpPace: DEFAULT_MP,
  mpSource: "default",
  mpLabel: "3:30 marathon goal",
  easySource: "default",
  fit: null,
};

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
const round5 = (s: number) => Math.round(s / 5) * 5;

/** Riegel: the pace at `toMi` that matches `pace` held for `fromMi`. */
export function riegelPace(pace: number, fromMi: number, toMi: number): number {
  return pace * Math.pow(toMi / fromMi, 0.06);
}

/** Weighted least squares of pace on HR. Null without a usable downward slope. */
function fitPaceOnHr(points: { hr: number; pace: number; w: number }[]): { a: number; b: number } | null {
  const W = points.reduce((s, p) => s + p.w, 0);
  if (!W) return null;
  const mx = points.reduce((s, p) => s + p.w * p.hr, 0) / W;
  const my = points.reduce((s, p) => s + p.w * p.pace, 0) / W;
  const sxx = points.reduce((s, p) => s + p.w * (p.hr - mx) ** 2, 0);
  const sxy = points.reduce((s, p) => s + p.w * (p.hr - mx) * (p.pace - my), 0);
  if (sxx <= 0) return null;
  const b = sxy / sxx;
  // Faster pace should mean higher heart rate; a flat or reversed fit is noise.
  if (b >= -0.5) return null;
  return { a: my - b * mx, b };
}

export interface PaceZoneInput {
  runs: ZoneRun[];
  today: string;
  /** The race the current block builds toward, if it has a target time. */
  goal?: { title: string; distanceMi: number; paceSeconds: number; targetSeconds: number } | null;
}

export function computePaceZones({ runs, today, goal }: PaceZoneInput): PaceZones {
  const ago = (d: string) => daysBetween(d, today);

  // ── Heart rate ──
  const maxes = runs
    .filter((r) => r.maxHr && r.maxHr >= 150 && r.maxHr <= 215 && ago(r.date) <= 365 && ago(r.date) >= 0)
    .map((r) => r.maxHr!);
  const maxHr = maxes.length ? Math.max(...maxes) : DEFAULT_MAX_HR;
  const easyHrCap = Math.round(maxHr * EASY_HR_FRACTION);
  const longHrCap = Math.round(maxHr * LONG_HR_FRACTION);

  // ── Reference marathon pace ──
  let mpPace = DEFAULT_MP;
  let mpSource: PaceZones["mpSource"] = "default";
  let mpLabel = DEFAULT_PACE_ZONES.mpLabel;
  if (goal && goal.distanceMi > 0 && goal.paceSeconds > 0) {
    mpPace = Math.round(riegelPace(goal.paceSeconds, goal.distanceMi, MARATHON_MI));
    mpSource = "goal";
    const h = Math.floor(goal.targetSeconds / 3600);
    const m = Math.floor((goal.targetSeconds % 3600) / 60);
    const s = goal.targetSeconds % 60;
    const clock = `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(s).padStart(2, "0")}`;
    mpLabel = `${goal.title} goal (${clock})`;
  } else {
    // Best recent effort, carried to the marathon. A training run isn't a
    // race, so this errs slow — which is the safe side for setting paces.
    const best = runs
      .filter((r) => r.miles && r.miles >= 3 && r.pace && r.pace > 240 && ago(r.date) >= 0 && ago(r.date) <= FITNESS_WINDOW_DAYS)
      .map((r) => riegelPace(r.pace!, r.miles!, MARATHON_MI))
      .sort((a, b) => a - b)[0];
    if (best) {
      mpPace = Math.round(best);
      mpSource = "fitness";
      mpLabel = "estimate from your best run in the last 12 weeks";
    }
  }
  const zones = zonesFromMp(mpPace);
  if (goal && mpSource === "goal") zones.Race = { low: goal.paceSeconds, high: goal.paceSeconds };

  // ── Easy and long paces from the HR fit ──
  const steady = runs.filter(
    (r) =>
      r.avgHr &&
      r.pace &&
      r.miles &&
      r.miles >= 3 &&
      r.avgHr >= 110 &&
      r.avgHr <= maxHr * 0.95 &&
      r.pace >= 6 * 60 &&
      r.pace <= 14 * 60 &&
      !QUALITY.has(r.type ?? "") &&
      ago(r.date) >= 0 &&
      ago(r.date) <= FIT_WINDOW_DAYS
  );
  let fit: PaceZones["fit"] = null;
  let easySource: PaceZones["easySource"] = "default";
  if (steady.length >= MIN_FIT_RUNS) {
    const line = fitPaceOnHr(
      steady.map((r) => ({ hr: r.avgHr!, pace: r.pace!, w: Math.pow(0.5, ago(r.date) / HALF_LIFE_DAYS) }))
    );
    if (line) {
      // Keep the easy pace sensible against MP whatever the fit says: never
      // quicker than MP + 0:45, never slower than MP + 3:00.
      const clamp = (s: number) => Math.min(mpPace + 180, Math.max(mpPace + 45, s));
      const atEasy = clamp(line.a + line.b * easyHrCap);
      const atLong = clamp(line.a + line.b * longHrCap);
      fit = { runs: steady.length, paceAtEasyCap: Math.round(atEasy), paceAtLongCap: Math.round(atLong) };
      easySource = "runs";
      zones.Easy = { low: round5(atEasy - 15), high: round5(atEasy + 45) };
      const longLow = round5(Math.min(atLong, atEasy - 15));
      zones.Long = { low: longLow, high: Math.max(longLow, Math.min(round5(atLong + 30), zones.Easy.high)) };
    }
  }

  return { zones, maxHr, maxHrSource: maxes.length ? "runs" : "default", easyHrCap, longHrCap, mpPace, mpSource, mpLabel, easySource, fit };
}
