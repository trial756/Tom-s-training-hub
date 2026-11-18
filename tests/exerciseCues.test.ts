import { test } from "node:test";
import assert from "node:assert/strict";
import { cueFor, withCues } from "@/lib/exerciseCues";
import { TOP_UP_NAMES } from "@/lib/planner/program";
import { STALL_BREAKERS } from "@/lib/planner/stallBreakers";

// Tom, Nov 2026: exercises in the plan need a short how-to, especially new ones.
test("every exercise code adds on its own has a how-to", () => {
  const names = [...TOP_UP_NAMES, ...Object.values(STALL_BREAKERS).flat().map((b) => b.name)];
  for (const n of names) assert.ok(cueFor(n), `no how-to for ${n}`);
});

test("how-tos are short — a couple of sentences, not an essay", () => {
  for (const n of ["Cable Fly", "Hip Thrust", "5-10-5 Shuttle", "Hollow Hold"]) {
    const words = cueFor(n)!.split(/\s+/).length;
    assert.ok(words <= 40, `${n}: ${words} words`);
  }
});

test("a model-written cue is kept; a blank one is filled, and names match in any form", () => {
  const ex = (name: string, cue: string | null) => ({ name, sets: 3, reps: "10", target: null, cue, isNew: false, regions: [] });
  const out = withCues([ex("Leg Curl", "Mine."), ex("leg curls", null), ex("Mystery Move", null)]);
  assert.equal(out[0].cue, "Mine.");
  assert.match(out[1].cue!, /heels/);
  assert.equal(out[2].cue, null);
});
