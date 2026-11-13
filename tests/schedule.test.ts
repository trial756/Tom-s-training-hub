import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleWeek } from "@/lib/planner/schedule";
import { validateWeek, isHard, isLong, stripWeekdays } from "@/lib/planner/validate";
import type { PlanDay, PlanSession } from "@/lib/planner/types";
import { WEEK, byDay, emptyLogs, ex, session } from "./helpers";

/** Schedule, then run the weekly check, as the plan route does. */
function plan(sessions: PlanSession[], today: string, logs = emptyLogs(), prior: Record<string, string> = {}) {
  const days = scheduleWeek({ sessions, weekDates: WEEK, today, logs, priorAssignments: prior });
  return validateWeek({ days, sessions, today });
}

/** The rules every week must satisfy on days still to come. */
function assertCoachRules(days: PlanDay[], sessions: PlanSession[], today: string) {
  const at = (date: string) => sessions.find((s) => s.id === days.find((d) => d.date === date)?.sessionId);
  for (let i = 1; i < WEEK.length; i++) {
    if (WEEK[i] < today) continue;
    assert.ok(!(isHard(at(WEEK[i - 1])) && isHard(at(WEEK[i]))), `hard days back to back: ${WEEK[i - 1]} and ${WEEK[i]}`);
  }
  for (const d of days) {
    if (isLong(at(d.date)) && d.date > today) {
      const before = at(WEEK[WEEK.indexOf(d.date) - 1]);
      assert.ok(!before || !isHard(before), "hard session the day before the long run");
    }
  }
}

test("Nov 4 2026 bug: a 20-miler asked for a past Sunday lands Saturday, not the day after MP + legs", () => {
  const sessions = [
    session("s1", "lift", "Pull", { priority: 2, preferredDow: 2, frozen: true }),
    session("s6", "run", "Easy + core", { priority: 4, preferredDow: 0, runType: "Easy", miles: 2, frozen: true }),
    session("a", "lift_and_run", "MP + Lower", { priority: 1, preferredDow: 3, taxesLegs: true, runType: "Marathon Pace", miles: 7 }),
    session("b", "run", "Easy + mobility", { priority: 3, preferredDow: 5, runType: "Easy", miles: 2 }),
    session("c", "lift", "Push & Arms", { priority: 2, preferredDow: 6 }),
    // The model forgot taxes_legs on the long run, too.
    session("d", "run", "Long 20", { priority: 1, preferredDow: 0, runType: "Long", miles: 20 }),
  ];
  const logs = emptyLogs();
  logs["2026-11-01"] = { hasWorkout: true, hasRun: true, summary: "", regions: ["chest"], runs: [{ type: "Easy", miles: 4.6 }] };
  logs["2026-11-02"] = { hasWorkout: true, hasRun: true, summary: "", regions: ["abs"], runs: [{ type: "Easy", miles: 4 }] };
  logs["2026-11-03"] = { hasWorkout: true, hasRun: false, summary: "", regions: ["lats"], runs: [] };
  const { days } = plan(sessions, "2026-11-04", logs, { s1: "2026-11-03", s6: "2026-11-02" });
  const week = byDay(days, sessions);
  assert.equal(week.Wed, "MP + Lower");
  assert.equal(week.Sat, "Long 20");
  assertCoachRules(days, sessions, "2026-11-04");
});

test("a fresh week keeps hard days apart and the long run late", () => {
  const sessions = [
    session("l", "run", "Long 18", { runType: "Long", miles: 18, priority: 1 }),
    session("t", "lift_and_run", "Tempo + Lower", { runType: "Tempo", miles: 6, taxesLegs: true, priority: 1 }),
    session("i", "run", "Intervals", { runType: "Interval", miles: 5, priority: 2 }),
    session("p", "lift", "Push", { priority: 3 }),
    session("q", "lift", "Pull", { priority: 3 }),
    session("e1", "run", "Easy 4", { runType: "Easy", miles: 4, priority: 4 }),
    session("e2", "run", "Easy 3", { runType: "Easy", miles: 3, priority: 4 }),
  ];
  const { days } = plan(sessions, "2026-11-01");
  assert.equal(byDay(days, sessions).Sat, "Long 18");
  assertCoachRules(days, sessions, "2026-11-01");
});

test("model preferences that would stack hard days are overridden", () => {
  const sessions = [
    session("l", "run", "Long 16", { runType: "Long", miles: 16, preferredDow: 4 }),
    session("m", "lift_and_run", "MP + Lower", { runType: "Marathon Pace", miles: 7, taxesLegs: true, preferredDow: 3 }),
    session("p", "lift", "Push", { preferredDow: 5 }),
    session("e", "run", "Easy", { runType: "Easy", miles: 4 }),
  ];
  const { days } = plan(sessions, "2026-11-01");
  assertCoachRules(days, sessions, "2026-11-01");
});

test("heavy legs never land the day before the long run", () => {
  const sessions = [
    session("l", "run", "Long 20", { runType: "Long", miles: 20, preferredDow: 6 }),
    session("legs", "lift", "Lower", { exercises: [ex("Back Squat", 4, "5-6")], preferredDow: 5 }),
    session("p", "lift", "Push", { preferredDow: 2 }),
    session("e", "run", "Easy", { runType: "Easy", miles: 4, preferredDow: 1 }),
  ];
  const { days } = plan(sessions, "2026-11-01");
  const week = byDay(days, sessions);
  assert.notEqual(week.Fri, "Lower");
  assertCoachRules(days, sessions, "2026-11-01");
});

