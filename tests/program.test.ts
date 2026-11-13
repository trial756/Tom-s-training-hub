import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GOALS } from "@/lib/goals";
import { buildPlannerContext } from "@/lib/planner/context";
import { patternOf } from "@/lib/planner/patterns";
import { applyAthletics, easeLegLoads, fitVolume, programFor, weeklySets } from "@/lib/planner/program";
import { prescribe, type LiftTrend } from "@/lib/planner/progression";
import { ex, session } from "./helpers";

const sunday = (start: string, weeks: number) => {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};

// The switch after Dallas: recovery Dec 13–26, then the programme from Dec 27
// through the Feb 28 half.
test("after Dallas: a ramp-in week, then build-build-build-deload, with the long run building to the half", () => {
  assert.equal(programFor(DEFAULT_GOALS, "2026-12-20", "2026-12-20"), null, "recovery weeks aren't programme weeks");
  const weeks = Array.from({ length: 10 }, (_, i) => programFor(DEFAULT_GOALS, sunday("2026-12-27", i), "2026-12-27")!);
  assert.deepEqual(
    weeks.map((w) => (w.phase === "build" ? `b${w.wave}` : w.phase)),
    ["ramp", "b1", "b2", "b3", "deload", "b1", "b2", "b3", "deload", "b1"]
  );
  assert.deepEqual(weeks.slice(0, 9).map((w) => w.run.longRunMiles), [4, 5, 5, 6, 5, 8, 9, 10, null]);
  assert.equal(weeks[9].run.longRunMiles, null, "the half itself is that week's long run");
  // Ramp-in: fewer sets, eased legs, no load jumps.
  assert.ok(weeks[0].sets.chest < weeks[1].sets.chest && weeks[0].legLoadFactor < 1 && weeks[0].hold);
  assert.equal(weeks[0].liftSessions, 4);
  assert.equal(weeks[0].run.intervals, null);
  // Build: sets climb, then drop for the deload.
  assert.ok(weeks[1].sets.back < weeks[2].sets.back && weeks[2].sets.back < weeks[3].sets.back);
  assert.ok(weeks[4].sets.back < weeks[1].sets.back && weeks[4].hold);
  assert.equal(weeks[2].liftSessions, 5);
  assert.equal(weeks[2].heavyLower, 2);
  // Jumps and sprints progress.
  assert.notDeepEqual(weeks[1].jumps.map((e) => e.name), weeks[3].jumps.map((e) => e.name));
  assert.ok(weeks[3].speed[0].sets > weeks[1].speed[0].sets);
});

test("with no goal set the programme still runs, one deload in every four weeks", () => {
  const weeks = Array.from({ length: 8 }, (_, i) => programFor([], sunday("2027-06-06", i), "2027-06-06")!);
  assert.ok(weeks.every(Boolean));
  assert.ok(!weeks.some((w) => w.phase === "ramp"));
  for (let i = 0; i < 4; i++) assert.equal(weeks.slice(i, i + 4).filter((w) => w.phase === "deload").length, 1);
});

test("a muscle group short of its sets is topped up; one over is trimmed, never below two sets", () => {
  const week = [
    session("ua", "lift", "Upper A", { exercises: [ex("Barbell Bench Press", 3, "5-6"), ex("Bent Over Barbell Row", 3, "8-10")] }),
    session("la", "lift", "Lower A", { taxesLegs: true, exercises: [ex("Back Squat", 5, "5-6"), ex("Leg Extension", 5, "10-15"), ex("Bulgarian Split Squat", 5, "8-10")] }),
  ];
  const targets = { chest: 10, back: 12, shoulders: 8, quads: 5, hamstrings: 6, biceps: 8, triceps: 8, calves: 6 };
  const out = fitVolume(week, targets);
  const got = weeklySets(out);
  for (const g of ["chest", "back", "shoulders", "hamstrings", "biceps", "triceps", "calves"] as const) {
    assert.ok(got[g] >= targets[g] - 1, `${g}: ${got[g]} of ${targets[g]}`);
  }
  assert.ok(got.quads <= 5 * 1.25 + 1, `quads trimmed, got ${got.quads}`);
  assert.ok(out.flatMap((s) => s.exercises).every((e) => e.sets >= 2 && e.sets <= 5));
  // Hamstring work lands on the leg day, not the upper day.
  assert.ok(out[1].exercises.some((e) => patternOf(e.name) === "hinge" || e.name === "Leg Curl"));
  assert.ok(!out[0].exercises.some((e) => e.name === "Leg Curl"));
});

