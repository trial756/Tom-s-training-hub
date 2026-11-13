import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GOALS } from "@/lib/goals";
import { buildPlannerContext } from "@/lib/planner/context";
import { reconcileMileage } from "@/lib/planner/mileage";
import { patternOf } from "@/lib/planner/patterns";
import { applyRaceWeekRules, applyRecoveryRules, fixedSessionsFor, keepForOpenDays, recoveryCapsFor } from "@/lib/planner/raceDays";
import { scheduleWeek, type DayLog } from "@/lib/planner/schedule";
import { validateWeek } from "@/lib/planner/validate";
import type { PlanSession } from "@/lib/planner/types";
import { ex, session } from "./helpers";

// Nov 2026 review: the planner didn't know race day existed. Dallas is
// Sunday Dec 13 2026 — the first day of the recovery week.
const week = (start: string) =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
const RACE_WEEK = week("2026-12-06");
const AFTER = week("2026-12-13");
const noLogs = (dates: string[]): Record<string, DayLog> =>
  Object.fromEntries(dates.map((d) => [d, { hasWorkout: false, hasRun: false, summary: "", regions: [], runs: [] }]));
const titleOn = (days: { date: string; sessionId: string | null }[], sessions: PlanSession[], date: string) =>
  sessions.find((s) => s.id === days.find((d) => d.date === date)?.sessionId)?.title;

test("race day and the days around it are pinned to their dates", () => {
  const before = fixedSessionsFor(DEFAULT_GOALS, RACE_WEEK);
  assert.deepEqual(before.map((s) => [s.fixedDate, s.kind, s.miles]), [
    ["2026-12-11", "active_recovery", null],
    ["2026-12-12", "run", 2],
  ]);
  const after = fixedSessionsFor(DEFAULT_GOALS, AFTER);
  assert.deepEqual(after.map((s) => s.fixedDate), ["2026-12-13", "2026-12-14", "2026-12-15", "2026-12-16"]);
  assert.equal(after[0].run?.type, "Race");
  assert.equal(after[0].miles, 26.2);
  assert.ok(after.slice(1).every((s) => s.kind === "active_recovery" && s.miles == null), "no running for three days");
});

test("a for-fun half gets its race day, a shakeout and one day off running", () => {
  const raceWeek = fixedSessionsFor(DEFAULT_GOALS, week("2027-02-28"));
  assert.deepEqual(raceWeek.map((s) => [s.fixedDate, s.run?.type ?? s.kind]), [["2027-02-28", "Race"], ["2027-03-01", "active_recovery"]]);
  const prior = fixedSessionsFor(DEFAULT_GOALS, week("2027-02-21"));
  assert.deepEqual(prior.map((s) => [s.fixedDate, s.title]), [["2027-02-27", "Shakeout 2 mi + strides"]]);
});

