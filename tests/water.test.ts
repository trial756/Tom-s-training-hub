import { test } from "node:test";
import assert from "node:assert/strict";
import { behindAt5pm, parseOz, waterTarget } from "../lib/water";

test("a rest day's target is half an ounce per pound", () => {
  const t = waterTarget({ bodyweightLb: 158, runMinutes: 0, liftSessions: 0, maxTempF: null });
  assert.equal(t.oz, 80);
  assert.deepEqual(t.parts, [{ label: "Base (158 lb)", oz: 79 }]);
});

test("running, lifting and heat add to it", () => {
  // 16-miler at ~2:23 in 88°F, plus a lift: 79 + 38 + 8 + 16 = 141 → 140.
  const t = waterTarget({ bodyweightLb: 158, runMinutes: 143, liftSessions: 1, maxTempF: 88 });
  assert.equal(t.oz, 140);
  assert.equal(waterTarget({ bodyweightLb: 158, runMinutes: 0, liftSessions: 0, maxTempF: 95 }).oz, 104);
});

test("the 5pm reminder only fires when under 60% of the target", () => {
  assert.equal(behindAt5pm(40, 96), true);
  assert.equal(behindAt5pm(60, 96), false);
  assert.equal(behindAt5pm(0, 0), false);
});

test("typed amounts", () => {
  assert.equal(parseOz("16"), 16);
  assert.equal(parseOz("8.3"), 8.5);
  assert.equal(parseOz("0"), null);
  assert.equal(parseOz("500"), null);
});
