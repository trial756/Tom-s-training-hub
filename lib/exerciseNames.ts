// ── One name per lift ────────────────────────────────────────────────
//
// The AI parser and hand edits have logged the same movement under several
// names ("Incline Bench Press", "Incline Barbell Press", "Incline Barbell
// Bench Press"), which split a lift's history: trends, stall checks, loads
// and "new" tags each saw only part of it. Every grouping in the app goes
// through exerciseKey(), which maps a name to its lift's one key:
//   1. tidy it (case, punctuation, plurals, the word "barbell")
//   2. map known aliases to the lift's standard name (below), matching in
//      any word order ("Lateral Cable Raise" = "Cable Lateral Raise")
// A name with no alias keeps the same key it always had, so existing
// exercise_muscles rows still match.
// Stored workouts keep the words as they were logged; new AI-parsed logs
// are saved under the standard name.

/**
 * Standard name → other names it has been logged under. Only true synonyms:
 * a different grip, implement or one-arm version is a different lift (the
 * loads aren't comparable), so it stays its own entry.
 */
export const EXERCISE_ALIASES: Record<string, string[]> = {
  "Incline Barbell Bench Press": ["Incline Bench Press", "Incline Barbell Press", "Incline Press"],
  "Barbell Bench Press": ["Bench Press", "Flat Bench Press", "Flat Barbell Bench Press"],
  "Barbell Shoulder Press": ["Barbell Overhead Press", "Overhead Press", "OHP", "Military Press", "Standing Barbell Press"],
  "Back Squat": ["Barbell Back Squat", "Barbell Squat", "Squat"],
  "Romanian Deadlift": ["RDL", "Barbell RDL", "Barbell Romanian Deadlift"],
  "Bent Over Barbell Row": ["Barbell Row", "Bent-Over Row", "Bent Over Row"],
  "Narrow Grip Horizontal Cable Pull": ["Horizontal Cable Pull", "Seated Cable Row", "Narrow Grip Cable Row", "Cable Row"],
  "Pec Dec Fly": ["Pec Dec Chest Fly", "Pec Deck Fly", "Pec Deck Chest Fly", "Pec Dec", "Pec Deck", "Pecdec Fly", "Pecdec Chest Fly"],
  // A pec dec turned around for the delts (Tom logs it "pecdec deltoid flys") is a rear delt fly, not a chest fly.
  "Rear Delt Fly": ["Pec Deck Rear Delt Fly", "Pec Dec Rear Delt Fly", "Reverse Pec Deck", "Reverse Pec Dec", "Machine Rear Delt Fly", "Pec Dec Deltoid Fly", "Pecdec Deltoid Fly", "Pec Deck Deltoid Fly", "Pec Dec Delt Fly", "Pecdec Delt Fly"],
  "Cable Lateral Raise": ["Lateral Cable Raise"],
  "Single Arm Cable Lateral Raise": ["Single Arm Lateral Cable Raise", "Lateral Cable Raise (Single Arm)"],
  "Dumbbell Lateral Raise": ["Lateral Dumbbell Raise", "DB Lateral Raise", "Lateral Raise"],
  "Tricep Pushdown": ["Tricep Pulldown", "Cable Tricep Pulldown", "Tricep Cable Pulldown", "Cable Tricep Pushdown", "Triceps Pushdown", "Tricep Cable Pushdown"],
  "EZ-Bar Skull Crusher": ["EZ Bar Skull Crusher", "Skull Crusher", "Skullcrusher"],
  "EZ-Bar Curl": ["EZ Bar Curl"],
  "EZ-Bar Preacher Curl": ["EZ Bar Preacher Curl", "Preacher Curl"],
  "Machine Incline Press": ["Incline Machine Press", "Incline Chest Press Machine"],
  "Single Arm Lat Pulldown": ["Single Arm Cable Pulldown"],
  "Dumbbell Incline Press": ["Incline Dumbbell Press", "Incline DB Press"],
  "Pull-Up": ["Pullup", "Pull Up"],
  "Push-Up": ["Pushup", "Push Up"],
  "Pogo Hops": ["Pogo Hop"],
};

const STOPWORDS = new Set(["barbell"]);

/** Tidied words of a name: lower case, no punctuation, no plural s, no "barbell". */
function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

const orderFree = (ws: string[]) => [...ws].sort().join(" ");

// order-free form of every standard name and alias → the standard name
const INDEX = new Map<string, string>();
for (const [standard, aliases] of Object.entries(EXERCISE_ALIASES)) {
  for (const n of [standard, ...aliases]) INDEX.set(orderFree(words(n)), standard);
}

/** The lift's standard name, or the name as given (trimmed) when it has none. */
export function canonicalExerciseName(name: string): string {
  const standard = INDEX.get(orderFree(words(name)));
  return standard ?? name.trim().replace(/\s+/g, " ");
}

/** The one grouping key for a lift, whatever it was logged as. */
export function exerciseKey(name: string): string {
  const standard = INDEX.get(orderFree(words(name)));
  return (standard ? words(standard) : words(name)).join(" ");
}

/**
 * The same key for a value that was already a grouping key from the old
 * scheme (exercise_muscles rows are keyed that way), without tidying it a
 * second time — "pres" mustn't become "pre".
 */
export function exerciseKeyFromStoredKey(key: string): string {
  const ws = key.split(" ").filter(Boolean);
  const standard = INDEX.get(orderFree(ws));
  return standard ? words(standard).join(" ") : key;
}