test("race week: no long run, one sharpener at most, no leg lifting, nothing hard on the Saturday", () => {
  const model = [
    session("long", "run", "Long run 6mi", { runType: "Long", miles: 6, preferredDow: 6, priority: 1 }),
    session("mp", "lift_and_run", "MP intervals + Push", { runType: "Marathon Pace", miles: 7, priority: 2, exercises: [ex("Barbell Bench Press"), ex("Back Squat", 3, "5-6")] }),
    session("tempo", "run", "Tempo 5mi", { runType: "Tempo", miles: 5, priority: 3 }),
    session("pull", "lift", "Pull", { priority: 4, exercises: [ex("Bent Over Barbell Row"), ex("Box Jump", 3, "3"), ex("Strides", 1, "4 × 20 s")] }),
    session("easy", "run", "Easy 3mi + core", { runType: "Easy", miles: 3, priority: 5 }),
    session("extra", "run", "Easy 3mi", { runType: "Easy", miles: 3, priority: 6 }),
    session("extra2", "run", "Easy 2mi", { runType: "Easy", miles: 2, priority: 7 }),
  ];
  const fixed = fixedSessionsFor(DEFAULT_GOALS, RACE_WEEK);
  const ruled = applyRaceWeekRules(keepForOpenDays(model, 7 - fixed.length));
  assert.equal(ruled.length, 5, "five open days");
  assert.ok(!ruled.some((s) => s.run?.type === "Long"), "no long run");
  assert.equal(ruled.filter((s) => ["Tempo", "Interval", "Marathon Pace"].includes(s.run?.type ?? "")).length, 1);
  assert.ok(ruled.every((s) => (s.miles ?? 0) <= 5));
  const names = ruled.flatMap((s) => s.exercises.map((e) => e.name));
  assert.ok(!names.includes("Back Squat") && !names.includes("Box Jump") && names.includes("Strides"));

  const sessions = [...fixed, ...ruled];
  const days = scheduleWeek({ sessions, weekDates: RACE_WEEK, today: "2026-12-06", logs: noLogs(RACE_WEEK) });
  assert.equal(titleOn(days, sessions, "2026-12-12"), "Shakeout 2 mi + strides");
  assert.equal(titleOn(days, sessions, "2026-12-11"), "Walk + mobility");
  const sharp = days.find((d) => sessions.find((s) => s.id === d.sessionId)?.run?.type === "Marathon Pace");
  assert.ok(sharp && sharp.date <= "2026-12-08", `sharpener early in the week, got ${sharp?.date}`);
});

test("the week after: the race on Sunday, no running until Thursday, the rest fills Thu–Sat", () => {
  const fixed = fixedSessionsFor(DEFAULT_GOALS, AFTER);
  const caps = recoveryCapsFor("2026-12-13", 26.2, "2026-12-13");
  assert.deepEqual(caps, { phase: 1, maxWeekMiles: 8, maxRunMiles: 3 });
  const model = keepForOpenDays(
    [
      session("u1", "lift", "Upper A", { priority: 1, exercises: [ex("Barbell Bench Press"), ex("Standing Calf Raise")] }),
      session("r1", "run", "Tempo 6mi", { runType: "Tempo", miles: 6, priority: 2, taxesLegs: true }),
      session("u2", "lift_and_run", "Easy 5mi + Upper B", { runType: "Easy", miles: 5, priority: 3, exercises: [ex("Bent Over Barbell Row"), ex("Romanian Deadlift"), ex("Pogo Hops", 3, "15")] }),
      session("r2", "run", "Long 10mi", { runType: "Long", miles: 10, priority: 4 }),
    ],
    7 - fixed.length
  );
  const ruled = applyRecoveryRules(model, caps);
  assert.equal(ruled.length, 3);
  const runs = ruled.filter((s) => s.miles != null);
  assert.ok(runs.every((s) => s.run?.type === "Easy" && s.miles! <= 3), "easy, three miles at most");
  assert.ok(runs.reduce((a, s) => a + s.miles!, 0) <= 8);
  assert.ok(!ruled.flatMap((s) => s.exercises).some((e) => ["hinge", "squat", "power", "calf"].includes(patternOf(e.name))), "no legs in week one");

  const sessions = [...fixed, ...ruled];
  const days = scheduleWeek({ sessions, weekDates: AFTER, today: "2026-12-13", logs: noLogs(AFTER) });
  assert.equal(titleOn(days, sessions, "2026-12-13"), "Dallas Marathon — race day");
  for (const d of ["2026-12-14", "2026-12-15", "2026-12-16"]) assert.equal(titleOn(days, sessions, d), "Recovery walk + mobility");
  for (const d of days.filter((x) => x.date <= "2026-12-16" && x.date > "2026-12-13")) {
    assert.equal(sessions.find((s) => s.id === d.sessionId)?.miles ?? null, null, `no run on ${d.date}`);
  }
});