test("a long run logged as Easy goes off-script and the long run moves to a later day", () => {
  const sessions = [
    session("l", "run", "Long 16", { runType: "Long", miles: 16 }),
    session("p", "lift", "Push"),
    session("e", "run", "Easy 4", { runType: "Easy", miles: 4 }),
  ];
  const logs = emptyLogs();
  logs["2026-11-01"] = { hasWorkout: false, hasRun: true, summary: "", regions: [], runs: [{ type: "Easy", miles: 5 }] };
  const days = scheduleWeek({ sessions, weekDates: WEEK, today: "2026-11-02", logs, priorAssignments: { l: "2026-11-01" } });
  assert.equal(days[0].status, "off_script");
  assert.ok(days.slice(1).some((d) => d.sessionId === "l"), "long run re-placed later in the week");
});

test("today, once logged and kept through a replan, keeps its session", () => {
  const sessions = [
    session("k", "lift", "Pull", { frozen: true }),
    session("n", "lift", "Push"),
    session("l", "run", "Long 18", { runType: "Long", miles: 18 }),
  ];
  const logs = emptyLogs();
  logs["2026-11-03"] = { hasWorkout: true, hasRun: false, summary: "", regions: ["lats"], runs: [] };
  const days = scheduleWeek({ sessions, weekDates: WEEK, today: "2026-11-03", logs, priorAssignments: { k: "2026-11-03" } });
  assert.equal(days.find((d) => d.date === "2026-11-03")?.sessionId, "k");
});

test("no day is ever left blank", () => {
  const sessions = [session("l", "run", "Long 10", { runType: "Long", miles: 10 })];
  const days = scheduleWeek({ sessions, weekDates: WEEK, today: "2026-11-01", logs: emptyLogs() });
  assert.ok(days.every((d) => d.sessionId));
});

test("a hard day this week's Saturday keeps next week's Sunday easy", () => {
  const NEXT = ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];
  const sessions = [
    session("m", "lift_and_run", "MP + Lower", { runType: "Marathon Pace", miles: 7, taxesLegs: true, preferredDow: 0 }),
    session("e", "run", "Easy", { runType: "Easy", miles: 4, preferredDow: 1 }),
    session("p", "lift", "Push", { preferredDow: 2 }),
  ];
  const days = scheduleWeek({ sessions, weekDates: NEXT, today: "2026-11-08", logs: {} }).map((d) => ({ ...d, status: "upcoming" as const }));
  const { days: checked } = validateWeek({ days, sessions, today: "2026-11-07", outsideHard: ["2026-11-07"] });
  const sunday = sessions.find((s) => s.id === checked[0].sessionId);
  assert.ok(!isHard(sunday), "the day after Saturday's long run is not a hard day");
  assert.ok(checked.some((d) => d.adjustNote), "the move is explained on the card");
});

test("weekday names are taken out of model text", () => {
  assert.equal(stripWeekdays("ahead of Saturday's 20-miler"), "ahead of this week's 20-miler");
  assert.equal(stripWeekdays("keeping the Friday session upper-body only"), "keeping that session upper-body only");
  assert.ok(!/day\b.*Thursday/.test(stripWeekdays("legs recover by Thursday")));
});

test("each upcoming day is placed against the long run", () => {
  const sessions = [
    session("l", "run", "Long 20", { runType: "Long", miles: 20 }),
    session("p", "lift", "Push"),
  ];
  const { days } = plan(sessions, "2026-11-01");
  const before = days.find((d) => d.date === "2026-11-06");
  assert.match(before?.contextNote ?? "", /Day before the 20-mile long run \(Sat\)/);
});

test("Nov 12 2026 bug: a run + legs day with only the legs logged isn't repeated the next day", () => {
  const sessions = [
    session("legs", "lift_and_run", "Easy run + Lower body (heavy)", { runType: "Easy", miles: 3, taxesLegs: true, regions: ["quads", "hamstrings", "glutes"], priority: 2 }),
    session("upper", "lift", "Shoulders & arms (pre-long-run)", { priority: 3, regions: ["front_delts", "biceps"] }),
    session("long", "run", "Long 16", { runType: "Long", miles: 16, priority: 1 }),
  ];
  const logs = emptyLogs();
  // Thursday: the leg workout was done, the easy run wasn't logged.
  logs["2026-11-05"] = { hasWorkout: true, hasRun: false, summary: "Lower Body (Heavy)", regions: ["hamstrings", "glutes", "calves"], runs: [] };
  const { days } = plan(sessions, "2026-11-06", logs, { legs: "2026-11-05", upper: "2026-11-06", long: "2026-11-07" });
  const week = byDay(days, sessions);
  assert.equal(days.find((d) => d.date === "2026-11-05")?.status, "done");
  assert.notEqual(week.Fri, "Easy run + Lower body (heavy)");
  assert.equal(week.Fri, "Shoulders & arms (pre-long-run)");
  assert.equal(week.Sat, "Long 16");
});
