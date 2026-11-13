import { daysBetweenKeys, localDateKey, shiftDays } from "@/lib/format";
import { blockForWeek, type FocusType, type Goal } from "@/lib/goals";
import { patternOf, type Pattern } from "@/lib/planner/patterns";
import type { PlanExercise, PlanSession } from "@/lib/planner/types";

// ── The muscle & athleticism programme ───────────────────────────────
//
// Nov 2026 review: outside a race block the planner had one paragraph of
// guidance and the marathon-era rules. This is the standing programme — what
// the app prescribes for a focus goal, and when no goal is set at all. It
// never ends: it cycles.
//
//   week 0          ramp-in — the first week after a race block or recovery:
//                   about 60% of the volume, legs at 85% load, no load jumps
//   then, repeating four-week cycles:
//     build 1/2/3   weekly hard sets per muscle climb (×1.0, ×1.2, ×1.4);
//                   jumps and sprints progress with them
//     deload        about half the sets at the same loads, no load jumps
//
// The structure is code; the exercises inside it are the model's to choose.
// Running is conditioning with set amounts: two easy runs, one interval
// session and a long run — which builds toward any race on the calendar
// (the Feb 28 half), so a for-fun race is never run off no long runs.

export type ProgramPhase = "ramp" | "build" | "deload";
export type MuscleGroup = "chest" | "back" | "shoulders" | "quads" | "hamstrings" | "biceps" | "triceps" | "calves";

export interface Program {
  /** Weeks into the focus block; 0 is its first week. */
  week: number;
  phase: ProgramPhase;
  /** 1–3 in build weeks. */
  wave: number | null;
  label: string;
  liftSessions: number;
  heavyLower: number;
  /** Hard sets per muscle group this week. */
  sets: Record<MuscleGroup, number>;
  run: { weeklyMiles: number; longRunMiles: number | null; intervals: string | null };
  /** Opens the squat-led lower day. */
  jumps: PlanExercise[];
  /** Opens the hinge-led lower day. */
  speed: PlanExercise[];
  /** Leg loads this week as a share of the last load (ramp-in only). */
  legLoadFactor: number;
  /** No load increases this week (ramp-in and deload). */
  hold: boolean;
  guidance: string;
}

const BASE_SETS: Record<FocusType, Record<MuscleGroup, number>> = {
  athleticism: { chest: 10, back: 12, shoulders: 8, quads: 8, hamstrings: 6, biceps: 8, triceps: 8, calves: 6 },
  hypertrophy: { chest: 12, back: 14, shoulders: 10, quads: 10, hamstrings: 8, biceps: 10, triceps: 10, calves: 6 },
  strength: { chest: 8, back: 10, shoulders: 6, quads: 8, hamstrings: 6, biceps: 6, triceps: 6, calves: 4 },
  general: { chest: 8, back: 10, shoulders: 6, quads: 8, hamstrings: 6, biceps: 6, triceps: 6, calves: 6 },
  endurance: { chest: 6, back: 8, shoulders: 6, quads: 6, hamstrings: 4, biceps: 4, triceps: 4, calves: 6 },
};
const FACTOR: Record<string, number> = { ramp: 0.6, "build-1": 1, "build-2": 1.2, "build-3": 1.4, deload: 0.55 };

const move = (name: string, sets: number, reps: string, regions: PlanExercise["regions"], cue: string, note: string): PlanExercise => ({
  name, sets, reps, target: null, cue, isNew: false, regions, note,
});

