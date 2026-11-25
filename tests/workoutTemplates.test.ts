import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, buildTemplate, draftText, draftToExercises, type RecentSets } from "@/lib/workoutTemplates";
import { cueFor } from "@/lib/exerciseCues";

// Tom, Nov 2026: tapping "Chest Day" should give a standard chest workout to
// work with, set by set, instead of a blank text box.
const recent: RecentSets = {
  "incline bench press": { name: "Incline Barbell Bench Press", date: "2026-11-24", weight: 140, reps: 6 },
  "cable fly": { name: "Cable flys", date: "2026-11-10", weight: 60, reps: 8 },
  "pec dec fly": { name: "Pec Dec Fly", date: "2026-11-01", weight: 135, reps: 10 },
};

test("a template opens with the lifts you've done most recently, loaded from your last top set", async () => {
  const { exerciseKey } = await import("@/lib/exerciseNames");
  const keyed: RecentSets = Object.fromEntries(Object.values(recent).map((r) => [exerciseKey(r.name), r]));
  const chest = buildTemplate(TEMPLATES.find((t) => t.label === "Chest Day")!, keyed);
  assert.equal(chest[0].name, "Incline Barbell Bench Press");
  assert.deepEqual(chest[0].sets[0], { weight: "140", reps: "6" });
  assert.equal(chest[0].sets.length, 4);
  assert.equal(chest[2].name, "Cable Fly", "cable flys were logged more recently than the pec dec");
  assert.deepEqual(chest[2].sets[0], { weight: "60", reps: "8" });
  assert.deepEqual(chest[1].sets[0], { weight: "", reps: "10" }, "no history: the template's reps, no weight");
});

test("holds are timed in seconds", () => {
  const core = buildTemplate(TEMPLATES.find((t) => t.label === "Core")!);
  const plank = core.find((e) => e.name === "Side Plank")!;
  assert.equal(plank.timed, true);
  assert.equal(plank.sets[0].reps, "30");
});

test("only filled-in sets are logged, and the text matches", () => {
  const draft = [
    { id: "a", name: "Barbell Bench Press", timed: false, sets: [{ weight: "185", reps: "5" }, { weight: "185", reps: "" }] },
    { id: "b", name: "Side Plank", timed: true, sets: [{ weight: "", reps: "40" }] },
    { id: "c", name: "Cable Fly", timed: false, sets: [{ weight: "60", reps: "" }] },
  ];
  assert.deepEqual(draftToExercises(draft), [
    { name: "Barbell Bench Press", timed: false, sets: [{ reps: 5, weight: 185 }] },
    { name: "Side Plank", timed: true, sets: [{ reps: null, weight: null, seconds: 40 }] },
  ]);
  assert.equal(draftText("Chest", draft, "felt good"), "Chest\nBarbell Bench Press: 185x5\nSide Plank: 40s\nfelt good");
});

test("every template movement has a how-to", () => {
  for (const t of TEMPLATES) for (const s of t.slots) for (const n of s.names) assert.ok(cueFor(n), `${t.label}: ${n}`);
});
