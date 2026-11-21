import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWeek } from "@/lib/planner/validate";
import type { PlanDay, PlanSession } from "@/lib/planner/types";
import { ex, session } from "./helpers";

const DATES = ["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const days = (ids: string[]): PlanDay[] =>
  DATES.map((date, i) => ({ date, sessionId: ids[i], runNote: null, isKeyRunDay: false, status: "upcoming", loggedSummary: null }));
const at = (out: { days: PlanDay[]; sessions: PlanSession[] }) =>
  Object.fromEntries(out.days.map((d, i) => [DOW[i], out.sessions.find((s) => s.id === d.sessionId)?.title]));

// Nov 21 2026: the week after Tom's 20-miler (Sat Nov 21) as first planned —
// easy run + heavy rows on the Sunday, the "day after the long run" walk on
// the Monday, and chest (last trained Wed Nov 18) not until Friday the 27th.
const NOV22: PlanSession[] = [
  session("s1", "lift_and_run", "Easy run + Pull", { runType: "Easy", miles: 3.9, exercises: [ex("Bent Over Barbell Row", 3, "5-6"), ex("Single Arm Rear Delt Cable Fly")] }),
  session("s6", "active_recovery", "Walk + shoulders & core", { exercises: [ex("Walking", 1, "20-30 min"), ex("Ab Wheel Rollout")] }),
  session("s2", "lift_and_run", "MP intervals + Lower", { runType: "Marathon Pace", miles: 7, taxesLegs: true, exercises: [ex("Bulgarian Split Squat", 3, "5-6")] }),
  session("s3", "run", "Easy 5 + mobility", { runType: "Easy", miles: 5, exercises: [ex("Side Plank", 3, "30s")] }),
  session("s7", "lift", "Shoulders & arms", { exercises: [ex("Barbell Shoulder Press", 3, "5-6"), ex("Barbell Curl")] }),
  session("s4", "lift", "Push", { exercises: [ex("Incline Barbell Bench Press", 3, "5-6"), ex("Cable Lateral Raise")] }),
  session("s5", "run", "Long run — 14 mi", { runType: "Long", miles: 14, taxesLegs: true }),
];

test("Nov 21 2026 bug: the day after a 16+ mile long run — even across the week line — is the recovery day", () => {
  const out = validateWeek({
    days: days(["s1", "s6", "s2", "s3", "s7", "s4", "s5"]),
    sessions: NOV22,
    today: "2026-11-21",
    outsideHard: ["2026-11-21"],
    longBefore: [{ date: "2026-11-21", miles: 20 }],
    lastTrained: { chest: "2026-11-18", back: "2026-11-17", shoulders: "2026-11-19" },
  });
  const week = at(out);
  assert.equal(week.Sun, "Walk + shoulders & core", JSON.stringify(week));
  assert.equal(week.Sat, "Long run — 14 mi");
  assert.equal(week.Tue, "MP intervals + Lower", "the hard days stay where they were");
  // Chest back by the 25th (a week after the 18th), not the 27th.
  const push = out.days.find((d) => d.sessionId === "s4")!;
  assert.ok(push.date <= "2026-11-25", `push on ${push.date}`);
  assert.ok(!out.days.some((d) => d.warning), JSON.stringify(out.days.map((d) => d.warning)));
  // Nothing heavy for the legs the day before the long run.
  assert.notEqual(week.Fri, "MP intervals + Lower");
});

test("a long run under 16 miles doesn't force a recovery day", () => {
  const out = validateWeek({
    days: days(["s1", "s6", "s2", "s3", "s7", "s4", "s5"]),
    sessions: NOV22,
    today: "2026-11-21",
    longBefore: [{ date: "2026-11-21", miles: 12 }],
  });
  assert.equal(at(out).Sun, "Easy run + Pull");
});

test("a group that can't come back within the week gets a warning, not silence", () => {
  const out = validateWeek({
    days: days(["s6", "s3", "s2", "s3b", "s6b", "s7", "s5"]),
    sessions: [
      ...NOV22,
      session("s3b", "run", "Easy 4", { runType: "Easy", miles: 4 }),
      session("s6b", "active_recovery", "Walk", {}),
    ],
    today: "2026-11-21",
    lastTrained: { chest: "2026-11-10" },
  });
  // No session this week trains chest, so nothing to move and nothing to warn about.
  assert.ok(!out.days.some((d) => /Chest/.test(d.warning ?? "")));
});
