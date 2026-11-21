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
  /**
   * Long runs of 16+ mi just before this week (the previous Saturday), logged
   * or planned — the day after one is a recovery day even across the week line.
   */
  longBefore?: { date: string; miles: number }[];
  /** When chest, back and shoulders were last trained before this week (logged, or still planned). */
  lastTrained?: Partial<Record<UpperGroup, string>>;
}

// ── Recovery after a long run, and no muscle left a week ──────────────
//
// Nov 21 2026: the week after a 20-miler opened with an easy run + heavy
// rows on the Sunday and put "the day after the long run" recovery walk on
// the Monday; and chest went nine days (Wed → the next Friday) while
// shoulders came on back-to-back days. Two rules, fixed by swapping days
// like the others: the day after a 16+ mile long run holds a light session
// (walk/mobility, or an easy run of 4 mi or less, no lifting), and chest,
// back and shoulders each come back within 7 days of when they were last
// trained.

export const RECOVERY_AFTER_MILES = 16;
export const MAX_GAP_DAYS = 7;
export type UpperGroup = "chest" | "back" | "shoulders";
const GROUP_OF: Partial<Record<string, UpperGroup>> = {
  horizontal_press: "chest",
  fly: "chest",
  horizontal_pull: "back",
  vertical_pull: "back",
  vertical_press: "shoulders",
  lateral_raise: "shoulders",
  rear_delt: "shoulders",
};
const GROUP_LABEL: Record<UpperGroup, string> = { chest: "Chest", back: "Back", shoulders: "Shoulders" };

/** The upper-body groups a session trains (lifts only). */
export function upperGroupsOf(s: PlanSession | undefined): UpperGroup[] {
  if (!s || (s.kind !== "lift" && s.kind !== "lift_and_run")) return [];
  return groupsOfNames(s.exercises.map((e) => e.name));
}

/** The upper-body groups a list of exercise names trains. */
export function groupsOfNames(names: string[]): UpperGroup[] {
  const out = new Set<UpperGroup>();
  for (const n of names) {
    const g = GROUP_OF[patternOf(n)];
    if (g) out.add(g);
  }
  return [...out];
}

/** Latest date each group was trained, from (date, exercise names) pairs. */
export function lastTrainedFrom(entries: { date: string; names: string[] }[]): Partial<Record<UpperGroup, string>> {
  const out: Partial<Record<UpperGroup, string>> = {};
  for (const e of entries) for (const g of groupsOfNames(e.names)) if (!out[g] || out[g]! < e.date) out[g] = e.date;
  return out;
}

/** A recovery-day session: walk and mobility, or a short easy run with no lifting. */
export function isLight(s: PlanSession | undefined): boolean {
  if (!s) return true;
  if (s.kind === "active_recovery" || s.kind === "rest") return true;
  if (s.kind !== "run" || s.taxesLegs) return false;
  const run = plannedRunFor(s);
  return (!run || run.type === "Easy") && (s.miles ?? 0) <= 4;
}

export interface WeekCheck {
  days: PlanDay[];
  sessions: PlanSession[];
  warnings: string[];
}

type Violation =
  | { kind: "adjacent"; a: string; b: string }
  | { kind: "legs_before_long"; legDay: string; longDay: string }
  | { kind: "after_long"; day: string; miles: number }
  | { kind: "stale"; group: UpperGroup; day: string; deadline: string; last: string };

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

function findViolations(
  days: PlanDay[],
  byId: Map<string, PlanSession>,
  outsideHard: string[],
  today: string,
  extra: { longBefore?: { date: string; miles: number }[]; lastTrained?: Partial<Record<UpperGroup, string>> } = {}
): Violation[] {
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
  // The day after a 16+ mile long run (this week's, or the previous Saturday's) is light.
  const longs = [
    ...(extra.longBefore ?? []),
    ...days.filter((d) => isLong(at.get(d.date))).map((d) => ({ date: d.date, miles: at.get(d.date)?.miles ?? 0 })),
  ].filter((l) => l.miles >= RECOVERY_AFTER_MILES);
  for (const l of longs) {
    const next = days.find((d) => daysBetweenKeys(l.date, d.date) === 1);
    if (next && next.date >= today && !isLight(at.get(next.date))) out.push({ kind: "after_long", day: next.date, miles: l.miles });
  }
  // Chest, back and shoulders back within a week: the first session that
  // trains a group mustn't land after its deadline when the deadline is inside the week.
  // (When each was last trained comes from the logs, not from what past days had planned.)
  const lastTrained = extra.lastTrained ?? {};
  const earliest = days.find((d) => d.date >= today)?.date;
  for (const [g, last] of Object.entries(lastTrained) as [UpperGroup, string][]) {
    if (!earliest) break;
    // Already overdue: as soon as possible.
    const deadline = addDays(last, MAX_GAP_DAYS) < earliest ? earliest : addDays(last, MAX_GAP_DAYS);
    const first = days.find((d) => d.date >= today && upperGroupsOf(at.get(d.date)).includes(g));
    if (first && first.date > deadline) out.push({ kind: "stale", group: g, day: first.date, deadline, last });
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
  const extra = { longBefore: input.longBefore, lastTrained: input.lastTrained };
  const count = () => findViolations(days, byId, outsideHard, input.today, extra).length;

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
    const violations = findViolations(days, byId, outsideHard, input.today, extra);
    if (!violations.length) break;
    const v = violations[0];
    // Which day's session to move: the later hard day (not the long run if
    // avoidable), or the leg day before the long run.
    const candidates =
      v.kind === "adjacent"
        ? [v.b, v.a].map((date) => days.find((d) => d.date === date)).filter((d): d is PlanDay => !!d && movable(d))
            .sort((p, q) => Number(isLong(byId.get(p.sessionId!))) - Number(isLong(byId.get(q.sessionId!))))
        : v.kind === "legs_before_long"
          ? [days.find((d) => d.date === v.legDay)].filter((d): d is PlanDay => !!d && movable(d))
          : [days.find((d) => d.date === v.day)].filter((d): d is PlanDay => !!d && movable(d));
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
        : v.kind === "legs_before_long"
          ? `Moved to ${SHORT_DAY[dow(best.to.date)]} to keep leg work off the day before the long run.`
          : v.kind === "after_long"
            ? `Moved to ${SHORT_DAY[dow(best.to.date)]} so the day after the ${v.miles}-mile long run stays easy.`
            : `Moved to ${SHORT_DAY[dow(best.to.date)]} so ${GROUP_LABEL[v.group].toLowerCase()} isn't left more than a week.`;
    if (best.from.sessionId) best.from.adjustNote = `Swapped here to make room for ${moved.title}.`;
  }

  for (const v of findViolations(days, byId, outsideHard, input.today, extra)) {
    const day = days.find((d) => d.date === (v.kind === "adjacent" ? v.b : v.kind === "legs_before_long" ? v.legDay : v.day));
    if (!day) continue;
    day.warning =
      v.kind === "adjacent"
        ? "Two hard days in a row and no open day to move one to — take this one easier, or swap it yourself."
        : v.kind === "legs_before_long"
          ? "Leg work the day before the long run — keep it light, or skip the leg exercises."
          : v.kind === "after_long"
            ? `Day after the ${v.miles}-mile long run — keep it to a walk, mobility or a short easy jog.`
            : `${GROUP_LABEL[v.group]} was last trained ${v.last.slice(5)}, more than a week before this.`;
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
