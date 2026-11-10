import { test } from "node:test";
import assert from "node:assert/strict";
import { computePaceZones, DEFAULT_PACE_ZONES, riegelPace, type ZoneRun } from "../lib/paceZones";
import { plannedRunFor } from "../lib/planner/runPlan";
import type { PlanSession } from "../lib/planner/types";
import { weightSummary, parseWeight } from "../lib/weight";

const TODAY = "2026-11-10";
const DALLAS = { title: "Dallas Marathon", distanceMi: 26.2, paceSeconds: 481, targetSeconds: 12600 };
const day = (n: number) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

test("no runs: the original table — 8:01 goal, 9:30–10:30 easy, caps 148/155", () => {
  const z = computePaceZones({ runs: [], today: TODAY, goal: DALLAS });
  assert.equal(z.easyHrCap, 148);
  assert.equal(z.longHrCap, 155);
  assert.deepEqual(z.zones.Easy, { low: 570, high: 630 });
  assert.deepEqual(z.zones.Long, { low: 540, high: 570 });
  assert.deepEqual(z.zones.Tempo, { low: 440, high: 460 });
  assert.deepEqual(z.zones["Marathon Pace"], { low: 481, high: 481 });
  assert.equal(z.mpSource, "goal");
  assert.equal(z.easySource, "default");
  assert.deepEqual(DEFAULT_PACE_ZONES.zones.Easy, { low: 570, high: 630 });
});

test("max HR is the highest a run recorded this year; caps follow it", () => {
  const runs: ZoneRun[] = [
    { date: day(10), type: "Long", miles: 10, pace: 560, avgHr: 160, maxHr: 190 },
    { date: day(400), type: "Race", miles: 3.1, pace: 450, avgHr: 180, maxHr: 199 }, // over a year ago
    { date: day(20), type: "Easy", miles: 3, pace: 600, avgHr: 150, maxHr: 240 }, // a strap glitch
  ];
  const z = computePaceZones({ runs, today: TODAY, goal: DALLAS });
  assert.equal(z.maxHr, 190);
  assert.equal(z.easyHrCap, 152);
  assert.equal(z.longHrCap, 160);
});

test("easy and long paces come from what the runs hold at the caps", () => {
  // pace = 1800 − 8 × HR: 616 s/mi (10:16) at 148, 560 (9:20) at 155.
  const runs: ZoneRun[] = [140, 144, 148, 152, 156, 160, 164].map((hr, i) => ({
    date: day(i * 5 + 1),
    type: i % 2 ? "Easy" : "Long",
    miles: 5,
    pace: 1800 - 8 * hr,
    avgHr: hr,
    maxHr: 185,
  }));
  const z = computePaceZones({ runs, today: TODAY, goal: DALLAS });
  assert.equal(z.easySource, "runs");
  assert.equal(z.fit?.paceAtEasyCap, 616);
  assert.equal(z.fit?.paceAtLongCap, 560);
  assert.deepEqual(z.zones.Easy, { low: 600, high: 660 });
  assert.deepEqual(z.zones.Long, { low: 560, high: 590 });
  // Quality paces still follow the goal.
  assert.deepEqual(z.zones.Tempo, { low: 440, high: 460 });
});

test("quality runs, short runs and old runs stay out of the easy fit", () => {
  const quality: ZoneRun[] = [150, 155, 160, 165, 170, 175].map((hr, i) => ({
    date: day(i + 1),
    type: "Tempo",
    miles: 5,
    pace: 1800 - 8 * hr,
    avgHr: hr,
    maxHr: 185,
  }));
  const short = quality.map((r) => ({ ...r, type: "Easy", miles: 2 }));
  const old = quality.map((r) => ({ ...r, type: "Easy", date: day(120) }));
  const z = computePaceZones({ runs: [...quality, ...short, ...old], today: TODAY, goal: DALLAS });
  assert.equal(z.easySource, "default");
  assert.equal(z.fit, null);
});

