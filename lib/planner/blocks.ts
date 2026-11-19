import type { PlanExercise, PlanSession } from "@/lib/planner/types";

// ── Warm-up, workout, stretch ─────────────────────────────────────────
//
// Tom, Nov 2026: "the pre and post run stretches need to be separated from
// the actual workout and labeled as such." Which part of a session an
// exercise belongs to is decided here, in code, from its name — so it holds
// for plans already stored and the model can't put a stretch between lifts.

export type Block = "warmup" | "main" | "after";

const DYNAMIC = /leg swing|\b[ab].?skip|high knees?|butt kick|carioca|hip circle|arm circle|world.?s greatest|inchworm|\bdynamic\b|frankenstein|walking knee hug/i;
const STATIC = /stretch|90\/90|pigeon|couch|foam|\byoga\b|child.?s pose|cat.?cow|\bmobility\b|calf drop/i;
const STRIDES = /strides?\b/i;

export const hasRun = (s: Pick<PlanSession, "kind">) => s.kind === "run" || s.kind === "lift_and_run";

export function blockOf(ex: Pick<PlanExercise, "name" | "target">, sessionHasRun: boolean): Block {
  const n = ex.name;
  if (DYNAMIC.test(n)) return "warmup";
  // Walking lunges with no load on a run day are the warm-up drill, not leg work.
  if (sessionHasRun && /walking lunge/i.test(n) && !ex.target) return "warmup";
  if (STRIDES.test(n)) return sessionHasRun ? "after" : "main";
  if (STATIC.test(n)) return "after";
  return "main";
}

export function blockLabel(block: Block, sessionHasRun: boolean, withStrides = false): string {
  if (block === "warmup") return sessionHasRun ? "Before you run · warm-up" : "Warm-up";
  if (block === "after") return sessionHasRun ? `After you run · ${withStrides ? "strides & stretch" : "stretch"}` : "Cool-down · stretch";
  return "Workout";
}

const ORDER: Block[] = ["warmup", "main", "after"];

/** The session's exercises in their three parts, in order, each with its index in the original list. */
export function groupExercises<T extends Pick<PlanExercise, "name" | "target">>(exercises: T[], sessionHasRun: boolean) {
  const groups = ORDER.map((block) => ({
    block,
    items: exercises.map((ex, index) => ({ ex, index })).filter(({ ex }) => blockOf(ex, sessionHasRun) === block),
  })).filter((g) => g.items.length > 0);
  return groups.map((g) => ({
    ...g,
    label: blockLabel(g.block, sessionHasRun, g.items.some(({ ex }) => STRIDES.test(ex.name))),
  }));
}
