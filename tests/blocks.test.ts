import { test } from "node:test";
import assert from "node:assert/strict";
import { blockOf, groupExercises } from "@/lib/planner/blocks";
import { emptyWorkout, setCounts, workoutFromSession, workoutText } from "@/lib/workoutSession";
import { pickWorkout } from "@/lib/workoutSync";
import { ex, session } from "./helpers";

// Tom, Nov 2026: pre- and post-run stretches need to be separate from the
// workout and labelled.
test("drills go before the run, stretches and strides after, lifts in the middle", () => {
  const b = (name: string, run = true) => blockOf({ name, target: null }, run);
  assert.equal(b("Leg Swing (front-to-back)"), "warmup");
  assert.equal(b("A-Skip"), "warmup");
  assert.equal(b("World's Greatest Stretch"), "warmup");
  assert.equal(b("Walking Lunge"), "warmup");
  assert.equal(blockOf({ name: "Walking Lunge", target: "40 lb" }, true), "main", "a loaded lunge is leg work");
  assert.equal(b("Couch Stretch"), "after");
  assert.equal(b("90/90 Hip Stretch"), "after");
  assert.equal(b("Strides"), "after");
  assert.equal(b("Strides", false), "main");
  assert.equal(b("Bulgarian Split Squat"), "main");
  assert.equal(b("Copenhagen Plank"), "main");
  assert.equal(b("Standing Calf Raise"), "main");
});

test("a run day's card reads warm-up, workout, then strides & stretch", () => {
  const groups = groupExercises(
    [ex("Couch Stretch", 2, "45s per side"), ex("Barbell Bench Press", 4, "5-6"), ex("Leg Swing", 2, "15 per side"), ex("Strides", 1, "6 × 20 s")],
    true
  );
  assert.deepEqual(groups.map((g) => g.label), ["Before you run · warm-up", "Workout", "After you run · strides & stretch"]);
  assert.deepEqual(groups[2].items.map((i) => i.ex.name), ["Couch Stretch", "Strides"]);
  assert.equal(groupExercises([ex("Couch Stretch")], false)[0].label, "Cool-down · stretch");
});

test("in workout mode stretches are a one-tick checklist that doesn't count as sets, and log on their own line", () => {
  const s = session("s", "lift_and_run", "Easy 4 + Upper", {
    runType: "Easy",
    miles: 4,
    exercises: [ex("90/90 Hip Stretch", 2, "60s per side"), ex("Barbell Bench Press", 3, "5-6"), ex("Leg Swing", 2, "15 per side")],
  });
  const w = workoutFromSession(s, "2026-11-19", "Upper");
  assert.deepEqual(w.exercises.map((e) => [e.name, e.block, e.sets.length]), [
    ["Leg Swing", "warmup", 1],
    ["Barbell Bench Press", "main", 3],
    ["90/90 Hip Stretch", "after", 1],
  ]);
  assert.equal(w.runDay, true);
  assert.deepEqual(setCounts(w), { done: 0, total: 3, anyDone: false });
  w.exercises[0].sets[0].done = true;
  w.exercises[1].sets[0] = { weight: "185", reps: "5", done: true };
  assert.deepEqual(setCounts(w), { done: 1, total: 3, anyDone: true });
  assert.equal(workoutText(w), "Upper\nBarbell Bench Press: 185x5\nWarm-up & stretch: Leg Swing");
});

test("the backup wins only when the phone has lost the workout or holds an older copy of it", () => {
  const a = { ...emptyWorkout("2026-11-19"), startedAt: 1, updatedAt: 10 };
  assert.equal(pickWorkout(null, a), a, "phone lost it");
  assert.equal(pickWorkout(a, null), a);
  const newer = { ...a, updatedAt: 20 };
  assert.equal(pickWorkout(a, newer), newer, "another device moved it on");
  assert.equal(pickWorkout(newer, a), newer, "the phone is ahead");
  const other = { ...emptyWorkout("2026-11-19"), startedAt: 2, updatedAt: 99 };
  assert.equal(pickWorkout(a, other), a, "a different workout never replaces the one on the phone");
});
