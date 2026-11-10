import { test } from "node:test";
import assert from "node:assert/strict";
import { blockForWeek, DEFAULT_GOALS, nextRace, type Goal } from "@/lib/goals";
import { buildMarathonPlan } from "@/lib/marathonPlan";
import { strengthDoseFor } from "@/lib/planner/strength";

test("the Dallas build is unchanged week for week", () => {
  for (const w of buildMarathonPlan()) {
    const b = blockForWeek(DEFAULT_GOALS, w.startDate, w.startDate);
    assert.equal(b.kind, "race", w.startDate);
    assert.equal(b.race?.planWeek, w.weekNumber);
    assert.equal(b.race?.weeklyMileage, w.weeklyMileage);
    assert.equal(b.race?.longRunMiles, w.longRunMiles);
    assert.equal(b.race?.isRaceWeek, w.isRaceWeek);
  }
});

test("after Dallas: two recovery weeks, then the athleticism focus", () => {
  assert.equal(blockForWeek(DEFAULT_GOALS, "2026-12-13", "2026-12-13").kind, "recovery");
  assert.equal(blockForWeek(DEFAULT_GOALS, "2026-12-20", "2026-12-20").kind, "recovery");
  const after = blockForWeek(DEFAULT_GOALS, "2026-12-27", "2026-12-27");
  assert.equal(after.kind, "focus");
  assert.equal(after.goal?.title, "Muscle & athleticism");
});

test("the half for fun gets no block, only a heads-up in the weeks before it", () => {
  const b = blockForWeek(DEFAULT_GOALS, "2027-02-21", "2027-02-21");
  assert.equal(b.kind, "focus");
  assert.equal(b.race, null);
  assert.equal(b.upcoming[0]?.title, "Half marathon");
  assert.equal(blockForWeek(DEFAULT_GOALS, "2027-01-03", "2027-01-03").upcoming.length, 0);
});

test("a new B race gets a generated build that peaks and tapers", () => {
  const tenK: Goal = { id: "x", kind: "race", title: "Spring 10K", date: "2027-04-18", priority: "B", distance_mi: 6.2, target_seconds: 45 * 60 };
  const goals = [...DEFAULT_GOALS, tenK];
  const weeks = ["2027-02-21", "2027-02-28", "2027-03-07", "2027-03-14", "2027-03-21", "2027-03-28", "2027-04-04", "2027-04-11"]
    .map((d) => blockForWeek(goals, d, d));
  assert.ok(weeks.every((b) => b.kind === "race" && b.goal?.title === "Spring 10K"), "8-week build");
  assert.equal(weeks[7].race?.isRaceWeek, true);
  assert.equal(weeks[7].race?.phase, "Taper");
  assert.ok(weeks[6].race!.weeklyMileage > weeks[0].race!.weeklyMileage, "volume builds");
  assert.equal(blockForWeek(goals, "2027-02-14", "2027-02-14").kind, "focus", "before the build, the focus holds");
  assert.equal(blockForWeek(goals, "2027-04-18", "2027-04-18").kind, "focus", "no recovery weeks after a 10K");
});

test("no goals at all means general fitness", () => {
  const b = blockForWeek([{ ...DEFAULT_GOALS[0], status: "done" }], "2027-06-06", "2027-06-06");
  assert.equal(b.kind, "base");
});

test("the countdown follows the next race", () => {
  assert.equal(nextRace(DEFAULT_GOALS, "2026-11-10")?.title, "Dallas Marathon");
  assert.equal(nextRace(DEFAULT_GOALS, "2026-12-14")?.title, "Half marathon");
});

test("recovery and focus weeks set the lifting dose", () => {
  assert.equal(strengthDoseFor({ marathon: null, block: { kind: "recovery", focus: null }, liftDaysPerWeek: 4 }).heavyLower, 0);
  assert.equal(strengthDoseFor({ marathon: null, block: { kind: "focus", focus: "athleticism" }, liftDaysPerWeek: 4 }).mode, "build");
});