const JUMPS: Record<string, PlanExercise[]> = {
  ramp: [move("Pogo Hops", 2, "15", ["calves"], "Stiff ankles, quick ground contacts, barely bend the knees.", "power — easing back in, low dose")],
  "build-1": [
    move("Pogo Hops", 3, "15", ["calves"], "Stiff ankles, quick ground contacts, barely bend the knees.", "power — done first, fresh"),
    move("Box Jump", 3, "3", ["quads", "glutes"], "Jump up, step down; every rep crisp, full rest between sets.", "power — max intent, never to fatigue"),
  ],
  "build-2": [
    move("Box Jump", 4, "3", ["quads", "glutes"], "Jump up, step down; every rep crisp, full rest between sets.", "power — one more set than last week"),
    move("Broad Jump", 3, "3", ["quads", "glutes"], "Swing the arms, jump out not up, stick the landing.", "power — horizontal, max intent"),
  ],
  "build-3": [
    move("Broad Jump", 4, "3", ["quads", "glutes"], "Swing the arms, jump out not up, stick the landing.", "power — peak week"),
    move("Single-Leg Bound", 3, "5 per side", ["glutes", "calves"], "Bound for distance off one leg, land soft on the other; stop when the snap goes.", "power — single-leg, the last step up"),
  ],
  deload: [move("Pogo Hops", 2, "15", ["calves"], "Stiff ankles, quick ground contacts, barely bend the knees.", "power — deload, just keeping the spring")],
};
const SPEED: Record<string, PlanExercise[]> = {
  ramp: [move("Build-Up Sprint", 4, "20 m", ["hamstrings", "glutes"], "Smooth acceleration to about 80%; walk back.", "speed — easing back in, never all-out this week")],
  "build-1": [
    move("Sprint", 5, "20 m", ["hamstrings", "glutes"], "From a standing start, drive hard for 20 m; walk back and rest a full minute.", "speed — short accelerations, full rest"),
    move("Lateral Shuffle", 3, "10 m each way", ["glutes", "quads"], "Stay low, push off the trailing leg, don't cross the feet.", "agility — side to side"),
  ],
  "build-2": [
    move("Sprint", 5, "30 m", ["hamstrings", "glutes"], "Drive hard for 30 m; walk back and rest 90 seconds.", "speed — ten metres longer than last week"),
    move("5-10-5 Shuttle", 4, "1", ["glutes", "quads"], "Five yards, touch; ten back, touch; five through. Plant on the outside foot.", "agility — change of direction, full rest"),
  ],
  "build-3": [
    move("Sprint", 6, "30 m", ["hamstrings", "glutes"], "Drive hard for 30 m; walk back and rest 90 seconds.", "speed — peak week"),
    move("5-10-5 Shuttle", 5, "1", ["glutes", "quads"], "Five yards, touch; ten back, touch; five through. Plant on the outside foot.", "agility — one more rep than last week"),
  ],
  deload: [move("Build-Up Sprint", 4, "20 m", ["hamstrings", "glutes"], "Smooth acceleration to about 80%; walk back.", "speed — deload")],
};
const INTERVALS: Record<string, string | null> = {
  ramp: null,
  "build-1": "1 mi easy · 6 × 1 min hard / 2 min jog · 1 mi easy",
  "build-2": "1 mi easy · 8 × 1 min hard / 90 s jog · 1 mi easy",
  "build-3": "1 mi easy · 5 × 2 min hard / 2 min jog · 1 mi easy",
  deload: null,
};

const weekKey = (d: string, weeks: number) => localDateKey(shiftDays(new Date(`${d}T12:00:00`), weeks * 7));

/** How many weeks the focus block has already run before `weekStart`, and whether a race or recovery came right before it. */
function focusPosition(goals: Goal[], weekStart: string, todayKey: string): { week: number; afterRace: boolean } {
  const here = blockForWeek(goals, weekStart, todayKey);
  let week = 0;
  for (; week < 104; week++) {
    const prior = blockForWeek(goals, weekKey(weekStart, -(week + 1)), todayKey);
    if (prior.kind !== "focus" || prior.goal?.id !== here.goal?.id) {
      return { week, afterRace: prior.kind === "race" || prior.kind === "recovery" };
    }
  }
  // An open-ended default focus: count from a fixed Sunday so the cycle is stable.
  return { week: ((Math.floor(daysBetweenKeys("2026-01-04", weekStart) / 7) % 4) + 4) % 4, afterRace: false };
}

