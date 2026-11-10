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
  reps: string;
  done: boolean;
}

export interface ActiveExercise {
  id: string;
  name: string;
  /** What the plan asked for: "3 × 6-8 @ 185 lb". */
  target: string | null;
  note: string | null;
  cue: string | null;
  restSec: number;
  sets: ActiveSet[];
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

function fromPlanExercise(e: PlanExercise): ActiveExercise {
  const weight = firstNumber(e.target);
  const reps = firstNumber(e.reps);
  const count = Math.max(1, Math.min(10, Number(e.sets) || 3));
  return {
    id: uid(),
    name: e.name,
    target: `${e.sets} × ${e.reps}${e.target ? ` @ ${e.target}` : ""}`,
    note: e.note ?? null,
    cue: e.isNew ? e.cue : null,
    restSec: restFor(e.reps, e.name),
    sets: Array.from({ length: count }, () => ({ weight, reps, done: false })),
  };
}

export function workoutFromSession(session: PlanSession, date: string, liftTitle: string): ActiveWorkout {
  return {
    version: 1,
    date,
    title: liftTitle,
    startedAt: Date.now(),
    exercises: session.exercises.map(fromPlanExercise),
    restEndsAt: null,
    restTotal: null,
  };
}

export function emptyWorkout(date: string): ActiveWorkout {
  return { version: 1, date, title: "Workout", startedAt: Date.now(), exercises: [], restEndsAt: null, restTotal: null };
}

export function newExercise(name: string): ActiveExercise {
  return { id: uid(), name: name.trim(), target: null, note: null, cue: null, restSec: 90, sets: [{ weight: "", reps: "", done: false }] };
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

export function saveActiveWorkout(w: ActiveWorkout | null) {
  try {
    if (w) localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
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
export function completedExercises(w: ActiveWorkout): Exercise[] {
  return w.exercises
    .map((e) => ({
      name: e.name,
      sets: e.sets
        .filter((s) => s.done)
        .map((s) => {
          const weight = num(s.weight);
          return { reps: num(s.reps), weight: weight || null, weight_unit: weight ? "lb" : null };
        }),
    }))
    .filter((e) => e.name && e.sets.length > 0);
}

/** "Back Squat: 185x5, 185x5, 185x4" per line — what the parser and History show as the raw log. */
export function workoutText(w: ActiveWorkout, notes = ""): string {
  const lines = completedExercises(w).map((e) => {
    const sets = e.sets.map((s) => (s.weight ? `${s.weight}x${s.reps ?? "?"}` : `${s.reps ?? "?"} reps`)).join(", ");
    return `${e.name}: ${sets}`;
  });
  return [w.title, ...lines, notes.trim()].filter(Boolean).join("\n");
}

export function elapsedMinutes(w: ActiveWorkout, now = Date.now()): number {
  return Math.max(1, Math.round((now - w.startedAt) / 60000));
}