test("an easy pace the fit puts absurdly fast or slow is clamped against MP", () => {
  // Steep fit: at 148 this says 14:00+; clamp to MP + 3:00.
  const runs: ZoneRun[] = [150, 152, 154, 156, 158, 160].map((hr, i) => ({
    date: day(i + 1),
    type: "Easy",
    miles: 4,
    pace: Math.min(840, 600 + (160 - hr) * 40),
    avgHr: hr,
    maxHr: 185,
  }));
  const z = computePaceZones({ runs, today: TODAY, goal: DALLAS });
  assert.ok(z.fit!.paceAtEasyCap <= 481 + 180);
});

test("outside a race block, marathon pace is estimated from the best recent run", () => {
  const runs: ZoneRun[] = [
    { date: day(3), type: "Long", miles: 16, pace: 515, avgHr: 170, maxHr: 183 },
    { date: day(100), type: "Other", miles: 5, pace: 420, avgHr: 175, maxHr: 185 }, // outside 12 weeks
  ];
  const z = computePaceZones({ runs, today: TODAY, goal: null });
  assert.equal(z.mpSource, "fitness");
  assert.equal(z.mpPace, Math.round(riegelPace(515, 16, 26.2)));
  assert.ok(z.mpPace > 515);
});

test("a half-marathon goal sets race pace to the goal and MP by Riegel", () => {
  const half = { title: "Half", distanceMi: 13.1, paceSeconds: 450, targetSeconds: 5895 };
  const z = computePaceZones({ runs: [], today: TODAY, goal: half });
  assert.deepEqual(z.zones.Race, { low: 450, high: 450 });
  assert.equal(z.mpPace, Math.round(450 * Math.pow(2, 0.06)));
});

test("the plan reads paces and HR caps from the zones it is given", () => {
  const session: PlanSession = {
    id: "s1",
    kind: "run",
    title: "Easy 4 mi",
    rationale: "",
    regions: [],
    exercises: [],
    priority: 1,
    preferredDow: null,
    taxesLegs: false,
    miles: 4,
    run: { type: "Easy", structure: null },
  };
  assert.equal(plannedRunFor(session)?.hrCap, 148);
  const zones = { ...DEFAULT_PACE_ZONES, easyHrCap: 150, zones: { ...DEFAULT_PACE_ZONES.zones, Easy: { low: 600, high: 660 } } };
  const run = plannedRunFor(session, zones)!;
  assert.equal(run.hrCap, 150);
  assert.deepEqual(run.pace, { low: 600, high: 660 });
  const tempo = plannedRunFor({ ...session, title: "Tempo: 1 + 3 + 1", run: { type: "Tempo", structure: "1 mi easy · 3 mi tempo · 1 mi easy" } }, zones)!;
  assert.deepEqual(tempo.easyPace, { low: 600, high: 660 });
  assert.equal(tempo.hrCap, null);
});

test("weight trend smooths daily swings and reports the four-week rate", () => {
  const s = weightSummary([
    { date: "2026-02-01", weight_lb: 173, note: null },
    { date: "2026-10-13", weight_lb: 161, note: null },
    { date: "2026-10-20", weight_lb: 160, note: null },
    { date: "2026-10-27", weight_lb: 159, note: null },
    { date: "2026-11-03", weight_lb: 159.5, note: null },
    { date: "2026-11-10", weight_lb: 158, note: null },
  ]);
  assert.equal(s.latest?.weight_lb, 158);
  assert.equal(s.changeSinceStart, -15);
  // The trend lags the scale on a sudden drop.
  assert.ok(s.latest!.trend > 158 && s.latest!.trend < 160);
  assert.ok(s.ratePerWeek! < -0.5 && s.ratePerWeek! > -1.5);
  assert.equal(weightSummary([{ date: "2026-11-10", weight_lb: 158, note: null }]).ratePerWeek, null);
  assert.equal(parseWeight("158.44"), 158.4);
  assert.equal(parseWeight("1584"), null);
  assert.equal(parseWeight(""), null);
});