/** The long run for a focus week: 5 miles by default, building to ~80% of the next race two weeks out. */
function longRunFor(goals: Goal[], weekStart: string, deload: boolean, ramp: boolean): number | null {
  const weekEnd = weekKey(weekStart, 1);
  const next = goals
    .filter((g) => g.kind === "race" && (g.status ?? "active") === "active" && g.date >= weekStart && (g.distance_mi ?? 0) >= 6)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const base = ramp ? 4 : deload ? 4 : 5;
  if (!next) return base;
  // The race falls in this week, or opens the next: it stands in for the long run.
  if (next.date <= weekEnd) return null;
  const weeksOut = Math.floor(daysBetweenKeys(weekStart, next.date) / 7);
  if (weeksOut > 10) return base;
  const peak = Math.round(Math.min(next.distance_mi! * 0.8, 16));
  if (weeksOut === 1) return Math.round(peak * 0.6);
  // Peak two weeks out, a mile less each week before that, never below the base.
  const target = Math.max(base, peak - (weeksOut - 2));
  return deload ? Math.max(base, target - 2) : target;
}

/** The programme for a focus week, or null when the week isn't a focus week. */
export function programFor(goals: Goal[], weekStart: string, todayKey: string): Program | null {
  const block = blockForWeek(goals, weekStart, todayKey);
  if (block.kind !== "focus" || !block.goal) return null;
  const focus = (block.goal.focus ?? "athleticism") as FocusType;
  if (focus === "endurance") return null;
  const { week, afterRace } = focusPosition(goals, weekStart, todayKey);

  const ramp = week === 0 && afterRace;
  // After a ramp-in the four-week cycle starts at week 1; with no ramp-in, at week 0.
  const cycle = (((week - (afterRace ? 1 : 0)) % 4) + 4) % 4; // 0,1,2 build · 3 deload
  const phase: ProgramPhase = ramp ? "ramp" : cycle === 3 ? "deload" : "build";
  const wave = phase === "build" ? cycle + 1 : null;
  const key = phase === "build" ? `build-${wave}` : phase;

  const sets = Object.fromEntries(
    Object.entries(BASE_SETS[focus]).map(([g, n]) => [g, Math.max(3, Math.round(n * FACTOR[key]))])
  ) as Record<MuscleGroup, number>;
  const longRunMiles = longRunFor(goals, weekStart, phase === "deload", ramp);
  const intervals = INTERVALS[key];
  const easy = phase === "build" ? 7 : 6; // two easy runs
  const weeklyMiles = easy + (intervals ? 4 : 0) + (longRunMiles ?? 0);
  const light = phase !== "build";
  const label = ramp ? "Ramp-in week" : phase === "deload" ? "Deload week" : `Build week ${wave} of 3`;

  return {
    week,
    phase,
    wave,
    label,
    liftSessions: light ? 4 : 5,
    heavyLower: ramp ? 1 : phase === "deload" ? 1 : 2,
    sets,
    run: { weeklyMiles, longRunMiles, intervals },
    jumps: JUMPS[key],
    speed: SPEED[key],
    legLoadFactor: ramp ? 0.85 : 1,
    hold: light,
    guidance:
      `${block.goal.title} — ${label.toLowerCase()}. Lifting leads. Sessions: Upper A (press-led), Lower A (squat-led; ` +
      "it opens with the week's jumps), Upper B (pull-led), Lower B (hinge-led; it opens with the week's sprints and " +
      `agility)${light ? "" : ", and a fifth session for shoulders, arms and whatever the week is short on"}. Every muscle ` +
      "group is trained on at least two days. Each session: one heavy compound (4-6 reps), then compounds at 8-10 and " +
      "isolation at 10-15, two or three reps short of failure. `program.sets` is the week's hard-set target per " +
      "muscle group — code tops up or trims to it, so spread the work sensibly rather than counting. " +
      (ramp
        ? "This is the first week back after the race: everything is submaximal, legs at about 85% of the last loads, no load increases. "
        : phase === "deload"
        ? "Deload: about half the usual sets at the same loads, stopping well short of failure. No load increases, nothing new. "
        : "") +
      `Running is conditioning: two easy runs${intervals ? `, one interval session (${intervals}) stacked on the Lower A day, run first` : ""}` +
      `${longRunMiles ? `, and a ${longRunMiles}-mile long run` : ""}. Pair easy runs with upper days as one 'lift_and_run'. ` +
      "Jumps, sprints and agility are added in code — don't plan your own.",
  };
}

