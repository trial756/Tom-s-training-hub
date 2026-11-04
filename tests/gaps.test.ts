import { test } from "node:test";
import assert from "node:assert/strict";
import { fillGaps } from "@/lib/planner/gaps";
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
