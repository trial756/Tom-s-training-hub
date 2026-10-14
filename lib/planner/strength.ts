import type { PlannerContext, StrengthDose } from "@/lib/planner/types";

/**
 * How much lifting the week should carry and what it's for — computed from
 * where the athlete sits in the block, so the model chooses the exercises but
 * never decides the dose.
 *
 * These are principles, not a template: the counts are ceilings and floors,
 * and the guidance names intent ("one heavy lower, one power") rather than
 * movements, so the week can still bend around what the logs say.
 */
export function strengthDoseFor(opts: {
  marathon: PlannerContext["marathon"];
  /** True once race day has passed. */
  postRace: boolean;
  liftDaysPerWeek: number;
}): StrengthDose {
  const { marathon, postRace, liftDaysPerWeek } = opts;
  const clamp = (min: number, max: number) => Math.min(max, Math.max(min, liftDaysPerWeek));

  if (postRace) {
    return {
      mode: "build",
      liftSessions: clamp(4, 5),
      heavyLower: 2,
      guidance:
        "The marathon is done; the goal is now muscle and athleticism. Run an upper/lower hypertrophy split " +
        "(6-12 reps, 2-3 reps in reserve, progressive overload) and open lower days with power and speed work " +
        "(jumps, sprints, agility drills). Running stays in as conditioning — easy runs and the odd interval " +
        "session — not a build. The Feb 28 half is for fun and gets no dedicated block.",
    };
  }

  if (!marathon) {
    return {
      mode: "base",
      liftSessions: clamp(3, 4),
      heavyLower: 1,
      guidance: "No race block is active. Three to four upper/lower sessions around easy running.",
    };
  }

  if (marathon.isRaceWeek || marathon.daysToRace <= 10) {
    return {
      mode: "taper",
      liftSessions: 2,
      heavyLower: 0,
      guidance:
        "Final ten days. No heavy or new lifting and nothing that leaves soreness: two short upper-body and core " +
        "maintenance sessions at familiar loads, no legs beyond glute activation. Mobility and strides carry the rest.",
    };
  }

  if (marathon.phase === "Taper") {
    return {
      mode: "taper",
      liftSessions: clamp(3, 3),
      heavyLower: 1,
      guidance:
        "Taper: keep the weight on the bar but cut the volume about in half — one lower session of two or three " +
        "working sets at the usual load, no plyometrics to fatigue, no new movements. Two upper-body sessions at " +
        "normal load with a set less than usual.",
    };
  }

  if (marathon.isRecoveryWeek) {
    return {
      mode: "maintain",
      liftSessions: clamp(3, 4),
      heavyLower: 0,
      guidance:
        "Cutback week: the body is absorbing load, so lower-body work drops to single-leg control, calves and hip " +
        "stability at moderate weight. Upper body trains heavy as normal — push and pull sessions.",
    };
  }

  if (marathon.phase === "Peak") {
    return {
      mode: "maintain",
      liftSessions: clamp(4, 4),
      heavyLower: 1,
      guidance:
        "Peak: the running is the leg stimulus, so lower-body lifting holds strength without adding fatigue — one " +
        "heavy lower session (3 sets of 4-6, two reps in reserve) stacked onto a quality-run day. Upper body is " +
        "unaffected by the mileage and trains heavy: a push session, a pull session, and a third upper session " +
        "(shoulders, arms or a second push/pull), each a real gym session.",
    };
  }

  return {
    mode: "base",
    liftSessions: clamp(4, 5),
    heavyLower: 1,
    guidance:
      "Building: two lower sessions — one heavy (4-5 sets of 4-6, two reps in reserve) stacked onto a " +
      "quality-run day, one lighter power/single-leg session — plus heavy push and pull upper-body sessions.",
  };
}

/**
 * The rules that hold in every phase. Kept with the dose so the prompt and
 * the numbers can't drift apart.
 */
export const STRENGTH_PRINCIPLES = [
  "Running already trains the legs; lifting is there to make the athlete durable — strong hips, calves and trunk so form holds late in the race — not to add leg fatigue.",
  "Hard days hard, easy days easy: put heavy lower-body work on the same day as a quality run (one 'lift_and_run' session, run first) so the legs take one hard day instead of two half-hard ones. Never put heavy legs on an easy day or the day before the long run.",
  "Lower-body strength is heavy and low-rep (4-6 reps, stop two short of failure), not high-rep burnout. Favour single-leg work — split squats, step-ups, single-leg RDLs — because running is single-leg.",
  "Calves (straight-leg and bent-knee, slow eccentrics) and hip stability (glute medius, adductors) get direct work every week — that's where running injuries start.",
  "Core is anti-rotation and anti-extension (Pallof press, dead bugs, side planks, Copenhagen planks), at least twice a week, usually riding along with an easy run.",
  "Dynamic before, static after: a key run carries a short dynamic warm-up (leg swings, A-skips, walking lunges); long static holds and foam rolling go in the mobility block after easy runs.",
  "Upper body isn't where running fatigue lives, so it trains heavy in every phase but the final ten days: real push and pull sessions (compound lifts at 4-8 reps, progressed from the anchor list, plus accessories), not a few curls tacked onto a core block. Lean slightly toward pulling for posture.",
  "Never two days in a row without a gym session ('lift' or 'lift_and_run'); an accessory or mobility block doesn't count. The day before the long run is an upper-body day — it doesn't touch the legs — not an accessory day.",
];
