import type { MuscleRegion } from "@/lib/muscles";

// ── Movement patterns ────────────────────────────────────────────────
//
// What an exercise *does*, read from its name. Session structure is built on
// this: two heavy lifts of the same family (two presses, two pulls, two leg
// compounds) never sit back to back, and each pattern gets one heavy day a
// week.

export type Pattern =
  | "horizontal_press"
  | "vertical_press"
  | "horizontal_pull"
  | "vertical_pull"
  | "squat"
  | "hinge"
  | "elbow_flexion"
  | "elbow_extension"
  | "lateral_raise"
  | "rear_delt"
  | "fly"
  | "shrug"
  | "calf"
  | "core"
  | "mobility"
  | "power"
  | "other";

export type Family = "push" | "pull" | "legs" | "arms" | "shoulders" | "core" | "mobility" | "power" | "other";

const RULES: [RegExp, Pattern][] = [
  // Jumps, sprints, throws and strides: fast, low-rep, done fresh.
  [/jump|pogo|\bhops?\b|bound|sprint|strides?\b|med(icine)? ball|ball slam|throw|shuttle|agility|ladder drill|skater/, "power"],
  [/stretch|cat.?cow|90\/90|pigeon|leg swing|a.?skip|walk(ing)?$|^walk|mobility|foam|yoga|world.?s greatest/, "mobility"],
  [/pallof|plank|dead ?bug|crunch|sit.?up|hollow|bird ?dog|ab wheel|rollout|leg raise|knee raise|copenhagen|carry|suitcase|russian twist|wood ?chop/, "core"],
  [/calf/, "calf"],
  [/shrug/, "shrug"],
  [/rear delt|face pull|reverse fly|reverse pec/, "rear_delt"],
  [/lateral raise|side raise|upright row/, "lateral_raise"],
  [/fly|pec dec|crossover|cross.?over/, "fly"],
  [/skull|pushdown|push.?down|tricep|triceps|kickback|overhead extension|dip/, "elbow_extension"],
  // A leg curl is hamstring work, not a biceps curl.
  [/leg curl|hamstring curl|nordic/, "hinge"],
  [/curl/, "elbow_flexion"],
  [/pulldown|pull.?down|pull.?up|chin.?up|lat pull/, "vertical_pull"],
  [/row|cable pull|horizontal pull|seated pull/, "horizontal_pull"],
  [/shoulder press|overhead press|military|arnold|\bohp\b|push press|landmine press/, "vertical_press"],
  [/bench|chest press|incline press|incline .*press|decline|push.?up|floor press|machine press/, "horizontal_press"],
  [/deadlift|\brdl\b|good morning|hip thrust|glute bridge|hip hinge|kettlebell swing|back extension|hyperextension/, "hinge"],
  [/squat|lunge|split squat|step.?up|leg press|hack|goblet|leg extension|sissy/, "squat"],
];

export function patternOf(name: string): Pattern {
  const n = name.toLowerCase();
  for (const [re, p] of RULES) if (re.test(n)) return p;
  return "other";
}

const FAMILY: Record<Pattern, Family> = {
  horizontal_press: "push",
  vertical_press: "push",
  horizontal_pull: "pull",
  vertical_pull: "pull",
  squat: "legs",
  hinge: "legs",
  elbow_flexion: "arms",
  elbow_extension: "arms",
  lateral_raise: "shoulders",
  rear_delt: "shoulders",
  fly: "push",
  shrug: "pull",
  calf: "legs",
  core: "core",
  mobility: "mobility",
  power: "power",
  other: "other",
};

export const familyOf = (p: Pattern): Family => FAMILY[p];

/** The muscle an isolation pattern is really for — used to tell what an accessory overlaps. */
export const PATTERN_TARGET: Partial<Record<Pattern, MuscleRegion>> = {
  elbow_extension: "triceps",
  elbow_flexion: "biceps",
  fly: "chest",
  lateral_raise: "side_delts",
  rear_delt: "rear_delts",
  shrug: "traps",
  calf: "calves",
};

/** Multi-joint lifts that carry real load — the ones that go first and get a heavy day. */
export const COMPOUND = new Set<Pattern>(["horizontal_press", "vertical_press", "horizontal_pull", "vertical_pull", "squat", "hinge"]);

export function isLowerBody(p: Pattern, regions: MuscleRegion[] = []): boolean {
  return p === "squat" || p === "hinge" || p === "calf" || regions.some((r) => r === "quads" || r === "hamstrings" || r === "glutes");
}

export const PATTERN_LABEL: Record<Pattern, string> = {
  horizontal_press: "horizontal press",
  vertical_press: "overhead press",
  horizontal_pull: "row",
  vertical_pull: "vertical pull",
  squat: "squat / lunge",
  hinge: "hinge",
  elbow_flexion: "curl",
  elbow_extension: "triceps",
  lateral_raise: "lateral raise",
  rear_delt: "rear delt",
  fly: "fly",
  shrug: "shrug",
  calf: "calf",
  core: "core",
  mobility: "mobility",
  power: "power / speed",
  other: "other",
};
