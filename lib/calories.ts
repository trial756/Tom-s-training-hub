// ── Daily calorie target ──────────────────────────────────────────────
//
// Tom's body goal (Nov 2026): about 155 lb while adding muscle, at 5'8".
// The target is maintenance for the day plus an adjustment for the phase:
//
//   • fuel   — inside the last six weeks before an A/B race (peak + taper) and
//              the recovery after it: eat to maintenance. A cut in peak and
//              taper costs more on race day than the pounds are worth.
//   • trim   — otherwise, while the weight trend is above the goal:
//              −350 a day (about 0.7 lb a week), but not on long-run days.
//   • build  — at the goal: +200 a day for lean gain.
//
// Maintenance = a non-exercise baseline + the day's training. The baseline
// starts as 14 cal per lb (light daily activity) and, once there's enough
// data — 4+ weigh-ins over 21+ days and meals logged on 60%+ of those days —
// is corrected toward what the log shows: average intake minus what the
// weight trend says was stored or burned, minus average training. Pure.

export type CalorieMode = "fuel" | "trim" | "build";

export interface CalorieInput {
  bodyweightLb: number;
  /** Smoothed weight (lib/weight.ts trend), or the latest weigh-in. */
  trendLb: number;
  goalLb: number;
  /** Calories from today's runs and lifts — logged, else planned. */
  trainingCal: number;
  isLongRunDay: boolean;
  /** An A/B race within 42 days (peak + taper), or its recovery weeks. */
  raceSeason: boolean;
  /** Measured from the log, when there's enough of it. */
  observed?: { baselineCal: number; days: number } | null;
}

export interface CalorieTarget {
  target: number;
  maintenance: number;
  baseline: number;
  baselineSource: "estimate" | "log";
  training: number;
  adjustment: number;
  mode: CalorieMode;
  /** One line on why the target is what it is today. */
  reason: string;
}

export const BASELINE_PER_LB = 14;
export const TRIM_DEFICIT = 350;
export const BUILD_SURPLUS = 200;

/** Running burns roughly 0.63 cal per lb of bodyweight per mile (~100 at 158 lb). */
export const runCalories = (miles: number, lb: number) => Math.round(miles * lb * 0.63);
/** A lift session without its own estimate. */
export const LIFT_CAL = 250;

const round10 = (n: number) => Math.round(n / 10) * 10;

export function calorieTarget(i: CalorieInput): CalorieTarget {
  const estimate = i.bodyweightLb * BASELINE_PER_LB;
  // Blend the measured baseline in, but never let a noisy month move it more than 400.
  const measured = i.observed && i.observed.days >= 14 ? Math.max(estimate - 400, Math.min(estimate + 400, i.observed.baselineCal)) : null;
  const baseline = round10(measured != null ? (estimate + measured) / 2 : estimate);
  const training = round10(i.trainingCal);
  const maintenance = baseline + training;

  let mode: CalorieMode;
  let adjustment: number;
  let reason: string;
  const toGo = i.trendLb - i.goalLb;
  if (i.raceSeason) {
    mode = "fuel";
    adjustment = 0;
    reason = "Race season: eat to maintenance — a cut now costs more on race day than it saves.";
  } else if (toGo > 0.5) {
    mode = "trim";
    adjustment = i.isLongRunDay ? 0 : -TRIM_DEFICIT;
    reason = i.isLongRunDay
      ? `Trimming toward ${i.goalLb} lb (${toGo.toFixed(1)} to go), but not on a long-run day.`
      : `Trimming toward ${i.goalLb} lb: ${toGo.toFixed(1)} to go at about 0.7 lb a week.`;
  } else {
    mode = "build";
    adjustment = BUILD_SURPLUS;
    reason = `At ${i.goalLb} lb: a small surplus to build muscle.`;
  }
  return {
    target: round10(maintenance + adjustment),
    maintenance,
    baseline,
    baselineSource: measured != null ? "log" : "estimate",
    training,
    adjustment,
    mode,
    reason,
  };
}

/**
 * The baseline the log implies: average intake on logged days, minus the
 * energy the weight change accounts for (3,500 cal per lb), minus average
 * training. Null without enough weigh-ins or logged days.
 */
export function observedBaseline(input: {
  weighIns: { date: string; weight_lb: number }[];
  /** Calories eaten per logged day, and training calories per day, over the window. */
  intake: { day: string; cal: number }[];
  avgTrainingCal: number;
  windowDays: number;
}): { baselineCal: number; days: number } | null {
  const w = input.weighIns.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 4) return null;
  const span = (Date.parse(w[w.length - 1].date) - Date.parse(w[0].date)) / 86_400_000;
  if (span < 21) return null;
  if (input.intake.length < input.windowDays * 0.6) return null;
  // Least-squares slope, lb per day.
  const xs = w.map((p) => Date.parse(p.date) / 86_400_000);
  const ys = w.map((p) => p.weight_lb);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = sxx > 0 ? xs.reduce((s, x, k) => s + (x - mx) * (ys[k] - my), 0) / sxx : 0;
  const avgIntake = input.intake.reduce((s, d) => s + d.cal, 0) / input.intake.length;
  const tdee = avgIntake - slope * 3500;
  return { baselineCal: Math.round(tdee - input.avgTrainingCal), days: input.intake.length };
}
