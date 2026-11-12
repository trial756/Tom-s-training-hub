import { test } from "node:test";
import assert from "node:assert/strict";
import { calorieTarget, observedBaseline, runCalories } from "../lib/calories";

const base = { bodyweightLb: 158, trendLb: 158, goalLb: 155, trainingCal: 0, isLongRunDay: false, raceSeason: false, observed: null };

test("race season eats to maintenance, whatever the goal", () => {
  const t = calorieTarget({ ...base, raceSeason: true, trainingCal: 700 });
  assert.equal(t.mode, "fuel");
  assert.equal(t.adjustment, 0);
  assert.equal(t.target, 2210 + 700); // 158 × 14 = 2212 → 2210
});

test("above the goal: a 350 deficit, but not on a long-run day", () => {
  const t = calorieTarget({ ...base, trainingCal: 400 });
  assert.equal(t.mode, "trim");
  assert.equal(t.target, 2210 + 400 - 350);
  assert.match(t.reason, /3\.0 to go/);
  const long = calorieTarget({ ...base, trainingCal: 1600, isLongRunDay: true });
  assert.equal(long.adjustment, 0);
});

test("at the goal: a small surplus to build", () => {
  const t = calorieTarget({ ...base, trendLb: 155.2, bodyweightLb: 155 });
  assert.equal(t.mode, "build");
  assert.equal(t.adjustment, 200);
});

test("the log corrects the baseline once there's enough of it, within 400", () => {
  const weighIns = [
    { date: "2026-12-20", weight_lb: 158 },
    { date: "2026-12-27", weight_lb: 157.5 },
    { date: "2027-01-03", weight_lb: 157 },
    { date: "2027-01-10", weight_lb: 156.5 },
  ];
  const intake = Array.from({ length: 20 }, (_, i) => ({ day: `d${i}`, cal: 2600 }));
  const obs = observedBaseline({ weighIns, intake, avgTrainingCal: 500, windowDays: 28 })!;
  // Losing 0.5 lb/week ≈ 250 cal/day deficit: TDEE ≈ 2850, baseline ≈ 2350.
  assert.ok(Math.abs(obs.baselineCal - 2350) < 10, String(obs.baselineCal));
  const t = calorieTarget({ ...base, observed: obs });
  assert.equal(t.baselineSource, "log");
  assert.equal(t.baseline, 2280); // halfway between 2212 and 2350
  // Too few weigh-ins or logged days: no measurement.
  assert.equal(observedBaseline({ weighIns: weighIns.slice(0, 2), intake, avgTrainingCal: 500, windowDays: 28 }), null);
  assert.equal(observedBaseline({ weighIns, intake: intake.slice(0, 10), avgTrainingCal: 500, windowDays: 28 }), null);
});

test("running calories scale with distance and weight", () => {
  assert.equal(runCalories(16, 158), 1593);
});
