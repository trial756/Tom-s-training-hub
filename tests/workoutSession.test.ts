import { test } from "node:test";
import assert from "node:assert/strict";
import { completedExercises, firstNumber, restFor, workoutFromSession, workoutText } from "../lib/workoutSession";
import type { PlanSession } from "../lib/planner/types";

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
