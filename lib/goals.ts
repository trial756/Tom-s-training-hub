import { daysBetweenKeys, localDateKey, shiftDays, startOfWeekSunday } from "@/lib/format";
import { buildMarathonPlan, type PlanWeek } from "@/lib/marathonPlan";

// ── Goals → training blocks ──────────────────────────────────────────
//
// What the training is for lives in the `goals` table, not in code. Each
// week the planner asks blockForWeek() what that week is:
//   • race      — inside an A or B race's build (weeks counted back from
//                 its date), with weekly mileage and long-run targets
//   • recovery  — the week(s) right after a race
//   • focus     — a "focus" goal is active (e.g. muscle & athleticism);
//                 with no goal set at all, muscle & athleticism is the goal
// C races ("for fun") get no block of their own; they show up in
// `upcoming` so the week around them eases off.

export type GoalKind = "race" | "focus";
export type GoalPriority = "A" | "B" | "C";
export type FocusType = "athleticism" | "strength" | "hypertrophy" | "endurance" | "general";

export interface Goal {
  id: string;
  kind: GoalKind;
  title: string;
  /** Race day, or the day a focus starts. YYYY-MM-DD. */
  date: string;
  priority: GoalPriority;
  /** Races only. */
  distance_mi?: number | null;
  /** Races only: the goal finish time in seconds. */
  target_seconds?: number | null;
  /** Focus goals only. */
  focus?: FocusType | null;
  notes?: string | null;
  /** A hand-built week-by-week plan in code (lib/marathonPlan) instead of the generated one. */
  plan_key?: string | null;
  status?: "active" | "done" | "dropped";
}

/** Used when the goals table is empty or unreachable, and in tests. */
export const DEFAULT_GOALS: Goal[] = [
  {
    id: "dallas-2026",
    kind: "race",
    title: "Dallas Marathon",
    date: "2026-12-13",
    priority: "A",
    distance_mi: 26.2,
    target_seconds: 3 * 3600 + 30 * 60,
    plan_key: "dallas-2026",
    notes: "3:30 attempt. Weeks 18–27 rescaled in Oct 2026 off the real base.",
    status: "active",
  },
  {
    id: "half-2027",
    kind: "race",
    title: "Half marathon",
    date: "2027-02-28",
    priority: "C",
    distance_mi: 13.1,
    target_seconds: null,
    notes: "For fun. No dedicated block.",
    status: "active",
  },
  {
    id: "athleticism-2026",
    kind: "focus",
    title: "Muscle & athleticism",
    date: "2026-12-14",
    priority: "A",
    focus: "athleticism",
    notes: "Hypertrophy plus power, speed, agility and conditioning. Running stays in as conditioning.",
    status: "active",
  },
];

/** What the training is for when no goal is set. */
export const DEFAULT_FOCUS: Goal = {
  id: "default-focus",
  kind: "focus",
  title: "Muscle & athleticism",
  date: "",
  priority: "A",
  focus: "athleticism",
  notes: "Hypertrophy plus power, speed, agility and conditioning. Running stays in as conditioning.",
  status: "active",
};

export interface RaceBlock {
  planWeek: number;
  totalWeeks: number;
  phase: string;
  weeklyMileage: number;
  longRunMiles: number;
  focus: string;
  isRecoveryWeek: boolean;
  isRaceWeek: boolean;
  daysToRace: number;
}

export interface TrainingBlock {
  kind: "race" | "recovery" | "focus" | "base";
  /** The goal this week serves (the race, the race just run, or the focus). */
  goal: Goal | null;
  /** Set for race blocks; the same shape the planner has always used. */
  race: RaceBlock | null;
  /** Races in the next three weeks that aren't this block's own (C races, tune-ups). */
  upcoming: { title: string; date: string; distance_mi: number | null; priority: GoalPriority; daysAway: number }[];
  /** One line on what the week is for, for the header and the planner. */
  summary: string;
}

const live = (g: Goal) => (g.status ?? "active") === "active";