test("work already logged this week counts toward the sets", () => {
  const done = [session("d", "lift", "Logged", { exercises: [ex("Barbell Bench Press", 5, "8"), ex("Cable Fly", 5, "12")] })];
  const out = fitVolume([session("u", "lift", "Upper", { exercises: [ex("Barbell Shoulder Press", 3, "5-6")] })], { chest: 10, back: 0, shoulders: 3, quads: 0, hamstrings: 0, biceps: 0, triceps: 0, calves: 0 }, done);
  assert.ok(!out[0].exercises.some((e) => ["horizontal_press", "fly"].includes(patternOf(e.name))), "chest already has its ten");
});

test("jumps open the squat day, sprints open the hinge day, and the model's own power work goes", () => {
  const p = programFor(DEFAULT_GOALS, "2027-01-10", "2027-01-10")!; // build 2
  const out = applyAthletics(
    [
      session("la", "lift", "Lower A", { exercises: [ex("Back Squat", 4, "5-6"), ex("Medicine Ball Slam", 3, "8")] }),
      session("lb", "lift", "Lower B", { exercises: [ex("Romanian Deadlift", 4, "5-6"), ex("Box Jump", 3, "5")] }),
      session("u", "lift", "Upper", { exercises: [ex("Barbell Bench Press")] }),
    ],
    p
  );
  assert.deepEqual(out[0].exercises.map((e) => e.name), ["Box Jump", "Broad Jump", "Back Squat"]);
  assert.deepEqual(out[1].exercises.map((e) => e.name), ["Sprint", "5-10-5 Shuttle", "Romanian Deadlift"]);
  assert.equal(out[2].exercises.length, 1);
});

test("first week back: leg loads eased to 85%, upper loads untouched", () => {
  const out = easeLegLoads(
    [session("l", "lift", "Lower", { exercises: [{ ...ex("Back Squat"), target: "185 lb" }, { ...ex("Barbell Bench Press"), target: "150 lb" }] })],
    0.85
  );
  assert.equal(out[0].exercises[0].target, "155 lb");
  assert.equal(out[0].exercises[1].target, "150 lb");
});

test("a leg curl counts as hamstring work, not a biceps curl", () => {
  assert.equal(patternOf("Leg Curl"), "hinge");
  assert.equal(patternOf("Seated Hamstring Curl"), "hinge");
  assert.equal(patternOf("Barbell Curl"), "elbow_flexion");
});

test("ramp-in and deload weeks never add load", () => {
  const s = { date: "2026-12-01", topWeight: 150, repsAtTop: 10, e1rm: 200, bestSet: "150x10" };
  const trend = { key: "bench", name: "Bench", pattern: "horizontal_press", status: "progressing", sessions: [s], last: s, best: s, summary: "" } as unknown as LiftTrend;
  assert.equal(prescribe(trend, "volume")?.target, 155);
  assert.equal(prescribe(trend, "volume", { hold: true })?.target, 150);
});

test("the planner context carries the programme and its dose", () => {
  const ctx = buildPlannerContext({ workouts: [], runs: [], exerciseMuscles: [], goals: DEFAULT_GOALS, today: new Date(2026, 11, 27, 12) });
  assert.equal(ctx.block.kind, "focus");
  assert.equal(ctx.program?.phase, "ramp");
  assert.equal(ctx.strengthDose.liftSessions, 4);
  assert.equal(ctx.strengthDose.mode, "build");
  assert.equal(ctx.program?.run.longRunMiles, 4);
});
