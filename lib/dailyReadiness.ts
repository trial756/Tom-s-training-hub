// ── Daily readiness ───────────────────────────────────────────────────
//
// One number for "push today or back off", built from what there actually
// is. (lib/readiness.ts is the other readiness: the 3:30 marathon goal.)
//
//   • Check-in (sleep, energy, soreness, 1–5 each). A short self-report is
//     the best-validated readiness signal there is, and the only one there
//     every day — the watch is mostly worn for runs, so Body Battery is there
//     about one day in three and overnight HRV almost never (Nov 2026).
//   • Load balance: the last 7 days' training load against the 28-day
//     average week (acute:chronic). Runs use Garmin's training load when the
//     run has it, else minutes × effort; lifts are minutes × effort × 0.5.
//   • Garmin, on days it has data: the morning Body Battery high, and
//     last night's HRV against its weekly average.
//
// Each part is 0–100; the score is their weighted average over the parts
// available (check-in 50, load 30, Garmin 20), less a few points for a
// tough or rough run in the last two days. Pure, so it's tested directly.

export interface ReadinessRun {
  date: string;
  type: string | null;
  minutes: number | null;
  feel: string | null;
  /** Garmin's training load for the run, when it came from the watch. */
  garminLoad: number | null;
}

export interface ReadinessLift {
  date: string;
  minutes: number | null;
  intensity: string | null;
}

export interface CheckIn {
  sleep: number;
  energy: number;
  soreness: number;
  note?: string | null;
}

export interface GarminDay {
  bbHigh: number | null;
  hrvLastNight: number | null;
  hrvWeeklyAvg: number | null;
}

export type Band = "push" | "normal" | "easy" | "rest";

export interface Readiness {
  score: number;
  band: Band;
  label: string;
  /** The parts that went into the score (null when there was nothing to go on). */
  parts: { checkin: number | null; load: number | null; garmin: number | null };
  load: { acute: number; chronicWeek: number; ratio: number | null };
  /** Short reasons, most important first. */
  reasons: string[];
  /** True when only training load was available — no check-in, no Garmin. */
  estimate: boolean;
}

const RUN_EFFORT: Record<string, number> = { Easy: 3, Long: 5, Tempo: 7, "Marathon Pace": 7, Interval: 8, Race: 9, Other: 4 };
const LIFT_EFFORT: Record<string, number> = { low: 3, moderate: 5, high: 7 };

const DAY = 86_400_000;
const dayNum = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / DAY);

export function runLoad(r: ReadinessRun): number {
  if (r.garminLoad != null && r.garminLoad > 0) return r.garminLoad;
  const effort = RUN_EFFORT[r.type ?? ""] ?? 4;
  return (r.minutes ?? 0) * effort * 0.7;
}

