import { DEFAULT_PACE_ZONES, type PaceRange, type PaceZones } from "@/lib/paceZones";
import type { MuscleRegion } from "@/lib/muscles";
import type { PlanExercise, PlanSession } from "@/lib/planner/types";
import type { RunType } from "@/lib/types";

// ── The run half of a planned session ─────────────────────────────────
//
// Target paces come from the pace zones in code (lib/paceZones.ts: the race
// goal and the athlete's own runs), never from the model. The model names the run type and
// (optionally) its structure; older stored sessions without either are read
// from the title.

export type { PaceRange } from "@/lib/paceZones";

/** The fixed table (8:01 goal) — what a plan shows when no zones are passed. */
export const PACE_ZONES: Record<RunType, PaceRange | null> = DEFAULT_PACE_ZONES.zones;

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
  /** Heart-rate ceiling for easy and long runs — pace is a guide, this is the rule. */
  hrCap: number | null;
}

// Defaults from a highest recorded heart rate of 185 (Garmin, Jul 2026):
// easy running stays under 80% of max, long runs under 84%. The live caps
// come from the runs (lib/paceZones.ts). Through Oct 2026 almost all "easy"
// minutes were in Garmin zones 3–5.
export const EASY_HR_CAP = DEFAULT_PACE_ZONES.easyHrCap;
export const LONG_HR_CAP = DEFAULT_PACE_ZONES.longHrCap;

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

export function plannedRunFor(session: PlanSession, zones: PaceZones = DEFAULT_PACE_ZONES): PlannedRun | null {
  if (!hasRun(session)) return null;
  const stored = session.run;
  const type: RunType =
    stored?.type && RUN_TYPE_SET.has(stored.type) ? stored.type : inferRunType(`${session.title} ${stored?.structure ?? ""}`);
  const structure = stored?.structure?.trim() || null;
  const pace = zones.zones[type];
  // Anything beyond an easy or long run, or with a written structure, has
  // easy running around the quality — show both paces.
  const repeats = /interval|repeat|\breps?\b|fartlek|\b\d+\s*[x×]\s*\d/i.test(session.title);
  const steady =
    !structure && !repeats && (type === "Easy" || type === "Long" || type === "Tempo" || type === "Marathon Pace");
  return {
    type,
    miles: session.miles,
    pace,
    easyPace: type === "Easy" || type === "Long" || steady ? null : zones.zones.Easy,
    structure,
    steady,
    hrCap: type === "Easy" ? zones.easyHrCap : type === "Long" ? zones.longHrCap : null,
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
export function runPrefillQuery(session: PlanSession, date: string | null, zones?: PaceZones): string {
  const run = plannedRunFor(session, zones);
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
