import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeExerciseName as key } from "@/lib/format";
import { canonicalExerciseName, exerciseKeyFromStoredKey } from "@/lib/exerciseNames";
import { buildExerciseLookup } from "@/lib/muscleCoverage";

// Nov 2026: one lift's history was split across these names.
const SAME_LIFT = [
  ["Incline Bench Press", "Incline Barbell Press", "Incline Barbell Bench Press"],
  ["Barbell Shoulder Press", "Barbell Overhead Press"],
  ["Back Squat", "Barbell Back Squat"],
  ["Pec Dec Fly", "Pec Dec Chest Flys"],
  ["Cable Lateral Raise", "Lateral Cable Raise"],
  ["Single Arm Lateral Cable Raise", "Lateral Cable Raise (Single Arm)"],
  ["Tricep Pulldown", "Tricep Pushdown", "Cable Tricep Pulldown", "Tricep Cable Pulldowns"],
  ["EZ Bar Skull Crushers", "EZ-Bar Skull Crusher"],
  ["Narrow Grip Horizontal Cable Pull", "Horizontal Cable Pull"],
  ["Machine Incline Press", "Incline Machine Press"],
];

test("names of the same lift share one key", () => {
  for (const names of SAME_LIFT) assert.equal(new Set(names.map(key)).size, 1, names.join(" / "));
});

test("different lifts stay apart", () => {
  for (const [a, b] of [
    ["Single Arm Rear Delt Cable Fly", "Rear Delt Fly"],
    ["V-Grip Tricep Pushdown", "Tricep Pushdown"],
    ["Dumbbell Incline Press", "Incline Barbell Bench Press"],
    ["Chest Supported T-Bar Row", "Chest Supported Lever Row"],
    ["Leg Curl", "Barbell Curl"],
  ]) assert.notEqual(key(a), key(b), `${a} vs ${b}`);
});

test("new logs are saved under the standard name", () => {
  assert.equal(canonicalExerciseName("incline bench press"), "Incline Barbell Bench Press");
  assert.equal(canonicalExerciseName("Lateral Cable Raise"), "Cable Lateral Raise");
  assert.equal(canonicalExerciseName("Goblet Squat"), "Goblet Squat", "unknown names are left alone");
});

test("names without an alias keep their old key", () => {
  assert.equal(key("Dead Bug"), "dead bug");
  assert.equal(key("Standing Calf Raises"), "standing calf raise");
});

test("muscle tags saved under an old or alias key are still found", () => {
  const lookup = buildExerciseLookup([{ key: "incline bench pres", primary_muscles: ["chest"], secondary_muscles: [] }]);
  assert.deepEqual(lookup.get(key("Incline Barbell Press"))?.primary, ["chest"]);
  assert.equal(exerciseKeyFromStoredKey("dead bug"), "dead bug");
});
