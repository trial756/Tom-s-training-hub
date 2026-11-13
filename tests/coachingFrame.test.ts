import { test } from "node:test";
import assert from "node:assert/strict";
import { coachingFrameFor, raceResult } from "@/lib/coachingFrame";
import { DEFAULT_GOALS } from "@/lib/goals";

// Nov 2026 review: run coaching said "3:30 marathon, 8:01/mi" whatever the
// week was for, so the day after Dallas an easy run would be judged against
// marathon pace.
test("during the Dallas build, runs are coached against 8:01", () => {
  const f = coachingFrameFor(DEFAULT_GOALS, new Date(2026, 10, 20, 12));
  assert.equal(f.goalPace, 481);
  assert.match(f.intro, /Dallas Marathon/);
  assert.match(f.intro, /3:30:00/);
  assert.match(f.pace, /8:01\/mi/);
});

test("in recovery there is no pace target", () => {
  const f = coachingFrameFor(DEFAULT_GOALS, new Date(2026, 11, 17, 12));
  assert.equal(f.goalPace, null);
  assert.match(f.intro, /recovering/);
  assert.doesNotMatch(f.intro + f.pace, /8:01/);
});

test("in the muscle and athleticism block, running is conditioning and the half is for fun", () => {
  const f = coachingFrameFor(DEFAULT_GOALS, new Date(2027, 0, 12, 12));
  assert.equal(f.goalPace, null);
  assert.match(f.intro, /Muscle & athleticism/);
  assert.match(f.intro, /Half marathon on 2027-02-28, for fun/);
  assert.doesNotMatch(f.intro + f.pace, /8:01|3:30/);
});

test("with no goals at all the coaching is for muscle and athleticism", () => {
  const f = coachingFrameFor([], new Date(2027, 5, 9, 12));
  assert.match(f.intro, /Muscle & athleticism/);
});

test("a race's result comes from the run logged on race day", () => {
  const dallas = DEFAULT_GOALS[0];
  const runs = [
    { logged_at: new Date(2026, 11, 12, 8).toISOString(), distance_miles: 2, duration_seconds: 1200 },
    { logged_at: new Date(2026, 11, 13, 8).toISOString(), distance_miles: 26.3, duration_seconds: 3 * 3600 + 28 * 60 + 40 },
  ];
  assert.deepEqual(raceResult(dallas, runs), { seconds: 12520, note: "Result: 3:28:40 (7:56/mi)." });
  assert.equal(raceResult(dallas, runs.slice(0, 1)), null, "a shakeout isn't the race");
});
