import { exerciseKey } from "@/lib/exerciseNames";
import { firstNumber, holdSeconds, isTimed } from "@/lib/workoutSession";

// ── Quick-start templates for the Log page ────────────────────────────
//
// Tom, Nov 2026: "If I click chest day it populates a standard chest
// workout. Not a week-specific one necessarily but at least something to
// work with." Each template is a few slots; each slot lists movements that
// do the same job, and the one he has logged most recently wins (else the
// first), with its sets prefilled from his last top set. Everything stays
// editable — it's a starting point, not a prescription.

export interface TemplateSlot {
  /** Movements that fill this slot, in order of preference when none has history. */
  names: string[];
  sets: number;
  reps: string;
}

export interface Template {
  label: string;
  title: string;
  slots: TemplateSlot[];
}

export const TEMPLATES: Template[] = [
  {
    label: "Chest Day",
    title: "Chest & triceps",
    slots: [
      { names: ["Incline Barbell Bench Press", "Barbell Bench Press"], sets: 4, reps: "6" },
      { names: ["Dumbbell Incline Press", "Machine Incline Press", "Close-Grip Bench Press"], sets: 3, reps: "10" },
      { names: ["Pec Dec Fly", "Cable Fly"], sets: 3, reps: "12" },
      { names: ["Tricep Pushdown", "Overhead Cable Triceps Extension", "EZ-Bar Skull Crusher"], sets: 3, reps: "12" },
    ],
  },
  {
    label: "Back Day",
    title: "Back & biceps",
    slots: [
      { names: ["Bent Over Barbell Row", "Chest-Supported Row"], sets: 4, reps: "6" },
      { names: ["Lat Pulldown", "Pull-Up", "Single Arm Lat Pulldown"], sets: 3, reps: "10" },
      { names: ["Narrow Grip Horizontal Cable Pull", "Single Arm Dumbbell Row"], sets: 3, reps: "10" },
      { names: ["Single Arm Rear Delt Cable Fly", "Rear Delt Fly"], sets: 3, reps: "12" },
      { names: ["Barbell Curl", "EZ-Bar Curl", "Bayesian Curl", "Hammer Curl"], sets: 3, reps: "10" },
    ],
  },
  {
    label: "Leg Day",
    title: "Legs",
    slots: [
      { names: ["Back Squat", "Goblet Squat"], sets: 4, reps: "6" },
      { names: ["Romanian Deadlift"], sets: 3, reps: "8" },
      { names: ["Bulgarian Split Squat", "Single-Leg Step-Up"], sets: 3, reps: "8" },
      { names: ["Leg Curl", "Hip Thrust"], sets: 3, reps: "12" },
      { names: ["Standing Calf Raise", "Seated Calf Raise"], sets: 3, reps: "12" },
    ],
  },
  {
    label: "Shoulders",
    title: "Shoulders",
    slots: [
      { names: ["Barbell Shoulder Press", "Seated Dumbbell Shoulder Press"], sets: 4, reps: "6" },
      { names: ["Cable Lateral Raise", "Dumbbell Lateral Raise"], sets: 3, reps: "12" },
      { names: ["Rear Delt Fly", "Single Arm Rear Delt Cable Fly"], sets: 3, reps: "12" },
      { names: ["Barbell Shrug"], sets: 3, reps: "10" },
    ],
  },
  {
    label: "Arms",
    title: "Arms",
    slots: [
      { names: ["Barbell Curl", "EZ-Bar Curl"], sets: 3, reps: "10" },
      { names: ["Tricep Pushdown", "EZ-Bar Skull Crusher"], sets: 3, reps: "12" },
      { names: ["Hammer Curl", "Bayesian Curl", "Incline Dumbbell Curl"], sets: 3, reps: "10" },
      { names: ["Overhead Cable Triceps Extension", "Close-Grip Bench Press"], sets: 3, reps: "12" },
    ],
  },
  {
    label: "Core",
    title: "Core",
    slots: [
      { names: ["Pallof Press"], sets: 3, reps: "10" },
      { names: ["Dead Bug", "Bird Dog"], sets: 3, reps: "8" },
      { names: ["Side Plank"], sets: 3, reps: "30s" },
      { names: ["Hanging Knee Raise", "Ab Wheel Rollout", "Cable Woodchop"], sets: 3, reps: "10" },
    ],
  },
  {
    label: "Mobility",
    title: "Mobility & stretch",
    slots: [
      { names: ["World's Greatest Stretch"], sets: 1, reps: "5" },
      { names: ["90/90 Hip Stretch"], sets: 1, reps: "60s" },
      { names: ["Couch Stretch"], sets: 1, reps: "45s" },
      { names: ["Leg Swing"], sets: 1, reps: "15" },
    ],
  },
];

/** The last top set of every lift with history, by exercise key (from /api/lifts). */
export type RecentSets = Record<string, { name: string; date: string; weight: number; reps: number }>;

export interface DraftSet {
  weight: string;
  /** Reps — or seconds for a timed hold. */
  reps: string;
}

export interface DraftExercise {
  id: string;
  name: string;
  timed: boolean;
  sets: DraftSet[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** One exercise ready to fill in, its load and reps from the last time it was logged. */
export function draftExercise(name: string, sets = 3, reps = "", recent: RecentSets = {}): DraftExercise {
  const timed = isTimed(reps, name);
  const last = recent[exerciseKey(name)];
  const weight = last && !timed ? String(last.weight) : "";
  const r = timed ? holdSeconds(reps) || "30" : (last ? String(last.reps) : "") || firstNumber(reps);
  return { id: uid(), name, timed, sets: Array.from({ length: Math.max(1, sets) }, () => ({ weight, reps: r })) };
}

/** A template's exercises: in each slot, the movement logged most recently (else the first). */
export function buildTemplate(t: Template, recent: RecentSets = {}): DraftExercise[] {
  return t.slots.map((slot) => {
    const logged = slot.names
      .map((n) => ({ n, last: recent[exerciseKey(n)] }))
      .filter((x) => x.last)
      .sort((a, b) => b.last!.date.localeCompare(a.last!.date))[0];
    return draftExercise(logged?.n ?? slot.names[0], slot.sets, slot.reps, recent);
  });
}

const num = (s: string) => {
  const n = Number(s);
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

/** The filled-in sets, as the workout log stores them. A set without reps (or seconds) is left out. */
export function draftToExercises(draft: DraftExercise[]) {
  return draft
    .map((e) => ({
      name: e.name.trim(),
      timed: e.timed,
      sets: e.sets
        .filter((s) => num(s.reps))
        .map((s) => {
          const weight = num(s.weight);
          return e.timed ? { reps: null, weight: weight || null, seconds: num(s.reps) } : { reps: num(s.reps), weight: weight || null };
        }),
    }))
    .filter((e) => e.name && e.sets.length > 0);
}

/** "Incline Barbell Bench Press: 140x6, 140x6" per line — the raw text the parser and History see. */
export function draftText(title: string, draft: DraftExercise[], notes = ""): string {
  const lines = draftToExercises(draft).map(
    (e) =>
      `${e.name}: ${e.sets
        .map((s) => ("seconds" in s ? `${s.weight ? `${s.weight} lb ` : ""}${s.seconds}s` : s.weight ? `${s.weight}x${s.reps}` : `${s.reps} reps`))
        .join(", ")}`
  );
  return [title, ...lines, notes.trim()].filter(Boolean).join("\n");
}
