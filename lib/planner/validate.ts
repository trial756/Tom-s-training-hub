import { daysBetweenKeys } from "@/lib/format";
import { patternOf } from "@/lib/planner/patterns";
import { plannedRunFor } from "@/lib/planner/runPlan";
import type { PlanDay, PlanSession } from "@/lib/planner/types";

// ── The week's last check, in code ───────────────────────────────────
//
// Runs on every load, after placement and mileage. The model plans and the
// scheduler places; this makes sure the result obeys the rules a coach would
// never break, fixes what it can by swapping days that haven't happened yet,
// and says so on the card. What it can't fix it flags, so a bad week is never
// shown silently.
//
//   1. Never two hard days in a row (key runs and heavy legs), including
//      across the week boundary.
//   2. The day before the long run carries no leg work.
//   3. Weekly miles land within reach of the target (warning only).
//
// It also keeps the words honest: weekday names the model wrote are taken
// out of titles and rationales (placement can move a session), and each day
// gets a line placing it against the long run, computed from where things
// actually landed.

const KEY_RUN_TYPES = new Set(["Long", "Tempo", "Marathon Pace", "Interval", "Race"]);

export function isHard(s: PlanSession | undefined): boolean {
  if (!s) return false;
  if (s.taxesLegs) return true;
  const run = s.kind === "run" || s.kind === "lift_and_run" ? plannedRunFor(s) : null;
  return !!run && KEY_RUN_TYPES.has(run.type);
}

export function isLong(s: PlanSession | undefined): boolean {
  return !!s && (s.kind === "run" || s.kind === "lift_and_run") && plannedRunFor(s)?.type === "Long";
}

const isRace = (s: PlanSession | undefined) => !!s && s.kind === "run" && plannedRunFor(s)?.type === "Race";

/** Lifting that loads the legs — not core, calves-only or mobility. */
export function hasLegWork(s: PlanSession | undefined): boolean {
  if (!s || (s.kind !== "lift" && s.kind !== "lift_and_run")) return false;
  if (s.taxesLegs) return true;
  return s.exercises.some((e) => {
    const p = patternOf(e.name);
    return p === "squat" || p === "hinge" || p === "power";
  });
}

export interface WeekCheckInput {
  days: PlanDay[];
  sessions: PlanSession[];
  /** First day that may still move; today counts as fixed. */
  today: string;
  /** Hard days just outside this week (the previous week's Saturday, the next week's Sunday). */
  outsideHard?: string[];
  weeklyTarget?: number | null;
  milesDone?: number;
}

export interface WeekCheck {
  days: PlanDay[];
  sessions: PlanSession[];
  warnings: string[];
}

type Violation = { kind: "adjacent"; a: string; b: string } | { kind: "legs_before_long"; legDay: string; longDay: string };

function findViolations(days: PlanDay[], byId: Map<string, PlanSession>, outsideHard: string[], today: string): Violation[] {
  const at = new Map(days.map((d) => [d.date, d.sessionId ? byId.get(d.sessionId) : undefined]));
  const hardDates = [...days.filter((d) => isHard(at.get(d.date))).map((d) => d.date), ...outsideHard].sort();
  const out: Violation[] = [];
  for (let i = 1; i < hardDates.length; i++) {
    const a = hardDates[i - 1];
    const b = hardDates[i];
    // Only pairs that touch a day still to come are worth reporting.
    if (daysBetweenKeys(a, b) === 1 && b >= today) out.push({ kind: "adjacent", a, b });
  }
  for (const d of days) {
    if ((!isLong(at.get(d.date)) && !isRace(at.get(d.date))) || d.date < today) continue;
    const before = days.find((x) => daysBetweenKeys(x.date, d.date) === 1);
    if (before && before.date >= today && hasLegWork(at.get(before.date)) && !isHard(at.get(before.date))) {
      out.push({ kind: "legs_before_long", legDay: before.date, longDay: d.date });
    }
  }
  return out;
}

const WEEKDAY = "(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)";

/** Takes weekday names out of model-written text, since placement can move a session. */
export function stripWeekdays(text: string): string {
  return text
    .replace(new RegExp(`\\b${WEEKDAY}'s\\b`, "g"), "this week's")
    .replace(new RegExp(`\\bthe ${WEEKDAY} (session|run|lift|workout)\\b`, "g"), "that $2")
    .replace(new RegExp(`\\b(on|by|before|after|until) ${WEEKDAY}\\b`, "g"), "$1 that day")
    .replace(new RegExp(`\\b${WEEKDAY}\\b`, "g"), "that day")
    .replace(/\s{2,}/g, " ");
}

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dow = (date: string) => new Date(`${date}T12:00:00`).getDay();

