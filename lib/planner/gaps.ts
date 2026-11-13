import { exerciseKey } from "@/lib/exerciseNames";
import type { MuscleRegion } from "@/lib/muscles";
import { patternOf, type Pattern } from "@/lib/planner/patterns";
import type { PlanExercise, PlanSession, StrengthDose } from "@/lib/planner/types";
import type { Exercise } from "@/lib/types";

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
export function floorsFor(mode: Mode, opts: { daysToRace: number | null; recoveryWeek: boolean; afterRace?: boolean }): Floor {
  // Just raced: the legs are repairing, so only mobility.
  if (opts.afterRace) return { squat: 0, hinge: 0, calf: 0, hip: 0, power: 0, strides: 0, mobility: 3 };
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
  ctx: { mode: Mode; daysToRace: number | null; recoveryWeek: boolean; afterRace?: boolean; alreadyThisWeek?: PlanSession[] }
): PlanSession[] {
  const sessions = input.map((s) => ({ ...s, exercises: [...s.exercises] }));
  const floor = floorsFor(ctx.mode, { daysToRace: ctx.daysToRace, recoveryWeek: ctx.recoveryWeek, afterRace: ctx.afterRace });
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

// ── What this week has actually done ─────────────────────────────────
//
// The floors and the core cap count what's behind us this week. The plan's
// kept sessions alone miss work done on a day the plan had moved elsewhere
// (Nov 13 2026: calf raises lifted Thursday didn't count, so the replan put
// calves on Friday too). A day with a logged workout counts what was logged;
// a kept day with nothing logged counts what it asked for.

export interface LoggedDay {
  date: string;
  exercises: Exercise[];
}

function loggedExercise(e: Exercise): PlanExercise {
  const sets = e.sets ?? [];
  const reps = Math.max(0, ...sets.map((x) => x.reps ?? 0));
  const secs = Math.max(0, ...sets.map((x) => x.seconds ?? 0));
  return { name: e.name, sets: sets.length || 1, reps: reps ? String(reps) : secs ? `${secs}s` : "", target: null, cue: null, isNew: false, regions: [] };
}

export function doneThisWeek(kept: PlanSession[], keptOn: Record<string, string>, logged: LoggedDay[]): PlanSession[] {
  const byDate = new Map<string, PlanExercise[]>();
  for (const l of logged) byDate.set(l.date, [...(byDate.get(l.date) ?? []), ...l.exercises.map(loggedExercise)]);
  const out: PlanSession[] = [];
  const keptDates = new Set<string>();
  for (const s of kept) {
    const date = keptOn[s.id];
    if (date) keptDates.add(date);
    const did = date ? byDate.get(date) : undefined;
    out.push(did ? { ...s, exercises: did } : s);
  }
  for (const [date, exercises] of byDate) {
    if (keptDates.has(date)) continue;
    out.push({ id: `logged-${date}`, kind: "lift", title: "Logged", rationale: "", regions: [], exercises, priority: 99, preferredDow: null, taxesLegs: false, miles: null });
  }
  return out;
}

// ── Core variety ─────────────────────────────────────────────────────
//
// Tom, Nov 2026: Pallof presses and dead bugs were in nearly every session.
// A core movement appears at most twice a week (counting what's done); a
// third goes to the first of these the week hasn't used. Copenhagen planks
// are the hip floor, so they're left alone.

export const MAX_CORE_REPEATS = 2;

const CORE_ROTATION: Omit<PlanExercise, "sets">[] = [
  { name: "Cable Woodchop", reps: "10 per side", target: null, cue: "Rotate through the hips and trunk together, arms long; control it back.", isNew: false, regions: ["obliques", "abs"] },
  { name: "Hanging Knee Raise", reps: "10-12", target: null, cue: "No swing: curl the pelvis up, lower for two seconds.", isNew: false, regions: ["abs"] },
  { name: "Suitcase Carry", reps: "40 m per side", target: null, cue: "Heavy dumbbell in one hand, stand tall, don't lean toward it.", isNew: false, regions: ["obliques", "abs", "forearms"] },
  { name: "Ab Wheel Rollout", reps: "8-10", target: null, cue: "From the knees, ribs down; roll only as far as the low back stays flat.", isNew: false, regions: ["abs"] },
  { name: "Bird Dog", reps: "8 per side", target: null, cue: "Reach long, hips square; pause two seconds at full reach.", isNew: false, regions: ["abs", "lower_back", "glutes"] },
  { name: "Hollow Hold", reps: "20-30s", target: null, cue: "Low back pressed into the floor; raise arms and legs only as far as it stays there.", isNew: false, regions: ["abs"] },
];

export function varyCore(input: PlanSession[], already: PlanSession[] = []): PlanSession[] {
  const sessions = input.map((s) => ({ ...s, exercises: [...s.exercises] }));
  const count = new Map<string, number>();
  const bump = (name: string) => count.set(exerciseKey(name), (count.get(exerciseKey(name)) ?? 0) + 1);
  for (const s of already) for (const e of s.exercises) if (patternOf(e.name) === "core") bump(e.name);
  const order = [...sessions].sort((a, b) => (a.preferredDow ?? 9) - (b.preferredDow ?? 9));
  for (const s of order) {
    s.exercises = s.exercises.map((e) => {
      if (patternOf(e.name) !== "core" || isHip(e.name)) return e;
      if ((count.get(exerciseKey(e.name)) ?? 0) < MAX_CORE_REPEATS) {
        bump(e.name);
        return e;
      }
      const inSession = new Set(s.exercises.map((x) => exerciseKey(x.name)));
      const alt = CORE_ROTATION.find((a) => !count.has(exerciseKey(a.name)) && !inSession.has(exerciseKey(a.name)))
        ?? CORE_ROTATION.find((a) => (count.get(exerciseKey(a.name)) ?? 0) < MAX_CORE_REPEATS && !inSession.has(exerciseKey(a.name)));
      if (!alt) return e;
      bump(alt.name);
      for (const r of alt.regions) if (!s.regions.includes(r)) s.regions = [...s.regions, r];
      return { ...alt, sets: e.sets, note: `core variety — ${e.name} already twice this week` };
    });
  }
  return sessions;
}
