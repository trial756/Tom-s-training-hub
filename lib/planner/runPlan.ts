import { GOAL_PACE_SECONDS_PER_MILE } from "@/lib/marathonPlan";
import type { MuscleRegion } from "@/lib/muscles";
import type { PlanExercise, PlanSession } from "@/lib/planner/types";
import type { RunType } from "@/lib/types";

// ── The run half of a planned session ─────────────────────────────────
//
// Target paces come from the fixed pace zones in code, never from the model,
// so a plan can't drift off the 8:01 goal. The model names the run type and
// (optionally) its structure; older stored sessions without either are read
// from the title.

export interface PaceRange {
  low: number; // fastest, s/mi
  high: number; // slowest, s/mi
}

export const PACE_ZONES: Record<RunType, PaceRange | null> = {
  Easy: { low: 9 * 60 + 30, high: 10 * 60 + 30 },
  Long: { low: 9 * 60, high: 9 * 60 + 30 },
  "Marathon Pace": { low: GOAL_PACE_SECONDS_PER_MILE, high: GOAL_PACE_SECONDS_PER_MILE },
  Tempo: { low: 7 * 60 + 20, high: 7 * 60 + 40 },
  // Work reps run at threshold or quicker; recoveries are easy jogging.
  Interval: { low: 7 * 60, high: 7 * 60 + 40 },
  Race: { low: GOAL_PACE_SECONDS_PER_MILE, high: GOAL_PACE_SECONDS_PER_MILE },
  Other: null,
};

const EASY = PACE_ZONES.Easy!;

export interface PlannedRun {
  type: RunType;
  miles: number | null;
  /** Target pace for the effort that defines the run (MP segments, tempo, reps). */
  pace: PaceRange | null;
  /** Easy pace for warm-up, cool-down and recoveries when the run has structure. */
  easyPace: PaceRange | null;
  /** e.g. "1 mi easy · 3 × 1.5 mi @ MP (90s jog) · 1 mi easy". */
  structure: string | null;
  /** True when the run is one steady effort, so its target is also its average pace. */
  steady: boolean;
}

const RUN_TYPE_SET = new Set<string>(["Easy", "Long", "Tempo", "Marathon Pace", "Interval", "Race", "Other"]);

/** Reads a run type out of free text — titles from plans made before run types were stored. */
export function inferRunType(text: string): RunType {
  const t = text.toLowerCase();
  if (/\brace\b/.test(t)) return "Race";
  if (/\blong\b/.test(t)) return "Long";
  if (/\bmp\b|marathon[- ]pace|goal[- ]pace/.test(t)) return "Marathon Pace";
  if (/tempo|threshold|\blt\b/.test(t)) return "Tempo";
  if (/interval|repeat|\breps?\b|fartlek|\b\d+\s*[x×]\s*\d/.test(t)) return "Interval";
  return "Easy";
}

export function hasRun(session: PlanSession): boolean {
  return session.kind === "run" || session.kind === "lift_and_run";
}

export function plannedRunFor(session: PlanSession): PlannedRun | null {
  if (!hasRun(session)) return null;
  const stored = session.run;
  const type: RunType =
    stored?.type && RUN_TYPE_SET.has(stored.type) ? stored.type : inferRunType(`${session.title} ${stored?.structure ?? ""}`);
  const structure = stored?.structure?.trim() || null;
  const pace = PACE_ZONES[type];
  // Anything beyond an easy or long run, or with a written structure, has
  // easy running around the quality — show both paces.
  const repeats = /interval|repeat|\breps?\b|fartlek|\b\d+\s*[x×]\s*\d/i.test(session.title);
  const steady =
    !structure && !repeats && (type === "Easy" || type === "Long" || type === "Tempo" || type === "Marathon Pace");
  return {
    type,
    miles: session.miles,
    pace,
    easyPace: type === "Easy" || type === "Long" || steady ? null : EASY,
    structure,
    steady,
  };
}

/** "8:01" or "9:30–10:30". */
export function formatPaceRange(range: PaceRange | null): string {
  if (!range) return "";
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  return range.low === range.high ? clock(range.low) : `${clock(range.low)}–${clock(range.high)}`;
}

/** Digits the Runs form's pace field takes ("801" for 8:01) — the middle of a range. */
export function paceDigits(range: PaceRange | null): string {
  if (!range) return "";
  const s = range.low === range.high ? range.low : Math.round((range.low + range.high) / 2);
  return `${Math.floor(s / 60)}${String(Math.round(s % 60)).padStart(2, "0")}`;
}

// ── The lift half ─────────────────────────────────────────────────────

const RUN_WORDS = /\b(run|runs|mi|miles?|easy|long|tempo|mp|marathon|interval|intervals|repeats?|strides|fartlek|shakeout|jog|race)\b/i;

/** Title of the lift (or mobility block) part of a session — "MP intervals + Pull & rear delts" → "Pull & rear delts". */
export function liftTitleFor(session: PlanSession): string {
  if (!hasRun(session)) return session.title;
  const parts = session.title.split(/\s+\+\s+|\s+&\s+(?=[A-Z])|\s+with\s+/);
  const lift = parts.filter((p) => !RUN_WORDS.test(p));
  if (lift.length) return lift.join(" + ");
  return session.kind === "lift_and_run" ? "Lift" : "Mobility + core";
}

/** Title of the run part — "MP intervals + Pull & rear delts" → "MP intervals". */
export function runTitleFor(session: PlanSession): string {
  const parts = session.title.split(/\s+\+\s+/);
  const run = parts.filter((p) => RUN_WORDS.test(p));
  return run.length ? run.join(" + ") : session.title;
}

/** Regions the lift / mobility work targets — the run's legs aren't the lift's. */
export function liftRegionsFor(session: PlanSession): MuscleRegion[] {
  if (session.exercises.length === 0) return hasRun(session) ? [] : session.regions;
  return Array.from(new Set(session.exercises.flatMap((e) => e.regions)));
}

/** One exercise per line, so a number can be fixed on its own line one-handed. */
export function liftPrefill(session: PlanSession): string {
  const line = (e: PlanExercise) => `${e.name} — ${e.sets}×${e.reps}${e.target ? ` @ ${e.target}` : ""}`;
  return [liftTitleFor(session), ...session.exercises.map(line)].join("\n");
}

/** Query string that opens the Runs form filled in from the plan. */
export function runPrefillQuery(session: PlanSession, date: string | null): string {
  const run = plannedRunFor(session);
  if (!run) return "";
  const params = new URLSearchParams({ plan: "1", runType: run.type });
  if (run.miles) params.set("distance", String(run.miles));
  if (run.steady && run.pace) params.set("pace", paceDigits(run.pace));
  // A structured run's average pace isn't its target, so the target rides in
  // the notes instead of the pace box.
  const what = run.structure ?? (run.steady ? null : runTitleFor(session));
  const note = what
    ? `Plan: ${what}${run.pace ? ` — target ${formatPaceRange(run.pace)}/mi` : ""}` +
      (run.easyPace ? `, easy ${formatPaceRange(run.easyPace)}/mi between` : "")
    : "";
  if (note) params.set("notes", note);
  if (date) params.set("date", date);
  return params.toString();
}
