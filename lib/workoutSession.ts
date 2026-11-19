import { blockOf, hasRun, type Block } from "@/lib/planner/blocks";
import type { PlanExercise, PlanSession } from "@/lib/planner/types";
import type { Exercise } from "@/lib/types";

// ── During-workout mode ───────────────────────────────────────────────
//
// A workout in progress lives on the phone (localStorage), not the server:
// it survives switching apps, a locked screen or a reload mid-set, and costs
// nothing until it's finished. Finishing turns the ticked sets into a normal
// workout log — exact numbers plus the usual AI coaching.

export interface ActiveSet {
  /** Kept as typed so a half-entered number isn't mangled. */
  weight: string;
  /** Reps — or, for a timed exercise, seconds held (per side when it has two). */
  reps: string;
  done: boolean;
}

export interface ActiveExercise {
  id: string;
  name: string;
  /** What the plan asked for: "3 × 6-8 @ 185 lb". */
  target: string | null;
  note: string | null;
  /** How to do it (from the plan); a new movement's is shown in full. */
  cue: string | null;
  isNew?: boolean;
  restSec: number;
  /** A hold (plank, wall sit): sets are seconds and get a countdown, not reps. */
  timed?: boolean;
  /** Done on each side (side plank, Copenhagen): the countdown runs twice with a switch between. */
  sides?: 1 | 2;
  /** Warm-up and stretches are a checklist (one tick, no rest), apart from the workout's sets. */
  block?: Block;
  /** What the plan asked for, as written ("15 per side", "60s per side") — shown on checklist items. */
  reps?: string;
  sets: ActiveSet[];
}

/** A hold in progress. `switchUntil` is the pause to change sides before side two starts. */
export interface ActiveHold {
  exId: string;
  set: number;
  side: 1 | 2;
  sides: 1 | 2;
  seconds: number;
  endsAt: number;
  switchUntil: number | null;
}

export interface ActiveWorkout {
  version: 1;
  /** Local date key the workout is logged under. */
  date: string;
  title: string;
  startedAt: number;
  exercises: ActiveExercise[];
  /** When the running rest ends (epoch ms), so a backgrounded phone still counts it down. */
  restEndsAt: number | null;
  restTotal: number | null;
  hold?: ActiveHold | null;
  /** Paused (epoch ms): the clock stops until it's resumed — gym now, the rest at home later. */
  pausedAt?: number | null;
  /** Total time spent paused before the current pause, so the logged duration is training time only. */
  pausedMs?: number;
  /** Started from a session with a run, so warm-up and stretch read "before / after you run". */
  runDay?: boolean;
  /** Last change (epoch ms) — which copy wins when the phone's and the server's differ. */
  updatedAt?: number;
}

export const STORAGE_KEY = "tth-active-workout";

const uid = () => Math.random().toString(36).slice(2, 10);

/** First number in "185 lb", "185", "6-8" — or "" when there isn't one. */
export function firstNumber(text: string | null | undefined): string {
  const m = (text ?? "").match(/\d+(?:\.\d+)?/);
  return m ? m[0] : "";
}

/**
 * Rest by how heavy the work is: low-rep compounds need the longest. Core
 * and mobility barely need any.
 */
export function restFor(reps: string, name = ""): number {
  if (/plank|dead ?bug|pallof|bird ?dog|stretch|mobility|yoga|hold|carry|hollow/i.test(name)) return 45;
  const low = Number(firstNumber(reps));
  if (!low) return 90;
  if (low <= 5) return 180;
  if (low <= 7) return 120;
  if (low <= 12) return 90;
  return 60;
}

const TIMED_NAME = /plank|wall sit|dead hang|\bhold\b|l-sit|hollow body|isometric/i;
const TIMED_REPS = /\d\s*(s|sec|secs|seconds?|min|mins|minutes?)\b/i;
const TWO_SIDED = /per side|each side|\/\s*side|each leg|per leg|side plank|copenhagen|single[- ](arm|leg)|suitcase/i;

/** Holds are timed: by the prescription ("30-40s") or, with nothing to go on, by the movement. */
export function isTimed(reps: string, name: string): boolean {
  if (TIMED_REPS.test(reps)) return true;
  // A hold written as plain reps ("3 x 10") is reps; otherwise the movement decides.
  return TIMED_NAME.test(name) && !/^\s*\d+(\s*-\s*\d+)?\s*(reps?)?\s*$/i.test(reps);
}

export function sidesFor(reps: string, name: string): 1 | 2 {
  return TWO_SIDED.test(`${name} ${reps}`) ? 2 : 1;
}

/** Seconds from "30-40s", "1 min", "45 sec" — the low end of a range. */
export function holdSeconds(reps: string): string {
  const n = Number(firstNumber(reps));
  if (!n) return "";
  return String(/min/i.test(reps) ? n * 60 : n);
}

function fromPlanExercise(e: PlanExercise, runDay: boolean): ActiveExercise {
  const timed = isTimed(e.reps, e.name);
  const weight = firstNumber(e.target);
  const reps = timed ? holdSeconds(e.reps) : firstNumber(e.reps);
  const block = blockOf(e, runDay);
  // A warm-up drill or stretch is ticked once, however many rounds it asks for.
  const count = block === "main" ? Math.max(1, Math.min(10, Number(e.sets) || 3)) : 1;
  return {
    id: uid(),
    name: e.name,
    target: `${e.sets} × ${e.reps}${e.target ? ` @ ${e.target}` : ""}`,
    note: e.note ?? null,
    cue: e.cue ?? null,
    isNew: !!e.isNew,
    restSec: timed ? 45 : restFor(e.reps, e.name),
    timed,
    sides: sidesFor(e.reps, e.name),
    block,
    reps: e.reps,
    sets: Array.from({ length: count }, () => ({ weight, reps, done: false })),
  };
}

