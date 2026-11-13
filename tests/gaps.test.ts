import { test } from "node:test";
import assert from "node:assert/strict";
import { doneThisWeek, fillGaps, varyCore } from "@/lib/planner/gaps";
import { patternOf } from "@/lib/planner/patterns";
import { ex, session } from "./helpers";

const peakWeek = () => [
  session("a", "run", "Easy 5 + core", { runType: "Easy", miles: 5, exercises: [ex("Dead Bug")] }),
  session("b", "lift", "Push", { exercises: [ex("Incline Barbell Bench Press", 4, "5-6")] }),
  session("c", "lift_and_run", "MP + Lower", { runType: "Marathon Pace", miles: 7, taxesLegs: true, exercises: [ex("Back Squat", 4, "5-6")] }),
  session("d", "lift", "Pull", { exercises: [ex("Bent Over Barbell Row", 4, "5-6")] }),
  session("e", "run", "Easy 4", { runType: "Easy", miles: 4 }),
  session("f", "run", "Long 18", { runType: "Long", miles: 18 }),
];

test("a peak week gets strides, mobility, calves, hips, a hinge and jumps", () => {
  const out = fillGaps(peakWeek(), { mode: "maintain", daysToRace: 38, recoveryWeek: false });
  const all = out.flatMap((s) => s.exercises.map((e) => e.name));
  assert.ok(all.filter((n) => n === "Strides").length >= 2);
  assert.ok(out.filter((s) => s.exercises.some((e) => patternOf(e.name) === "mobility")).length >= 3);
  assert.ok(all.some((n) => /calf/i.test(n)));
  assert.ok(all.includes("Copenhagen Plank"));
  assert.ok(all.includes("Romanian Deadlift"));
  assert.ok(all.includes("Pogo Hops"));
});

test("leg work and jumps never go on an easy-run day", () => {
  const out = fillGaps(peakWeek(), { mode: "maintain", daysToRace: 38, recoveryWeek: false });
  for (const s of out.filter((x) => x.kind === "run")) {
    for (const e of s.exercises) {
      const p = patternOf(e.name);
      assert.ok(!(p === "squat" || p === "hinge") && (p !== "power" || e.name === "Strides"), `${e.name} on ${s.title}`);
    }
  }
});

test("a week that already meets a floor gets nothing added for it", () => {
  const out = fillGaps(peakWeek(), { mode: "maintain", daysToRace: 38, recoveryWeek: false });
  assert.ok(!out.flatMap((s) => s.exercises).some((e) => e.name === "Bulgarian Split Squat"), "4 sets of squats already meet the floor");
});

test("the last ten days add only strides and mobility", () => {
  const out = fillGaps(peakWeek(), { mode: "taper", daysToRace: 8, recoveryWeek: false });
  const added = out.flatMap((s) => s.exercises.map((e) => e.name)).filter((n) => !["Dead Bug", "Incline Barbell Bench Press", "Back Squat", "Bent Over Barbell Row"].includes(n));
  assert.ok(added.every((n) => n === "Strides" || patternOf(n) === "mobility"), added.join(", "));
});

test("the weeks after a race add only mobility", () => {
  const out = fillGaps(peakWeek(), { mode: "maintain", daysToRace: null, recoveryWeek: false, afterRace: true });
  const added = out.flatMap((s) => s.exercises.map((e) => e.name)).filter((n) => !["Dead Bug", "Incline Barbell Bench Press", "Back Squat", "Bent Over Barbell Row"].includes(n));
  assert.ok(added.every((n) => patternOf(n) === "mobility"), added.join(", "));
});

// Nov 13 2026: calf raises lifted Thursday (on a day the plan had moved its
// session away from) didn't count, so the replan put calves on Friday too.
test("Nov 13 2026 bug: work logged on an unplanned day counts toward the floors", () => {
  const kept = [session("pull", "lift", "Pull", { exercises: [ex("Bent Over Barbell Row", 4, "5-6")] })];
  const done = doneThisWeek(kept, { pull: "2026-11-09" }, [
    { date: "2026-11-11", exercises: [{ name: "Standing Calf Raise", sets: [{ reps: 12, weight: null, weight_unit: null }, { reps: 12, weight: null, weight_unit: null }, { reps: 12, weight: null, weight_unit: null }] }] },
    { date: "2026-11-12", exercises: [{ name: "Standing Calf Raise", sets: [{ reps: 10, weight: 145, weight_unit: "lb" }, { reps: 8, weight: 145, weight_unit: "lb" }, { reps: 8, weight: 145, weight_unit: "lb" }] }] },
  ]);
  const rest = [
    session("push", "lift", "Push & side delts", { exercises: [ex("Barbell Shoulder Press", 4, "5-6")] }),
    session("long", "run", "Long 16", { runType: "Long", miles: 16 }),
  ];
  const out = fillGaps(rest, { mode: "maintain", daysToRace: 30, recoveryWeek: false, alreadyThisWeek: done });
  assert.ok(!out.flatMap((s) => s.exercises).some((e) => /calf/i.test(e.name)), "six calf sets already done this week");
});

test("a day with a logged workout counts what was logged, not what was planned", () => {
  const kept = [session("legs", "lift", "Legs", { exercises: [ex("Back Squat", 4, "5-6")] })];
  const done = doneThisWeek(kept, { legs: "2026-11-09" }, [
    { date: "2026-11-09", exercises: [{ name: "Barbell Curl", sets: [{ reps: 10, weight: 65, weight_unit: "lb" }] }] },
  ]);
  assert.deepEqual(done.flatMap((s) => s.exercises.map((e) => e.name)), ["Barbell Curl"]);
});

test("no core movement more than twice a week; a third is swapped for another", () => {
  const done = [session("sun", "lift", "Pull", { exercises: [ex("Pallof Press"), ex("Dead Bug")] })];
  const week = [
    session("a", "lift", "Push", { preferredDow: 1, exercises: [ex("Barbell Bench Press", 4, "5-6"), ex("Pallof Press")] }),
    session("b", "run", "Easy + core", { preferredDow: 2, runType: "Easy", exercises: [ex("Dead Bug"), ex("Side Plank", 3, "30-40s per side")] }),
    session("c", "lift", "Arms", { preferredDow: 4, exercises: [ex("Barbell Curl"), ex("Pallof Press"), ex("Dead Bug")] }),
    session("d", "run", "Recovery", { preferredDow: 5, exercises: [ex("Copenhagen Plank", 3, "20-30s per side"), ex("Copenhagen Plank", 3, "20-30s per side"), ex("Copenhagen Plank", 3, "20-30s per side")] }),
  ];
  const out = varyCore(week, done);
  const names = out.flatMap((s) => s.exercises.map((e) => e.name));
  assert.equal(names.filter((n) => n === "Pallof Press").length, 1, "one more Pallof press makes two");
  assert.equal(names.filter((n) => n === "Dead Bug").length, 1);
  const arms = out.find((s) => s.id === "c")!.exercises.map((e) => e.name);
  assert.equal(arms.length, 3);
  assert.ok(arms.every((n) => patternOf(n) !== "other"), arms.join(", "));
  assert.equal(new Set(arms).size, 3, "the swaps differ from each other");
  assert.equal(names.filter((n) => n === "Copenhagen Plank").length, 3, "the hip floor is left alone");
});
