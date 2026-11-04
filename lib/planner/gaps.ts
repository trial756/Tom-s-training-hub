import type { MuscleRegion } from "@/lib/muscles";
import { patternOf, type Pattern } from "@/lib/planner/patterns";
import type { PlanExercise, PlanSession, StrengthDose } from "@/lib/planner/types";

// ── Weekly floors for the whole athlete ──────────────────────────────
//
// The Nov 2026 whole-body analysis found four gaps the model kept leaving
// out: leg strength (about a tenth of all lifting sets), power and speed
// (nothing logged), mobility (two sessions in eight weeks) and hip/calf
// durability. Each week now carries a floor of each, scaled to the block.
// The model still plans the week; this only adds what's missing, never
// removes anything, and adds it where it does the least harm:
//   • legs and power go on the lower / quality-run day, where hard is meant
//     to stack, never onto an easy-run day
//   • strides ride on easy runs; mobility goes after easy runs
//   • calves and hips go anywhere — they don't tax the next day

type Mode = StrengthDose["mode"];

interface Floor {
  /** Sets of squat-pattern work (two legs or one). */
  squat: number;
  hinge: number;
  calf: number;
  /** Hip stability: glute med, adductors. */
  hip: number;
  /** Plyometric / sprint exercises (count of exercises). */
  power: number;
  /** Easy runs that carry strides. */
  strides: number;
  /** Sessions with a mobility block. */
  mobility: number;
}

/** What each part of the block can absorb. */
export function floorsFor(mode: Mode, opts: { daysToRace: number | null; recoveryWeek: boolean }): Floor {
  if (opts.daysToRace != null && opts.daysToRace <= 10) {
    return { squat: 0, hinge: 0, calf: 0, hip: 0, power: 0, strides: 2, mobility: 3 };
  }
  switch (mode) {
    case "build": // post-race: muscle and athleticism lead
      return { squat: 8, hinge: 6, calf: 6, hip: 3, power: 2, strides: 1, mobility: 3 };
    case "taper":
      return { squat: 2, hinge: 2, calf: 3, hip: 2, power: 0, strides: 2, mobility: 3 };
    case "maintain":
      return opts.recoveryWeek
        ? { squat: 3, hinge: 3, calf: 6, hip: 3, power: 1, strides: 2, mobility: 3 }
        : { squat: 4, hinge: 3, calf: 6, hip: 3, power: 1, strides: 2, mobility: 3 };
    default:
      return { squat: 6, hinge: 4, calf: 6, hip: 3, power: 2, strides: 2, mobility: 3 };
  }
}

const ex = (name: string, sets: number, reps: string, regions: MuscleRegion[], cue: string, note: string): PlanExercise => ({
  name, sets, reps, target: null, cue, isNew: false, regions, note,
});

const isHip = (name: string) => /clamshell|monster walk|lateral band|band walk|copenhagen|adductor|hip abduct|side.?lying|glute med|banded/i.test(name);
const isStrides = (name: string) => /strides?\b/i.test(name);
const hasRunPart = (s: PlanSession) => s.kind === "run" || s.kind === "lift_and_run";
const isEasyRun = (s: PlanSession) => s.kind === "run" && (s.run?.type == null || s.run.type === "Easy");
const isLift = (s: PlanSession) => s.kind === "lift" || s.kind === "lift_and_run";

function tally(sessions: PlanSession[]) {
  const t = { squat: 0, hinge: 0, calf: 0, hip: 0, power: 0, strides: 0, mobility: 0 };
  for (const s of sessions) {
    let mob = false;
    let str = false;
    for (const e of s.exercises) {
      const p: Pattern = patternOf(e.name);
      const sets = Number(e.sets) || 0;
      if (isStrides(e.name)) str = true;
      else if (p === "power") t.power += 1;
      if (p === "squat") t.squat += sets;
      if (p === "hinge") t.hinge += sets;
      if (p === "calf") t.calf += sets;
      if (isHip(e.name)) t.hip += sets;
      if (p === "mobility") mob = true;
    }
    if (str) t.strides += 1;
    if (mob) t.mobility += 1;
  }
  return t;
}

/**
 * Adds what the week is missing against its floors. `alreadyThisWeek` (days
 * kept through a replan) count toward the floors but are never changed.
 */
