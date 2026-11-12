import { test } from "node:test";
import assert from "node:assert/strict";
import { completedExercises, firstNumber, restFor, workoutFromSession, workoutText } from "../lib/workoutSession";
import type { PlanSession } from "../lib/planner/types";
import { liftTitleFor } from "../lib/planner/runPlan";

const session: PlanSession = {
  id: "s1",
  kind: "lift",
  title: "Heavy lower + calves",
  rationale: "",
  regions: [],
  exercises: [
    { name: "Back Squat", sets: 3, reps: "5", target: "185 lb", cue: null, isNew: false, regions: [], note: "hit 185x5 — add 10 lb" },
    { name: "Standing Calf Raise", sets: 3, reps: "12-15", target: null, cue: "Pause at the top", isNew: true, regions: [] },
    { name: "Pallof Press", sets: 2, reps: "10", target: "30 lb", cue: null, isNew: false, regions: [] },
  ],
  priority: 1,
  preferredDow: null,
  taxesLegs: true,
  miles: null,
};

test("a planned session opens with its sets prefilled from the targets", () => {
  const w = workoutFromSession(session, "2026-11-10", "Heavy lower + calves");
  assert.equal(w.exercises.length, 3);
  const squat = w.exercises[0];
  assert.equal(squat.sets.length, 3);
  assert.deepEqual(squat.sets[0], { weight: "185", reps: "5", done: false });
  assert.equal(squat.target, "3 × 5 @ 185 lb");
  assert.equal(squat.restSec, 180);
  assert.equal(w.exercises[1].sets[0].weight, "");
  assert.equal(w.exercises[1].sets[0].reps, "12");
  assert.equal(w.exercises[1].cue, "Pause at the top");
  assert.equal(w.exercises[2].restSec, 45); // core
});

test("only ticked sets are logged, with exact numbers and text to match", () => {
  const w = workoutFromSession(session, "2026-11-10", "Heavy lower + calves");
  w.exercises[0].sets[0].done = true;
  w.exercises[0].sets[1] = { weight: "175", reps: "5", done: true };
  w.exercises[1].sets[0] = { weight: "", reps: "15", done: true };
  const ex = completedExercises(w);
  assert.equal(ex.length, 2); // Pallof never ticked
  assert.deepEqual(ex[0].sets, [
    { reps: 5, weight: 185, weight_unit: "lb" },
    { reps: 5, weight: 175, weight_unit: "lb" },
  ]);
  assert.deepEqual(ex[1].sets, [{ reps: 15, weight: null, weight_unit: null }]);
  assert.equal(workoutText(w, "left knee fine"), "Heavy lower + calves\nBack Squat: 185x5, 175x5\nStanding Calf Raise: 15 reps\nleft knee fine");
});

test("rest scales with how heavy the work is", () => {
  assert.equal(restFor("3-5"), 180);
  assert.equal(restFor("6-8"), 120);
  assert.equal(restFor("8-10"), 90);
  assert.equal(restFor("15"), 60);
  assert.equal(restFor("30s", "Side Plank"), 45);
  assert.equal(firstNumber("135.5 lb"), "135.5");
  assert.equal(firstNumber(null), "");
});

// Nov 11 2026: side planks and Copenhagen planks were logged as "30 reps".
test("holds are timed: seconds, each side where it applies, logged as seconds", () => {
  const holds: PlanSession = {
    ...session,
    exercises: [
      { name: "Side Plank", sets: 3, reps: "30-40s per side", target: null, cue: null, isNew: false, regions: [] },
      { name: "Copenhagen Plank", sets: 2, reps: "20-30s per side", target: null, cue: null, isNew: false, regions: [] },
      { name: "Plank", sets: 2, reps: "1 min", target: null, cue: null, isNew: false, regions: [] },
      { name: "Standing Calf Raise", sets: 3, reps: "12-15", target: "135 lb", cue: null, isNew: false, regions: [] },
    ],
  };
  const w = workoutFromSession(holds, "2026-11-11", "Core & hips");
  const [side, cph, plank, calf] = w.exercises;
  assert.deepEqual([side.timed, side.sides, side.sets[0].reps], [true, 2, "30"]);
  assert.deepEqual([cph.timed, cph.sides, cph.sets[0].reps], [true, 2, "20"]);
  assert.deepEqual([plank.timed, plank.sides, plank.sets[0].reps], [true, 1, "60"]);
  assert.equal(calf.timed, false);
  side.sets[0].done = true;
  side.sets[1] = { weight: "", reps: "35", done: true };
  calf.sets[0].done = true;
  const ex = completedExercises(w);
  assert.deepEqual(ex[0].sets, [
    { reps: null, weight: null, weight_unit: null, seconds: 30 },
    { reps: null, weight: null, weight_unit: null, seconds: 35 },
  ]);
  assert.equal(workoutText(w), "Core & hips\nSide Plank (each side): 30s, 35s\nStanding Calf Raise: 135x12");
});

test("a run day's lift title leaves the miles to the run", () => {
  assert.equal(liftTitleFor({ ...session, kind: "run", title: "Easy run + core & hips 8mi" }), "core & hips");
});
