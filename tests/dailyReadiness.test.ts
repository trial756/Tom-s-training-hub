import { test } from "node:test";
import assert from "node:assert/strict";
import { bandFor, checkinScore, computeReadiness, loadScore, runLoad, type ReadinessRun, type ReadinessLift } from "../lib/dailyReadiness";

const TODAY = "2026-11-10";
const day = (n: number) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

// Four steady weeks: easy 4s, a mid-week quality run, a long run, three lifts.
function steadyWeeks(weeks = 4): { runs: ReadinessRun[]; lifts: ReadinessLift[] } {
  const runs: ReadinessRun[] = [];
  const lifts: ReadinessLift[] = [];
  for (let w = 0; w < weeks; w++) {
    const b = w * 7 + 1;
    runs.push({ date: day(b), type: "Easy", minutes: 40, feel: null, garminLoad: 100 });
    runs.push({ date: day(b + 2), type: "Tempo", minutes: 50, feel: null, garminLoad: 200 });
    runs.push({ date: day(b + 4), type: "Long", minutes: 120, feel: null, garminLoad: 300 });
    for (const k of [1, 3, 5]) lifts.push({ date: day(b + k), minutes: 50, intensity: "moderate" });
  }
  return { runs, lifts };
}

test("a steady month with a good check-in reads as ready", () => {
  const { runs, lifts } = steadyWeeks();
  const r = computeReadiness({ today: TODAY, runs, lifts, checkin: { sleep: 4, energy: 5, soreness: 4 }, garmin: null });
  assert.ok(r.load.ratio! > 0.9 && r.load.ratio! < 1.1, String(r.load.ratio));
  assert.equal(r.band, "push");
  assert.equal(r.estimate, false);
  assert.equal(r.reasons[0], "Slept well, feeling fresh");
});

test("a load spike after a light month drops the score and says why", () => {
  const { runs, lifts } = steadyWeeks();
  // Last week doubled: two extra long runs.
  runs.push({ date: day(2), type: "Long", minutes: 150, feel: null, garminLoad: 400 }, { date: day(4), type: "Long", minutes: 150, feel: null, garminLoad: 400 });
  const r = computeReadiness({ today: TODAY, runs, lifts, checkin: { sleep: 3, energy: 3, soreness: 3 }, garmin: null });
  assert.ok(r.load.ratio! > 1.3, String(r.load.ratio));
  assert.ok(r.reasons.some((x) => /load/i.test(x)));
  assert.ok(r.score < 60, String(r.score));
});

test("a poor check-in and a rough run mean back off, whatever the load", () => {
  const { runs, lifts } = steadyWeeks();
  runs.push({ date: day(1), type: "Easy", minutes: 40, feel: "Rough", garminLoad: 110 });
  const r = computeReadiness({ today: TODAY, runs, lifts, checkin: { sleep: 1, energy: 2, soreness: 2 }, garmin: null });
  assert.ok(r.band === "rest" || r.band === "easy", r.band);
  assert.ok(r.reasons.includes("Very sore"));
  assert.ok(r.reasons.some((x) => /rough run/.test(x)));
});

test("no check-in and no watch data is labelled an estimate; Garmin counts when present", () => {
  const { runs, lifts } = steadyWeeks();
  const est = computeReadiness({ today: TODAY, runs, lifts, checkin: null, garmin: null });
  assert.equal(est.estimate, true);
  assert.equal(est.parts.checkin, null);
  const low = computeReadiness({ today: TODAY, runs, lifts, checkin: null, garmin: { bbHigh: 25, hrvLastNight: 30, hrvWeeklyAvg: 40 } });
  assert.equal(low.estimate, false);
  assert.ok(low.score < est.score);
  assert.ok(low.reasons.some((x) => /Body Battery/.test(x)));
});

test("today's own training doesn't count against this morning", () => {
  const { runs, lifts } = steadyWeeks();
  const before = computeReadiness({ today: TODAY, runs, lifts, checkin: null, garmin: null });
  const after = computeReadiness({ today: TODAY, runs: [...runs, { date: TODAY, type: "Long", minutes: 180, feel: null, garminLoad: 500 }], lifts, checkin: null, garmin: null });
  assert.equal(after.score, before.score);
});

test("building blocks", () => {
  assert.equal(runLoad({ date: TODAY, type: "Easy", minutes: 40, feel: null, garminLoad: null }), 40 * 3 * 0.7);
  assert.equal(loadScore(1.0) > loadScore(1.4), true);
  assert.equal(loadScore(0.5), 88);
  assert.equal(checkinScore({ sleep: 5, energy: 5, soreness: 5 }), 100);
  assert.equal(bandFor(80).band, "push");
  assert.equal(bandFor(30).band, "rest");
});