const BLOCK_ORDER: Record<Block, number> = { warmup: 0, main: 1, after: 2 };

/** Sets in the workout proper — warm-up and stretches don't count. */
export function setCounts(w: ActiveWorkout): { done: number; total: number; anyDone: boolean } {
  const main = w.exercises.filter((e) => (e.block ?? "main") === "main");
  return {
    total: main.reduce((n, e) => n + e.sets.length, 0),
    done: main.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0),
    anyDone: w.exercises.some((e) => e.sets.some((s) => s.done)),
  };
}

export function workoutFromSession(session: PlanSession, date: string, liftTitle: string): ActiveWorkout {
  return {
    version: 1,
    date,
    title: liftTitle,
    runDay: hasRun(session),
    startedAt: Date.now(),
    exercises: session.exercises
      .map((e) => fromPlanExercise(e, hasRun(session)))
      .sort((a, b) => BLOCK_ORDER[a.block ?? "main"] - BLOCK_ORDER[b.block ?? "main"]),
    restEndsAt: null,
    restTotal: null,
  };
}

export function emptyWorkout(date: string): ActiveWorkout {
  return { version: 1, date, title: "Workout", startedAt: Date.now(), exercises: [], restEndsAt: null, restTotal: null };
}

export function newExercise(name: string): ActiveExercise {
  const timed = isTimed("", name);
  return {
    id: uid(),
    name: name.trim(),
    target: null,
    note: null,
    cue: null,
    restSec: timed ? 45 : 90,
    timed,
    sides: sidesFor("", name),
    sets: [{ weight: "", reps: timed ? "30" : "", done: false }],
  };
}

export function loadActiveWorkout(): ActiveWorkout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw) as ActiveWorkout;
    return w?.version === 1 && Array.isArray(w.exercises) ? w : null;
  } catch {
    return null;
  }
}

export function saveActiveWorkout(w: ActiveWorkout | null, opts: { keepTime?: boolean } = {}) {
  try {
    if (w) localStorage.setItem(STORAGE_KEY, JSON.stringify(opts.keepTime ? w : { ...w, updatedAt: Date.now() }));
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("tth-active-workout"));
  } catch {
    // Private mode / storage full: the workout still runs, it just won't survive a reload.
  }
}

const num = (s: string) => {
  const n = Number(s);
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

/** The ticked sets, as the workout log stores them. Exercises with nothing ticked are left out. */
export function completedExercises(w: ActiveWorkout): (Exercise & { timed: boolean; sides: 1 | 2; block: Block })[] {
  return w.exercises
    .map((e) => ({
      name: e.name,
      sets: e.sets
        .filter((s) => s.done)
        .map((s) => {
          const weight = num(s.weight);
          if (e.timed) return { reps: null, weight: weight || null, weight_unit: weight ? "lb" : null, seconds: num(s.reps) };
          return { reps: num(s.reps), weight: weight || null, weight_unit: weight ? "lb" : null };
        }),
      timed: !!e.timed,
      sides: e.sides ?? 1,
      block: e.block ?? "main",
    }))
    .filter((e) => e.name && e.sets.length > 0);
}

/** "Back Squat: 185x5, 185x5, 185x4" per line — what the parser and History show as the raw log. */
export function workoutText(w: ActiveWorkout, notes = ""): string {
  const done = completedExercises(w);
  // Warm-up and stretches go on one line of their own, apart from the lifting.
  const mobility = done.filter((e) => e.block !== "main").map((e) => e.name);
  const lines = done.filter((e) => e.block === "main").map((e) => {
    const sets = e.sets
      .map((s) =>
        e.timed
          ? `${s.weight ? `${s.weight} lb ` : ""}${s.seconds ?? "?"}s`
          : s.weight
            ? `${s.weight}x${s.reps ?? "?"}`
            : `${s.reps ?? "?"} reps`
      )
      .join(", ");
    return `${e.name}${e.timed && e.sides === 2 ? " (each side)" : ""}: ${sets}`;
  });
  return [w.title, ...lines, mobility.length ? `Warm-up & stretch: ${mobility.join(", ")}` : "", notes.trim()].filter(Boolean).join("\n");
}

/** Training time so far: wall time since the start, less every pause. */
export function elapsedMs(w: ActiveWorkout, now = Date.now()): number {
  const paused = (w.pausedMs ?? 0) + (w.pausedAt ? now - w.pausedAt : 0);
  return Math.max(0, now - w.startedAt - paused);
}

export function elapsedMinutes(w: ActiveWorkout, now = Date.now()): number {
  return Math.max(1, Math.round(elapsedMs(w, now) / 60000));
}

/** Pause: the clock stops and any rest or hold timer is dropped. Sets stay as they are. */
export function pauseWorkout(w: ActiveWorkout, now = Date.now()): ActiveWorkout {
  if (w.pausedAt) return w;
  return { ...w, pausedAt: now, restEndsAt: null, restTotal: null, hold: null };
}

export function resumeWorkout(w: ActiveWorkout, now = Date.now()): ActiveWorkout {
  if (!w.pausedAt) return w;
  return { ...w, pausedAt: null, pausedMs: (w.pausedMs ?? 0) + (now - w.pausedAt) };
}