export function fillGaps(
  input: PlanSession[],
  ctx: { mode: Mode; daysToRace: number | null; recoveryWeek: boolean; alreadyThisWeek?: PlanSession[] }
): PlanSession[] {
  const sessions = input.map((s) => ({ ...s, exercises: [...s.exercises] }));
  const floor = floorsFor(ctx.mode, { daysToRace: ctx.daysToRace, recoveryWeek: ctx.recoveryWeek });
  const have = tally([...(ctx.alreadyThisWeek ?? []), ...sessions]);
  const build = ctx.mode === "build";

  const add = (s: PlanSession, e: PlanExercise) => {
    s.exercises.push(e);
    for (const r of e.regions) if (!s.regions.includes(r)) s.regions = [...s.regions, r];
  };

  // Where hard leg work belongs: the lower day (taxesLegs), else the quality
  // run + lift day. Never an easy-run day.
  const legDay = sessions.find((s) => isLift(s) && s.taxesLegs) ?? sessions.find((s) => s.kind === "lift_and_run");
  // Light work can go on any gym day; spread it across them.
  const liftDays = sessions.filter(isLift);
  let rot = 0;
  const nextLiftDay = () => (liftDays.length ? liftDays[rot++ % liftDays.length] : undefined);

  // ── Legs ──
  if (have.squat < floor.squat) {
    const target = legDay ?? (build ? nextLiftDay() : undefined);
    const sets = Math.min(4, floor.squat - have.squat);
    if (target && sets > 0) {
      add(target, build
        ? ex("Bulgarian Split Squat", sets, "6-8 per leg", ["quads", "glutes"], "Rear foot on a bench, front shin vertical; drive through the whole front foot.", "leg-strength floor — legs were about a tenth of your lifting")
        : ex("Bulgarian Split Squat", sets, "6-8 per leg", ["quads", "glutes"], "Rear foot on a bench, front shin vertical; stop two reps short of failure.", "leg-strength floor — single-leg, heavy, low reps"));
      have.squat += sets;
    }
  }
  if (have.hinge < floor.hinge) {
    const target = legDay ?? (build ? nextLiftDay() : undefined);
    const sets = Math.min(4, floor.hinge - have.hinge);
    if (target && sets > 0) {
      add(target, ex("Romanian Deadlift", sets, "6-8", ["hamstrings", "glutes"], "Soft knees, push the hips back until the hamstrings stop you; flat back.", "hinge floor — posterior chain for late-race form"));
      have.hinge += sets;
    }
  }
  // Calves and hips don't wreck tomorrow: any gym day.
  while (have.calf < floor.calf && liftDays.length) {
    const target = nextLiftDay()!;
    add(target, ex(have.calf === 0 ? "Standing Calf Raise" : "Seated Calf Raise", 3, "10-12", ["calves"], "Full stretch at the bottom, two-second pause at the top, slow down.", "calf floor — straight- and bent-knee, every week"));
    have.calf += 3;
  }
  if (have.hip < floor.hip) {
    const target = nextLiftDay() ?? sessions.find(isEasyRun);
    if (target) {
      add(target, ex("Copenhagen Plank", 3, "20-30 s per side", ["obliques", "glutes"], "Top leg on a bench, hips up in a straight line; short lever (knee) to start.", "hip-stability floor — adductors and glute med"));
      have.hip += 3;
    }
  }

  // ── Power and speed ──
  if (have.power < floor.power) {
    const target = legDay ?? (build ? nextLiftDay() : undefined);
    if (target) {
      add(target, ex("Pogo Hops", 3, "15", ["calves"], "Stiff ankles, quick ground contacts, barely bend the knees.", "power floor — elastic stiffness for running economy; done first, fresh"));
      have.power += 1;
      if (have.power < floor.power) {
        add(target, ex(build ? "Broad Jump" : "Box Jump", 3, "3", ["quads", "glutes"], build ? "Swing the arms, jump out not up, stick the landing." : "Jump up, step down; stop each set while every rep is crisp.", "power floor — max-intent jumps, full rest between sets"));
        have.power += 1;
      }
    }
  }
  if (have.strides < floor.strides) {
    for (const s of sessions.filter(isEasyRun)) {
      if (have.strides >= floor.strides) break;
      if (s.exercises.some((e) => isStrides(e.name))) continue;
      // Straight after the run, before any core or mobility block.
      s.exercises.unshift(ex("Strides", 1, "6 × 20 s", ["calves", "quads"], "After the run: build to fast-but-relaxed over 20 s, walk back, repeat.", "speed floor — keeps leg speed while easy runs stay easy"));
      for (const r of ["calves", "quads"] as MuscleRegion[]) if (!s.regions.includes(r)) s.regions = [...s.regions, r];
      have.strides += 1;
    }
  }

  // ── Mobility ──
  if (have.mobility < floor.mobility) {
    const carriers = [
      ...sessions.filter((s) => s.kind === "run" && !s.exercises.some((e) => patternOf(e.name) === "mobility")),
      ...sessions.filter((s) => s.kind === "active_recovery" && !s.exercises.some((e) => patternOf(e.name) === "mobility")),
      ...sessions.filter((s) => hasRunPart(s) && s.kind !== "run" && !s.exercises.some((e) => patternOf(e.name) === "mobility")),
    ];
    for (const s of carriers) {
      if (have.mobility >= floor.mobility) break;
      add(s, ex("90/90 Hip Stretch", 2, "60 s per side", ["glutes"], "Sit tall, both knees at 90°; lean over the front shin.", "mobility floor — after the run, three times a week"));
      add(s, ex("Couch Stretch", 2, "45 s per side", ["quads"], "Back knee against the wall, squeeze the glute, stay tall.", "mobility floor — hip flexors and quads"));
      have.mobility += 1;
    }
  }
  return sessions;
}
