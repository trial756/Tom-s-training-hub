// Fine-grained muscle regions — the vocabulary shared by the exercise
// lookup table, the workout parser, and the body-map avatar. Fixed enum on
// purpose: the parser can't invent a region the avatar has no path for.

export const MUSCLE_REGIONS = [
  // front
  "chest",
  "front_delts",
  "side_delts",
  "biceps",
  "forearms",
  "abs",
  "obliques",
  "quads",
  // back
  "rear_delts",
  "traps",
  "lats",
  "mid_back",
  "lower_back",
  "triceps",
  "glutes",
  "hamstrings",
  "calves",
] as const;

export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];

export const MUSCLE_LABELS: Record<MuscleRegion, string> = {
  chest: "Chest",
  front_delts: "Front Delts",
  side_delts: "Side Delts",
  rear_delts: "Rear Delts",
  traps: "Traps",
  lats: "Lats",
  mid_back: "Mid Back",
  lower_back: "Lower Back",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
};

/** Which side of the figure each region is drawn on. */
export const FRONT_REGIONS: MuscleRegion[] = [
  "chest",
  "front_delts",
  "side_delts",
  "biceps",
  "forearms",
  "abs",
  "obliques",
  "quads",
];

export const BACK_REGIONS: MuscleRegion[] = [
  "rear_delts",
  "traps",
  "lats",
  "mid_back",
  "lower_back",
  "triceps",
  "glutes",
  "hamstrings",
  "calves",
];

/**
 * Running loads legs too. Without this the avatar would show a marathoner's
 * legs as permanently neglected while they run 20+ miles a week.
 */
export const RUN_REGIONS: MuscleRegion[] = ["quads", "hamstrings", "glutes", "calves"];

/**
 * Fallback for workouts whose exercises aren't individually tagged — the
 * coarse muscle_groups field the parser has always written. Lower fidelity
 * than per-exercise tags, but it keeps older entries from reading as blank.
 */
export const COARSE_TO_REGIONS: Record<string, MuscleRegion[]> = {
  Chest: ["chest", "front_delts"],
  Back: ["lats", "mid_back", "traps"],
  Legs: ["quads", "hamstrings", "glutes", "calves"],
  Shoulders: ["front_delts", "side_delts", "rear_delts"],
  Arms: ["biceps", "triceps", "forearms"],
  Core: ["abs", "obliques", "lower_back"],
  "Full Body": ["chest", "lats", "quads", "glutes", "abs", "side_delts"],
  Cardio: ["quads", "hamstrings", "glutes", "calves"],
  Mobility: [],
  Other: [],
};

export function isMuscleRegion(value: unknown): value is MuscleRegion {
  return typeof value === "string" && (MUSCLE_REGIONS as readonly string[]).includes(value);
}

/** Keeps only valid regions, de-duplicated, preserving enum order. */
export function cleanRegions(values: unknown): MuscleRegion[] {
  if (!Array.isArray(values)) return [];
  const set = new Set(values.filter(isMuscleRegion));
  return MUSCLE_REGIONS.filter((r) => set.has(r));
}