// ── Volume: hard sets per muscle group ───────────────────────────────

const CREDIT: Partial<Record<Pattern, Partial<Record<MuscleGroup, number>>>> = {
  horizontal_press: { chest: 1, triceps: 0.5 },
  vertical_press: { shoulders: 1, triceps: 0.5 },
  horizontal_pull: { back: 1, biceps: 0.5 },
  vertical_pull: { back: 1, biceps: 0.5 },
  squat: { quads: 1 },
  hinge: { hamstrings: 1 },
  fly: { chest: 1 },
  lateral_raise: { shoulders: 1 },
  rear_delt: { shoulders: 1 },
  elbow_flexion: { biceps: 1 },
  elbow_extension: { triceps: 1 },
  calf: { calves: 1 },
};
const primaryGroup = (name: string): MuscleGroup | null => {
  const c = CREDIT[patternOf(name)];
  return c ? ((Object.entries(c).find(([, v]) => v === 1)?.[0] as MuscleGroup) ?? null) : null;
};
const LEG_GROUPS = new Set<MuscleGroup>(["quads", "hamstrings"]);
const TOP_UP: Record<MuscleGroup, { name: string; reps: string; regions: PlanExercise["regions"] }> = {
  chest: { name: "Cable Fly", reps: "10-15", regions: ["chest"] },
  back: { name: "Lat Pulldown", reps: "8-10", regions: ["lats", "biceps"] },
  shoulders: { name: "Cable Lateral Raise", reps: "10-15", regions: ["side_delts"] },
  quads: { name: "Leg Extension", reps: "10-15", regions: ["quads"] },
  hamstrings: { name: "Leg Curl", reps: "10-15", regions: ["hamstrings"] },
  biceps: { name: "EZ-Bar Curl", reps: "10-12", regions: ["biceps"] },
  triceps: { name: "Tricep Pushdown", reps: "10-12", regions: ["triceps"] },
  calves: { name: "Seated Calf Raise", reps: "10-12", regions: ["calves"] },
};

/** Hard sets per muscle group across the sessions (compounds give half credit to the arms). */
export function weeklySets(sessions: PlanSession[]): Record<MuscleGroup, number> {
  const t: Record<MuscleGroup, number> = { chest: 0, back: 0, shoulders: 0, quads: 0, hamstrings: 0, biceps: 0, triceps: 0, calves: 0 };
  for (const s of sessions) {
    for (const e of s.exercises) {
      const c = CREDIT[patternOf(e.name)];
      if (!c) continue;
      for (const [g, v] of Object.entries(c)) t[g as MuscleGroup] += (Number(e.sets) || 0) * (v ?? 0);
    }
  }
  return t;
}

const isLift = (s: PlanSession) => s.kind === "lift" || s.kind === "lift_and_run";
const hasLegs = (s: PlanSession) => s.taxesLegs || s.exercises.some((e) => ["squat", "hinge"].includes(patternOf(e.name)));
const MAX_SETS = 5;
const MIN_SETS = 2;

/**
 * Brings the week to its set targets: a muscle group short of its target
 * gets sets added to the movements already there (up to five each), then a
 * simple extra movement on a fitting day; one well over (ramp-in, deload)
 * has sets taken off, never below two. `done` counts work already logged.
 */