test("the marathon logged under any label counts as race day done, and isn't moved", () => {
  const fixed = fixedSessionsFor(DEFAULT_GOALS, AFTER);
  const logs = noLogs(AFTER);
  logs["2026-12-13"] = { hasWorkout: false, hasRun: true, summary: "Long 26.2", regions: [], runs: [{ type: "Long", miles: 26.2 }] };
  const days = scheduleWeek({
    sessions: [...fixed],
    weekDates: AFTER,
    today: "2026-12-14",
    logs,
    priorAssignments: Object.fromEntries(fixed.map((s) => [s.id, s.fixedDate!])),
  });
  assert.equal(days[0].status, "done");
  assert.equal(days[0].sessionId, "race-dallas-2026");
});

test("a missed race is never re-placed on a later day", () => {
  const fixed = fixedSessionsFor(DEFAULT_GOALS, AFTER);
  const days = scheduleWeek({ sessions: [...fixed], weekDates: AFTER, today: "2026-12-17", logs: noLogs(AFTER), priorAssignments: {} });
  assert.ok(!days.some((d) => d.date >= "2026-12-17" && d.sessionId === "race-dallas-2026"));
});

test("second recovery week: light legs only, runs within the caps", () => {
  const caps = recoveryCapsFor("2026-12-13", 26.2, "2026-12-20");
  assert.deepEqual(caps, { phase: 2, maxWeekMiles: 15, maxRunMiles: 6 });
  const ruled = applyRecoveryRules(
    [
      session("a", "lift", "Upper + legs", { exercises: [ex("Barbell Bench Press", 4, "5-6"), ex("Bulgarian Split Squat", 4, "6-8"), ex("Box Jump", 3, "3")] }),
      ...[1, 2, 3, 4].map((i) => session(`r${i}`, "run", `Easy ${i + 4}mi`, { runType: "Easy", miles: i + 4, priority: i })),
    ],
    caps
  );
  const squat = ruled[0].exercises.find((e) => e.name === "Bulgarian Split Squat")!;
  assert.equal(squat.sets, 2);
  assert.equal(squat.reps, "10-12");
  assert.ok(!ruled[0].exercises.some((e) => e.name === "Box Jump"));
  const miles = ruled.map((s) => s.miles ?? 0);
  assert.ok(Math.max(...miles) <= 6 && miles.reduce((a, b) => a + b, 0) <= 15, miles.join(","));
});

test("the mileage top-up and the weekly check leave pinned days alone", () => {
  const fixed = fixedSessionsFor(DEFAULT_GOALS, RACE_WEEK);
  const sessions = [
    ...fixed,
    session("u", "lift", "Upper", { priority: 1 }),
    session("e", "run", "Easy 3mi", { runType: "Easy", miles: 3, priority: 2 }),
  ];
  const days = scheduleWeek({ sessions, weekDates: RACE_WEEK, today: "2026-12-06", logs: noLogs(RACE_WEEK) });
  const out = reconcileMileage({ sessions, days, today: "2026-12-06", milesThisWeek: 0, weeklyTarget: 12, avgWeeklyMiles: 25, typicalRunMiles: 4 });
  const checked = validateWeek({ days: out.days, sessions: out.sessions, today: "2026-12-05", weeklyTarget: 12, milesDone: 0 });
  assert.equal(titleOn(checked.days, checked.sessions, "2026-12-11"), "Walk + mobility");
  assert.equal(checked.sessions.find((s) => s.id === "shakeout-dallas-2026")?.miles, 2);
  assert.equal(titleOn(checked.days, checked.sessions, "2026-12-12"), "Shakeout 2 mi + strides");
});

test("the planner context tells the model which days are set and what recovery allows", () => {
  const ctx = buildPlannerContext({ workouts: [], runs: [], exerciseMuscles: [], goals: DEFAULT_GOALS, today: new Date(2026, 11, 9, 12), weekOf: new Date(2026, 11, 13, 12) });
  assert.equal(ctx.block.kind, "recovery");
  assert.equal(ctx.fixedDays?.length, 4);
  assert.equal(ctx.recovery?.maxWeekMiles, 8);
  assert.equal(ctx.strengthDose.liftSessions, 2);
  assert.equal(ctx.strengthDose.heavyLower, 0);
});
