import type { MuscleRegion } from "@/lib/muscles";

/** What a day's session asks for. */
export type PlanDayKind = "lift" | "run" | "lift_and_run" | "active_recovery" | "rest";

export interface PlanExercise {
  name: string;
  sets: number;
  reps: string; // a range, e.g. "6-8"
  /** Suggested load, anchored to the last top set where there's history. */
  target: string | null;
  /** One-line form cue — only populated for movements with no history. */
  cue: string | null;
  isNew: boolean;
  regions: MuscleRegion[];
}

/**
 * A session the week needs, independent of which day it lands on. The
 * generator produces these; the scheduler assigns them to days and can
 * reassign them when a day goes off script.
 */
export interface PlanSession {
  id: string;
  kind: PlanDayKind;
  title: string;
  /** Why this session is in the week at all — shown under the title. */
  rationale: string;
  regions: MuscleRegion[];
  exercises: PlanExercise[];
  /** Lower sorts earlier when the scheduler places sessions. */
  priority: number;
  /** 0=Sunday..6=Saturday hint from the generator; the scheduler decides. */
  preferredDow: number | null;
  /** True when heavy legs make this a poor neighbour for a key run day. */
  taxesLegs: boolean;
  /** Planned distance for run sessions, so weekly mileage can be reconciled. */
  miles: number | null;
  /** Set when the reconciler added or lengthened this run to close a gap. */
  addedByReconciler?: boolean;
}

export type PlanDayStatus = "upcoming" | "today" | "done" | "off_script" | "missed";

export interface PlanDay {
  date: string; // local date key
  /** Sunday of the training week this day belongs to. Set when days from several weeks share a strip. */
  weekStart?: string;
  sessionId: string | null;
  /** Running the marathon plan asks for on this day, if any. */
  runNote: string | null;
  isKeyRunDay: boolean;
  status: PlanDayStatus;
  /** Set once the day is in the past and something was logged. */
  loggedSummary: string | null;
}

/** One training week touched by the day strip. */
export interface PlanWeekMeta {
  weekStart: string;
  weekEnd: string;
  planWeek: number | null;
  phase: string | null;
  headline: string;
  weeklyMileage: number | null;
  /** A future week with no plan yet — the client asks for it separately. */
  pending: boolean;
}

/**
 * The current week's plan, plus an 11-day strip centred on today that can
 * reach into the previous and next weeks. `days` is the strip; `sessions`
 * covers every week it touches, with ids prefixed by week ("2026-10-11:s3")
 * so weeks can't collide.
 */
export interface WeekPlan {
  /** Today's date key — today's status is "done" once it's logged, so it can't be found by status. */
  today: string;
  weekStart: string;
  weekEnd: string;
  planWeek: number | null;
  phase: string | null;
  headline: string;
  sessions: PlanSession[];
  days: PlanDay[];
  weeks: PlanWeekMeta[];
  generatedAt: string;
}

export interface RegionSnapshot {
  region: MuscleRegion;
  label: string;
  daysSince: number | null;
  primarySets: number;
  secondarySets: number;
  sessions: number;
  runMiles: number;
}

export interface LiftAnchor {
  name: string;
  lastTopSet: number | null;
  lastDate: string | null;
  sessions: number;
  regions: MuscleRegion[];
}

/**
 * Everything the generator is allowed to reason from — computed in code so
 * the model never has to infer history, only plan against it.
 */
export interface PlannerContext {
  today: string;
  weekStart: string;
  weekEnd: string;
  daysRemaining: number;
  marathon: {
    planWeek: number;
    phase: string;
    weeklyMileage: number;
    longRunMiles: number;
    focus: string;
    isRecoveryWeek: boolean;
    isRaceWeek: boolean;
    daysToRace: number;
  } | null;
  milesThisWeek: number;
  milesRemaining: number;
  loggedThisWeek: { date: string; kind: "workout" | "run"; summary: string }[];
  regions: RegionSnapshot[];
  neglected: string[];
  liftDaysPerWeek: number;
  runDaysPerWeek: number;
  /** Recent actual weekly mileage, which bounds how fast volume may grow. */
  avgWeeklyMiles: number;
  /** Typical single-run distance, used when sizing an added run. */
  typicalRunMiles: number;
  anchors: LiftAnchor[];
  /** Set when planning a week ahead: what the current week still has scheduled. */
  plannedBeforeWeek?: {
    note: string;
    sessions: { date: string; title: string; kind: PlanDayKind; regions: MuscleRegion[] }[];
  };
}