export function fitVolume(input: PlanSession[], targets: Record<MuscleGroup, number>, done: PlanSession[] = []): PlanSession[] {
  const sessions = input.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e })) }));
  const lifts = sessions.filter(isLift);
  if (!lifts.length) return sessions;
  const total = (g: MuscleGroup) => weeklySets([...done, ...sessions])[g];

  for (const g of Object.keys(targets) as MuscleGroup[]) {
    const target = targets[g];
    const mine = () => sessions.flatMap((s) => s.exercises).filter((e) => primaryGroup(e.name) === g);
    // Short: add sets to what's there, fewest first.
    for (let guard = 0; guard < 30 && total(g) <= target - 1; guard++) {
      const room = mine().filter((e) => e.sets < MAX_SETS).sort((a, b) => a.sets - b.sets)[0];
      if (room) {
        room.sets += 1;
        continue;
      }
      // Nothing left to grow: one more movement, on the lift day with the fewest exercises that suits it.
      const fits = lifts
        .filter((s) => (LEG_GROUPS.has(g) ? hasLegs(s) : true) && !s.exercises.some((e) => e.name === TOP_UP[g].name))
        .sort((a, b) => Number(!LEG_GROUPS.has(g) && hasLegs(a)) - Number(!LEG_GROUPS.has(g) && hasLegs(b)) || a.exercises.length - b.exercises.length)[0];
      if (!fits) break;
      const t = TOP_UP[g];
      const need = Math.min(4, Math.max(MIN_SETS, Math.round(target - total(g))));
      fits.exercises.push({ name: t.name, sets: need, reps: t.reps, target: null, cue: null, isNew: false, regions: t.regions, note: `volume — ${g} was short of this week's ${target} sets` });
      for (const r of t.regions) if (!fits.regions.includes(r)) fits.regions = [...fits.regions, r];
    }
    // Well over (ramp-in and deload weeks): take sets off the biggest.
    for (let guard = 0; guard < 30 && total(g) > target * 1.25 + 1; guard++) {
      const big = mine().filter((e) => e.sets > MIN_SETS).sort((a, b) => b.sets - a.sets)[0];
      if (!big) break;
      big.sets -= 1;
    }
  }
  return sessions;
}

// ── Jumps, sprints and the first-week-back loads ─────────────────────

const isPowerMove = (name: string) => patternOf(name) === "power" && !/strides?\b/i.test(name);
const count = (s: PlanSession, p: Pattern) => s.exercises.filter((e) => patternOf(e.name) === p).reduce((n, e) => n + e.sets, 0);

/**
 * Puts the week's jumps at the start of the squat-led lower day and its
 * sprints and agility at the start of the hinge-led one, replacing whatever
 * power work the model wrote. With one lower day, it carries the jumps.
 */
export function applyAthletics(input: PlanSession[], program: Program): PlanSession[] {
  const sessions = input.map((s) => ({ ...s, exercises: s.exercises.filter((e) => !isPowerMove(e.name)) }));
  const lower = sessions.filter((s) => isLift(s) && hasLegs(s));
  if (!lower.length) return sessions;
  const squatDay = [...lower].sort((a, b) => count(b, "squat") - count(a, "squat"))[0];
  const hingeDay = lower.filter((s) => s !== squatDay).sort((a, b) => count(b, "hinge") - count(a, "hinge"))[0];
  const open = (s: PlanSession, block: PlanExercise[]) => {
    s.exercises = [...block.map((e) => ({ ...e })), ...s.exercises];
    for (const e of block) for (const r of e.regions) if (!s.regions.includes(r)) s.regions = [...s.regions, r];
    s.taxesLegs = true;
  };
  open(squatDay, program.jumps);
  if (hingeDay) open(hingeDay, program.speed);
  return sessions;
}

/** First week back: leg loads at a share of what the log says, rounded to 5 lb. */
export function easeLegLoads(input: PlanSession[], factor: number): PlanSession[] {
  if (factor >= 1) return input;
  return input.map((s) => ({
    ...s,
    exercises: s.exercises.map((e) => {
      const p = patternOf(e.name);
      const m = /^(\d+(?:\.\d+)?) lb$/.exec(e.target ?? "");
      if ((p !== "squat" && p !== "hinge") || !m) return e;
      const eased = Math.round((Number(m[1]) * factor) / 5) * 5;
      return { ...e, target: `${eased} lb`, note: `first week back — about ${Math.round(factor * 100)}% of your last load (${m[1]} lb)` };
    }),
  }));
}
