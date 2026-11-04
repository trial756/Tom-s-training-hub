import type { DayLog } from "@/lib/planner/schedule";
import type { PlanDay, PlanSession } from "@/lib/planner/types";

export const WEEK = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];
export const DOW: Record<string, string> = Object.fromEntries(WEEK.map((d, i) => [d, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]]));

type Opts = Partial<PlanSession> & { runType?: NonNullable<PlanSession["run"]>["type"] };
export function session(id: string, kind: PlanSession["kind"], title: string, o: Opts = {}): PlanSession {
  const { runType, ...rest } = o;
  return {
    id, kind, title, rationale: "", regions: [], exercises: [], priority: 50, preferredDow: null, taxesLegs: false, miles: null,
    run: runType ? { type: runType, structure: null } : null,
    ...rest,
  };
}
export const ex = (name: string, sets = 3, reps = "8-10") => ({ name, sets, reps, target: null, cue: null, isNew: false, regions: [] });

export function emptyLogs(): Record<string, DayLog> {
  return Object.fromEntries(WEEK.map((d) => [d, { hasWorkout: false, hasRun: false, summary: "", regions: [], runs: [] }]));
}

export function byDay(days: PlanDay[], sessions: PlanSession[]): Record<string, string | undefined> {
  return Object.fromEntries(days.map((d) => [DOW[d.date] ?? d.date, sessions.find((s) => s.id === d.sessionId)?.title]));
}