/** How many weeks a race's build runs, by distance. */
export function buildWeeks(distanceMi: number): number {
  if (distanceMi >= 20) return 18;
  if (distanceMi >= 10) return 12;
  if (distanceMi >= 5) return 8;
  return 6;
}

function recoveryWeeks(distanceMi: number): number {
  if (distanceMi >= 20) return 2;
  if (distanceMi >= 10) return 1;
  return 0;
}

/** Peak weekly miles and peak long run for a race distance. */
function peakFor(distanceMi: number): { weekly: number; long: number } {
  if (distanceMi >= 20) return { weekly: 35, long: 20 };
  if (distanceMi >= 10) return { weekly: 28, long: 12 };
  if (distanceMi >= 5) return { weekly: 25, long: 8 };
  return { weekly: 20, long: 6 };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function goalPaceSeconds(goal: Goal): number | null {
  return goal.distance_mi && goal.target_seconds ? Math.round(goal.target_seconds / goal.distance_mi) : null;
}

/**
 * A generated week-by-week build for a race with no hand-built plan: a
 * steady climb from 65% of peak with a cutback every fourth week, peak in
 * the last build weeks, then a taper (three weeks for a marathon, two for a
 * half, one below that). Week n of `total` is the race week.
 */
export function generatedRaceWeek(goal: Goal, weekNumber: number, total: number): Omit<RaceBlock, "daysToRace"> {
  const dist = goal.distance_mi ?? 13.1;
  const { weekly, long } = peakFor(dist);
  const taper = dist >= 20 ? 3 : dist >= 10 ? 2 : 1;
  const fromEnd = total - weekNumber; // 0 = race week
  const pace = goalPaceSeconds(goal);
  const goalText = pace ? ` at ${fmt(pace)}/mi goal pace` : "";
  if (fromEnd < taper) {
    const share = [0.45, 0.65, 0.8][fromEnd] ?? 0.8;
    const isRaceWeek = fromEnd === 0;
    return {
      planWeek: weekNumber,
      totalWeeks: total,
      phase: "Taper",
      weeklyMileage: Math.round(weekly * share),
      longRunMiles: isRaceWeek ? Math.min(4, Math.round(long * 0.3)) : Math.round(long * (fromEnd === 1 ? 0.55 : 0.7)),
      focus: isRaceWeek
        ? `Race week: short easy shakeouts, then ${goal.title} — ${dist} mi${goalText}.`
        : "Taper: less volume, same sharpness. Keep a little goal-pace work.",
      isRecoveryWeek: false,
      isRaceWeek,
    };
  }
  const buildLen = total - taper;
  const progress = buildLen <= 1 ? 1 : (weekNumber - 1) / (buildLen - 1);
  const isRecoveryWeek = weekNumber % 4 === 0 && weekNumber < buildLen;
  const share = (0.65 + 0.35 * progress) * (isRecoveryWeek ? 0.8 : 1);
  const phase = progress < 0.4 ? "Base" : progress < 0.8 ? "Build" : "Peak";
  return {
    planWeek: weekNumber,
    totalWeeks: total,
    phase,
    weeklyMileage: Math.round(weekly * share),
    longRunMiles: Math.round(long * (0.6 + 0.4 * progress) * (isRecoveryWeek ? 0.75 : 1)),
    focus: isRecoveryWeek
      ? "Cutback week: easy miles to absorb the build."
      : phase === "Base"
      ? "Easy aerobic volume and strides; build the routine."
      : phase === "Build"
      ? `Threshold work and a longer long run${pace ? `, with some miles at ${fmt(pace)}/mi` : ""}.`
      : `Race-specific work${goalText}; the longest runs of the block.`,
    isRecoveryWeek,
    isRaceWeek: false,
  };
}

/** Hand-built plans, by key. */
const HAND_PLANS: Record<string, () => PlanWeek[]> = {
  "dallas-2026": buildMarathonPlan,
};

function raceBlockFor(goal: Goal, weekStart: string, todayKey: string): RaceBlock | null {
  const daysToRace = Math.max(0, daysBetweenKeys(todayKey, goal.date));
  const hand = goal.plan_key ? HAND_PLANS[goal.plan_key]?.() : null;
  if (hand) {
    const w = hand.find((x) => weekStart >= x.startDate && weekStart <= x.endDate);
    if (!w) return null;
    return {
      planWeek: w.weekNumber,
      totalWeeks: hand.length,
      phase: w.phase,
      weeklyMileage: w.weeklyMileage,
      longRunMiles: w.longRunMiles,
      focus: w.keyWorkout,
      isRecoveryWeek: w.isRecoveryWeek,
      isRaceWeek: w.isRaceWeek,
      daysToRace,
    };
  }
  // Generated: the race week is the Sun–Sat week holding the day before the race.
  const raceWeekStart = localDateKey(startOfWeekSunday(shiftDays(new Date(`${goal.date}T12:00:00`), -1)));
  const weeksOut = Math.round(daysBetweenKeys(weekStart, raceWeekStart) / 7); // 0 = race week
  const total = buildWeeks(goal.distance_mi ?? 13.1);
  if (weeksOut < 0 || weeksOut >= total) return null;
  return { ...generatedRaceWeek(goal, total - weeksOut, total), daysToRace };
}

/**
 * What the week starting `weekStart` (a Sunday) is for. Goals are read in
 * this order: an A/B race whose build covers the week, the recovery after a
 * race, the latest focus that has started, else base fitness.
 */
export function blockForWeek(goals: Goal[], weekStart: string, todayKey: string): TrainingBlock {
  const weekEnd = localDateKey(shiftDays(new Date(`${weekStart}T12:00:00`), 6));
  const active = goals.filter(live);
  const races = active.filter((g) => g.kind === "race").sort((a, b) => a.date.localeCompare(b.date));

  const upcomingFor = (own: Goal | null) =>
    races
      .filter((r) => r !== own && r.date >= weekStart && daysBetweenKeys(weekStart, r.date) <= 21)
      .map((r) => ({
        title: r.title,
        date: r.date,
        distance_mi: r.distance_mi ?? null,
        priority: r.priority,
        daysAway: daysBetweenKeys(todayKey > weekStart ? todayKey : weekStart, r.date),
      }));

  // 1. A or B race build.
  for (const r of races.filter((x) => x.priority !== "C" && x.date >= weekStart)) {
    const race = raceBlockFor(r, weekStart, todayKey);
    if (race) {
      return {
        kind: "race",
        goal: r,
        race,
        upcoming: upcomingFor(r),
        summary: `${r.title} — week ${race.planWeek} of ${race.totalWeeks}, ${race.phase}`,
      };
    }
  }

  // 2. Recovery after an A or B race: every week that starts within its
  // recovery span (two weeks for a marathon, one for a half). A Sunday race
  // sits in the first day of the following training week, so that week
  // counts. A race marked done still gets its recovery.
  const raced = goals
    .filter((g) => g.kind === "race" && (g.status ?? "active") !== "dropped")
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const r of raced.filter((x) => x.priority !== "C" && x.date <= weekEnd).reverse()) {
    if (daysBetweenKeys(r.date, weekStart) < 7 * recoveryWeeks(r.distance_mi ?? 0)) {
      return {
        kind: "recovery",
        goal: r,
        race: null,
        upcoming: upcomingFor(null),
        summary: `Recovery after ${r.title}`,
      };
    }
    break;
  }

  // 3. The latest focus that has started.
  const focus = active
    .filter((g) => g.kind === "focus" && g.date <= weekEnd)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (focus) {
    return { kind: "focus", goal: focus, race: null, upcoming: upcomingFor(null), summary: focus.title };
  }

  // 4. Nothing set: muscle and athleticism is the standing goal (Tom, Nov 2026).
  return { kind: "focus", goal: { ...DEFAULT_FOCUS, date: weekStart }, race: null, upcoming: upcomingFor(null), summary: DEFAULT_FOCUS.title };
}

/** The next race with a date still ahead (any priority), for countdowns. */
export function nextRace(goals: Goal[], todayKey: string): Goal | null {
  return goals.filter(live).filter((g) => g.kind === "race" && g.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}
