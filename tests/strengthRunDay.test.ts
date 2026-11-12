import { test } from "node:test";
import assert from "node:assert/strict";
import { applyStrengthRules } from "../lib/planner/strengthRules";
import { liftTrends } from "../lib/planner/progression";
import type { PlanSession } from "../lib/planner/types";

// Nov 11 2026: an easy run + core & hips day planned Standing Calf Raise 3 x 12-15
// with no weight, though the last calf session was 135x10 — and the workout
// coaching then flagged the missing load.
test("add-on work on a run day still gets its load from the log", () => {
  const trends = liftTrends(
    [
      { logged_at: "2026-10-28T23:00:00Z", exercises: [{ name: "Standing Calf Raise", sets: [{ reps: 10, weight: 125 }] }] },
      { logged_at: "2026-11-04T23:00:00Z", exercises: [{ name: "Standing Calf Raise", sets: [{ reps: 10, weight: 135 }, { reps: 10, weight: 135 }] }] },
    ],
    new Date("2026-11-11T12:00:00Z")
  );
  const session: PlanSession = {
    id: "s4",
    kind: "run",
    title: "Easy run + core & hips",
    rationale: "",
    regions: ["calves"],
    exercises: [
      { name: "Side Plank", sets: 3, reps: "30-40s per side", target: null, cue: null, isNew: false, regions: ["obliques"] },
      { name: "Standing Calf Raise", sets: 3, reps: "12-15", target: null, cue: null, isNew: false, regions: ["calves"] },
    ],
    priority: 3,
    preferredDow: 3,
    taxesLegs: false,
    miles: 8,
    run: { type: "Easy", structure: null },
  };
  const [out] = applyStrengthRules([session], { trends, knownNames: new Set(["standing calf raise", "side plank"]), fatigued: false });
  const calf = out.exercises.find((e) => e.name === "Standing Calf Raise")!;
  assert.equal(calf.target, "135 lb");
  assert.match(calf.note ?? "", /135x10/);
  // A hold with no history stays as planned.
  assert.equal(out.exercises.find((e) => e.name === "Side Plank")!.target, null);
});