export function liftLoad(l: ReadinessLift): number {
  return (l.minutes ?? 45) * (LIFT_EFFORT[l.intensity ?? ""] ?? 5) * 0.5;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Acute:chronic → 0–100. 0.8–1.3 is the sweet spot; above 1.5 the injury risk climbs. */
export function loadScore(ratio: number): number {
  if (ratio <= 0.8) return 88;
  if (ratio <= 1.3) return 88 - ((ratio - 0.8) / 0.5) * 18; // 88 → 70
  if (ratio <= 1.5) return 70 - ((ratio - 1.3) / 0.2) * 25; // 70 → 45
  return clamp(45 - (ratio - 1.5) * 100, 15);
}

export function checkinScore(c: CheckIn): number {
  const avg = (c.sleep + c.energy + c.soreness) / 3;
  // The worst answer drags a little extra: one very sore day matters.
  const worst = Math.min(c.sleep, c.energy, c.soreness);
  return clamp(((avg - 1) / 4) * 100 - (worst <= 2 ? 8 : 0));
}

export function bandFor(score: number): { band: Band; label: string } {
  if (score >= 75) return { band: "push", label: "Ready to push" };
  if (score >= 55) return { band: "normal", label: "Train as planned" };
  if (score >= 35) return { band: "easy", label: "Keep it easy" };
  return { band: "rest", label: "Back off today" };
}

export function computeReadiness(input: {
  today: string;
  runs: ReadinessRun[];
  lifts: ReadinessLift[];
  checkin: CheckIn | null;
  garmin: GarminDay | null;
}): Readiness {
  const t = dayNum(input.today);
  const ago = (d: string) => t - dayNum(d);
  // Collected by source, then ordered: how you feel, a bad run, the watch, the load.
  const reasons: string[] = [];
  const feelReasons: string[] = [];
  const garminReasons: string[] = [];

  // ── Load ──
  const loads = [
    ...input.runs.map((r) => ({ ago: ago(r.date), load: runLoad(r) })),
    ...input.lifts.map((l) => ({ ago: ago(l.date), load: liftLoad(l) })),
  ].filter((x) => x.ago >= 1 && x.ago <= 28); // today's own training doesn't count against this morning
  const acute = loads.filter((x) => x.ago <= 7).reduce((s, x) => s + x.load, 0);
  const chronicWeek = loads.reduce((s, x) => s + x.load, 0) / 4;
  const ratio = chronicWeek > 50 ? acute / chronicWeek : null;
  let load: number | null = ratio == null ? null : loadScore(ratio);
  if (ratio != null) {
    if (ratio > 1.5) reasons.push(`This week's load is ${ratio.toFixed(1)}× your usual week — a big jump`);
    else if (ratio > 1.3) reasons.push(`Load is up: ${ratio.toFixed(1)}× your usual week`);
    else if (ratio < 0.8) reasons.push("A lighter week than usual — fresh legs");
    else reasons.push("Training load is in your normal range");
  }
  const yesterday = loads.filter((x) => x.ago === 1).reduce((s, x) => s + x.load, 0);
  if (load != null && chronicWeek > 0 && yesterday > chronicWeek * 0.35) {
    load = clamp(load - 10);
    reasons.push("Yesterday was a big day");
  }

  // ── Check-in ──
  const checkin = input.checkin ? checkinScore(input.checkin) : null;
  if (input.checkin) {
    const c = input.checkin;
    if (c.soreness <= 2) feelReasons.push("Very sore");
    if (c.energy <= 2) feelReasons.push("Low energy");
    if (c.sleep <= 2) feelReasons.push("Short or poor sleep");
    if (c.sleep >= 4 && c.energy >= 4 && c.soreness >= 4) feelReasons.push("Slept well, feeling fresh");
  }

  // ── Garmin ──
  let garmin: number | null = null;
  const g = input.garmin;
  if (g) {
    const parts: number[] = [];
    if (g.bbHigh != null) {
      parts.push(clamp(g.bbHigh));
      if (g.bbHigh < 40) garminReasons.push(`Body Battery only reached ${g.bbHigh}`);
    }
    if (g.hrvLastNight != null && g.hrvWeeklyAvg) {
      const rel = g.hrvLastNight / g.hrvWeeklyAvg;
      parts.push(clamp(70 + (rel - 1) * 200));
      if (rel < 0.9) garminReasons.push("HRV below your weekly average");
    }
    if (parts.length) garmin = parts.reduce((a, b) => a + b, 0) / parts.length;
  }

  // ── Recent runs that felt bad ──
  const rough = input.runs.filter((r) => ago(r.date) >= 0 && ago(r.date) <= 2 && (r.feel === "Rough" || r.feel === "Tough"));
  const penalty = rough.some((r) => r.feel === "Rough") ? 12 : rough.length ? 6 : 0;
  if (penalty) feelReasons.push(`A ${rough.some((r) => r.feel === "Rough") ? "rough" : "tough"} run in the last two days`);

  const weighted = [
    [checkin, 0.5],
    [load, 0.3],
    [garmin, 0.2],
  ].filter(([v]) => v != null) as [number, number][];
  const W = weighted.reduce((s, [, w]) => s + w, 0);
  const base = W ? weighted.reduce((s, [v, w]) => s + v * w, 0) / W : 65;
  const score = Math.round(clamp(base - penalty));

  return {
    score,
    ...bandFor(score),
    parts: { checkin: checkin == null ? null : Math.round(checkin), load: load == null ? null : Math.round(load), garmin: garmin == null ? null : Math.round(garmin) },
    load: { acute: Math.round(acute), chronicWeek: Math.round(chronicWeek), ratio: ratio == null ? null : Math.round(ratio * 100) / 100 },
    reasons: [...feelReasons, ...garminReasons, ...reasons].slice(0, 4),
    estimate: checkin == null && garmin == null,
  };
}