export function validateWeek(input: WeekCheckInput): WeekCheck {
  const sessions = input.sessions.map((s) => ({ ...s, title: stripWeekdays(s.title), rationale: stripWeekdays(s.rationale) }));
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const days = input.days.map((d) => ({ ...d }));
  const outsideHard = input.outsideHard ?? [];
  const warnings: string[] = [];

  const movable = (d: PlanDay) =>
    d.date > input.today && d.status === "upcoming" && !!d.sessionId && !byId.get(d.sessionId)?.frozen && !byId.get(d.sessionId)?.fixedDate;
  const count = () => findViolations(days, byId, outsideHard, input.today).length;

  const swap = (x: PlanDay, y: PlanDay) => {
    const t = x.sessionId;
    x.sessionId = y.sessionId;
    y.sessionId = t;
    for (const d of [x, y]) {
      const s = d.sessionId ? byId.get(d.sessionId) : undefined;
      d.isKeyRunDay = !!s && s.kind !== "lift" && isHard(s);
    }
  };

  // Fix by swapping days still to come; each swap must strictly reduce the
  // number of broken rules, so this always ends.
  for (let guard = 0; guard < 10; guard++) {
    const violations = findViolations(days, byId, outsideHard, input.today);
    if (!violations.length) break;
    const v = violations[0];
    // Which day's session to move: the later hard day (not the long run if
    // avoidable), or the leg day before the long run.
    const candidates =
      v.kind === "adjacent"
        ? [v.b, v.a].map((date) => days.find((d) => d.date === date)).filter((d): d is PlanDay => !!d && movable(d))
            .sort((p, q) => Number(isLong(byId.get(p.sessionId!))) - Number(isLong(byId.get(q.sessionId!))))
        : [days.find((d) => d.date === v.legDay)].filter((d): d is PlanDay => !!d && movable(d));
    let best: { from: PlanDay; to: PlanDay; score: number } | null = null;
    const before = violations.length;
    for (const from of candidates) {
      for (const to of days) {
        if (to === from || !movable(to)) continue;
        swap(from, to);
        const score = count();
        swap(from, to);
        if (score < before && (!best || score < best.score)) best = { from, to, score };
      }
    }
    if (!best) break;
    const moved = byId.get(best.from.sessionId!)!;
    swap(best.from, best.to);
    best.to.adjustNote =
      v.kind === "adjacent"
        ? `Moved to ${SHORT_DAY[dow(best.to.date)]} so it doesn't sit next to another hard day.`
        : `Moved to ${SHORT_DAY[dow(best.to.date)]} to keep leg work off the day before the long run.`;
    if (best.from.sessionId) best.from.adjustNote = `Swapped here to make room for ${moved.title}.`;
  }

  for (const v of findViolations(days, byId, outsideHard, input.today)) {
    const day = days.find((d) => d.date === (v.kind === "adjacent" ? v.b : v.legDay));
    if (!day) continue;
    day.warning =
      v.kind === "adjacent"
        ? "Two hard days in a row and no open day to move one to — take this one easier, or swap it yourself."
        : "Leg work the day before the long run — keep it light, or skip the leg exercises.";
  }

  // Each day placed against the long run, from where things actually landed.
  const longDay = days.find((d) => isLong(d.sessionId ? byId.get(d.sessionId) : undefined));
  if (longDay) {
    const miles = byId.get(longDay.sessionId!)?.miles;
    const label = `${miles ? `${miles}-mile ` : ""}long run (${SHORT_DAY[dow(longDay.date)]})`;
    for (const d of days) {
      if (d.date < input.today || !d.sessionId || d === longDay) continue;
      const gap = daysBetweenKeys(d.date, longDay.date);
      d.contextNote =
        gap === 1 ? `Day before the ${label}` : gap === -1 ? `Day after the ${label}` : gap > 0 ? `${gap} days before the ${label}` : `${-gap} days after the ${label}`;
    }
  }

  // Mileage: warn, don't change — mileage is fitted at generation.
  if (input.weeklyTarget) {
    const planned = days
      .filter((d) => d.date >= input.today && d.status !== "done" && d.sessionId)
      // The race itself isn't training mileage.
      .reduce((sum, d) => sum + (isRace(byId.get(d.sessionId!)) ? 0 : byId.get(d.sessionId!)?.miles ?? 0), 0);
    const total = (input.milesDone ?? 0) + planned;
    if (total > input.weeklyTarget * 1.25) warnings.push(`This week adds up to ${Math.round(total)} mi against a ${input.weeklyTarget} mi target.`);
    if (total < input.weeklyTarget * 0.75) warnings.push(`This week adds up to ${Math.round(total)} mi — short of the ${input.weeklyTarget} mi target.`);
  }

  return { days, sessions, warnings };
}
