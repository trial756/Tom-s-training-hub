import Anthropic from "@anthropic-ai/sdk";
import { formatDuration, formatPace } from "@/lib/format";

const MODEL = "claude-sonnet-4-6";

let cachedClient: Anthropic | null = null;

function client() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/**
 * Runs a natural-language entry through Claude, forcing a single tool call
 * so the response is always valid JSON matching `inputSchema` — this is more
 * broadly compatible across model versions than output_config.format.
 */
async function parseWithTool<T>(opts: {
  system: string;
  userText: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
}): Promise<T> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.inputSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content: opts.userText }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    throw new Error("Claude did not return a structured tool call.");
  }

  return toolUse.input as T;
}

// ── Shared context ──────────────────────────────────────────────────────

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Included in every coaching prompt so Claude knows where "today" falls in
 * the Sunday–Saturday training week — without this, late-week logs (Fri/Sat)
 * generated advice implying days that don't exist (e.g. "add 2 more runs
 * this week"). Uses Date's local getters, not toISOString() slicing, to
 * avoid UTC rollover near midnight. Explicitly framed as background context
 * rather than something to restate, so responses don't open with "Since
 * it's Tuesday..." every time.
 */
function todayContext(): string {
  const now = new Date();
  const weekday = WEEKDAY_NAMES[now.getDay()];
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    `Background context for your own reasoning only, not something to state back: today is ${weekday}, ${dateStr}. ` +
    `Training weeks run Sunday through Saturday. Use this to reason correctly about "this week" vs "next week" — ` +
    `e.g. if today is Friday or Saturday, don't suggest adding more sessions "this week" when only a day or two ` +
    `remain; frame forward-looking suggestions as next week instead. You don't need to mention today's date or the ` +
    `day of the week in your response unless it's actually relevant to the feedback — stay naturally conversational.`
  );
}

// ── Workouts ────────────────────────────────────────────────────────────

export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Legs",
  "Shoulders",
  "Arms",
  "Core",
  "Full Body",
  "Cardio",
  "Mobility",
  "Other",
] as const;

export interface ParsedWorkout {
  exercises: {
    name: string;
    sets: { reps: number | null; weight: number | null; weight_unit: string | null }[];
  }[];
  duration_minutes: number | null;
  notes: string;
  coaching_feedback: string;
  vs_last_time: string | null;
  adjustments: string[];
  type: string;
  muscle_groups: string[];
  intensity: string;
  calories_burned_est: number | null;
  summary: string;
  weekly_note: string | null;
}

// Shared by the workout and run coaching schemas — the "Vs Last Time" and
// "Adjustments" sections of the 3-part coaching format.
const vsLastTimeProperty = {
  type: ["string", "null"],
  description:
    "A comparison to the most relevant prior entry from the history provided, citing specific numbers from both " +
    "(e.g. weight/reps, or pace/distance) and a concrete conclusion — improved, consistent, or regressed, and why. " +
    "Null if nothing comparable exists in the provided history (e.g. this is the first entry of its kind).",
};

const adjustmentsProperty = {
  type: "array",
  items: { type: "string" },
  description:
    "2-4 concrete, specific, actionable suggestions for next time — target weights/reps/pace, rest periods, " +
    "substitutions. Each one a single self-contained sentence. Empty array if there's nothing specific to adjust.",
};

const workoutSchema = {
  type: "object",
  properties: {
    exercises: {
      type: "array",
      description: "Every exercise mentioned, in the order performed.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exercise name, normalized (e.g. 'Bench Press')." },
          sets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                reps: { type: ["integer", "null"] },
                weight: { type: ["number", "null"] },
                weight_unit: { type: ["string", "null"], description: "'lb' or 'kg', null if bodyweight." },
              },
              required: ["reps", "weight", "weight_unit"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "sets"],
        additionalProperties: false,
      },
    },
    duration_minutes: { type: ["integer", "null"], description: "Total workout duration if mentioned or inferable." },
    notes: { type: "string", description: "Anything noteworthy that isn't a coaching comment: soreness, PRs, how it felt." },
    type: {
      type: "string",
      enum: ["strength", "cardio", "flexibility", "hiit", "run", "other"],
      description: "The overall category of the workout.",
    },
    muscle_groups: {
      type: "array",
      items: { type: "string", enum: [...MUSCLE_GROUPS] },
      description: "Every muscle group meaningfully worked, e.g. ['Chest', 'Arms']. Use ['Cardio'] for pure cardio, ['Mobility'] for yoga/stretching.",
    },
    intensity: {
      type: "string",
      enum: ["low", "moderate", "high"],
      description: "Overall session intensity based on volume, weight, and effort described.",
    },
    calories_burned_est: { type: ["integer", "null"], description: "Estimated calories burned, based on type/duration/intensity." },
    summary: { type: "string", description: "A short one-line summary for list views, e.g. 'Chest & Triceps — 5 exercises, 42 min'." },
    coaching_feedback: {
      type: "string",
      description:
        "2-4 sentences of specific, encouraging coaching feedback on THIS workout in isolation: volume, intensity, " +
        "technique/weight-progression signals, and one concrete observation. Do not compare to prior workouts here " +
        "— that belongs in vs_last_time.",
    },
    vs_last_time: vsLastTimeProperty,
    adjustments: adjustmentsProperty,
    weekly_note: {
      type: ["string", "null"],
      description:
        "One sentence noting a pattern for the current training week (Sunday–Saturday) if the dated history " +
        "supports one — consistency, frequency, or a muscle group being under/over-trained. Null if there's not " +
        "enough history yet to say anything meaningful.",
    },
  },
  required: [
    "exercises",
    "duration_minutes",
    "notes",
    "type",
    "muscle_groups",
    "intensity",
    "calories_burned_est",
    "summary",
    "coaching_feedback",
    "vs_last_time",
    "adjustments",
    "weekly_note",
  ],
  additionalProperties: false,
};

export async function parseWorkoutEntry(text: string, historyContext: string): Promise<ParsedWorkout> {
  return parseWithTool<ParsedWorkout>({
    system:
      "You are a strength-training coach parsing a natural-language workout log into structured data. " +
      "Extract every exercise, set, rep count, and weight mentioned. If units are ambiguous, assume lb. " +
      "If a value isn't mentioned, use null rather than guessing. Classify the workout's type, the muscle groups " +
      "it hits, its overall intensity, and estimate calories burned. Then give brief, specific coaching feedback.\n\n" +
      "You'll also be given up to the athlete's last 10 workouts (most recent first, each tagged with muscle " +
      "groups). To build the 'vs last time' comparison, find the most recent one that shares at least one muscle " +
      "group with today's workout — prefer a match on the same specific exercise if one exists among those, " +
      "otherwise use the best muscle-group match. Name the specific exercise you're comparing, cite specific " +
      "numbers (weight/reps/volume) from both sessions, state how many days ago that prior session was, and give a " +
      "clear conclusion (improved, consistent, or regressed). If nothing in the history shares a muscle group, " +
      "vs_last_time is null.\n\n" + todayContext(),
    userText:
      `New workout entry to parse:\n"${text}"\n\n` +
      `Recent workout history for comparison (most recent first):\n${historyContext || "No prior workouts logged yet."}`,
    toolName: "record_workout",
    toolDescription: "Records a structured, parsed weightlifting/strength workout with 3-part coaching feedback.",
    inputSchema: workoutSchema,
  });
}

// ── Runs ────────────────────────────────────────────────────────────────
// Runs are logged through a structured form (run type + explicit fields), not
// free text, so there's nothing to extract — Claude's only job here is to
// generate coaching feedback (and, optionally, estimate calories when the
// athlete didn't provide any) grounded in the exact numbers submitted.

export interface StructuredRunInput {
  run_type: string;
  distance_miles: number | null;
  duration_seconds: number | null;
  pace_seconds_per_mile: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  cadence_spm: number | null;
  elev_gain_ft: number | null;
  elev_loss_ft: number | null;
  calories: number | null;
  temp_f: number | null;
  humidity_pct: number | null;
  surface: string | null;
  notes: string | null;
  feel: string | null;
}

export interface RunCoachingResult {
  coaching_feedback: string;
  calories: number | null;
  vs_last_time: string | null;
  adjustments: string[];
  pace_note: string | null;
  summary: string;
  weekly_note: string | null;
}

const runCoachingSchema = {
  type: "object",
  properties: {
    coaching_feedback: {
      type: "string",
      description:
        "2-4 sentences of specific, encouraging coaching feedback on THIS run in isolation, relative to marathon " +
        "training (goal: 3:30 marathon, ~8:01/mi race pace) — pace discipline and effort relative to " +
        "conditions/terrain/elevation. Do not compare to prior runs here — that belongs in vs_last_time.",
    },
    estimated_calories: {
      type: ["integer", "null"],
      description:
        "Only populate if the athlete did not already provide a calorie count — estimate from distance, pace, " +
        "and typical running energy expenditure. If a calorie count was already provided, return null here.",
    },
    pace_note: {
      type: ["string", "null"],
      description:
        "One sentence assessing today's average pace relative to the 8:01/mi marathon goal pace, appropriate to " +
        "the run type — e.g. easy/long runs should be slower than goal pace by design, that's correct pacing, not " +
        "a problem; tempo/marathon-pace/interval runs should be judged against their own target zones. Null if no " +
        "pace was recorded.",
    },
    summary: { type: "string", description: "A short one-line summary for list views, e.g. '5mi Tempo, 7:00/mi avg'." },
    vs_last_time: vsLastTimeProperty,
    adjustments: adjustmentsProperty,
    weekly_note: {
      type: ["string", "null"],
      description:
        "One sentence noting a pattern for the current training week (Sunday–Saturday) if the dated history " +
        "supports one — mileage pace, run-type mix, or consistency. Null if there's not enough history yet.",
    },
  },
  required: ["coaching_feedback", "estimated_calories", "pace_note", "summary", "vs_last_time", "adjustments", "weekly_note"],
  additionalProperties: false,
};

function describeRun(run: StructuredRunInput): string {
  const parts: string[] = [`Run type: ${run.run_type}`];
  if (run.distance_miles != null) parts.push(`Distance: ${run.distance_miles} mi`);
  if (run.duration_seconds != null) parts.push(`Duration: ${formatDuration(run.duration_seconds)}`);
  if (run.pace_seconds_per_mile != null) parts.push(`Avg pace: ${formatPace(run.pace_seconds_per_mile)}`);
  if (run.avg_hr != null) parts.push(`Avg HR: ${run.avg_hr} bpm`);
  if (run.max_hr != null) parts.push(`Max HR: ${run.max_hr} bpm`);
  if (run.cadence_spm != null) parts.push(`Cadence: ${run.cadence_spm} spm`);
  if (run.elev_gain_ft != null) parts.push(`Elevation gain: ${run.elev_gain_ft} ft`);
  if (run.elev_loss_ft != null) parts.push(`Elevation loss: ${run.elev_loss_ft} ft`);
  if (run.calories != null) parts.push(`Calories: ${run.calories}`);
  if (run.temp_f != null) parts.push(`Temp: ${run.temp_f}°F`);
  if (run.humidity_pct != null) parts.push(`Humidity: ${run.humidity_pct}%`);
  if (run.surface) parts.push(`Surface: ${run.surface}`);
  if (run.feel) parts.push(`Feel: ${run.feel}`);
  if (run.notes) parts.push(`Notes: ${run.notes}`);
  return parts.join("\n");
}

export async function generateRunCoaching(run: StructuredRunInput, historyContext: string): Promise<RunCoachingResult> {
  const result = await parseWithTool<{
    coaching_feedback: string;
    estimated_calories: number | null;
    pace_note: string | null;
    summary: string;
    vs_last_time: string | null;
    adjustments: string[];
    weekly_note: string | null;
  }>({
    system:
      "You are a marathon running coach. The athlete is training for a 3:30:00 marathon (goal pace 8:01/mi) and " +
      "logged a run using precise structured fields from their watch/app — everything below is already extracted, " +
      "there is nothing left to parse. Give brief, specific coaching feedback grounded in the exact numbers " +
      "provided, and a note on pace relative to goal pace where applicable. You'll also be given a list of the " +
      "athlete's recent past runs (most recent first) — use it to find the most relevant prior run (same run type " +
      "is the strongest match) and write a 'vs last time' comparison grounded in specific numbers from both, plus " +
      "concrete adjustments for next time.\n\n" + todayContext(),
    userText:
      `Today's run:\n${describeRun(run)}\n\n` +
      `Recent run history for comparison (most recent first):\n${historyContext || "No prior runs logged yet."}`,
    toolName: "record_run_coaching",
    toolDescription: "Records 3-part coaching feedback (and an optional calorie estimate) for an already-structured run.",
    inputSchema: runCoachingSchema,
  });
  return {
    coaching_feedback: result.coaching_feedback,
    calories: run.calories ?? result.estimated_calories ?? null,
    pace_note: result.pace_note,
    summary: result.summary,
    vs_last_time: result.vs_last_time,
    adjustments: result.adjustments,
    weekly_note: result.weekly_note,
  };
}

// ── Meals ───────────────────────────────────────────────────────────────

export interface ParsedMealItem {
  name: string;
  calories_est: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface ParsedMeal {
  meal_type: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  items: ParsedMealItem[];
  notes: string;
  coaching_feedback: string;
  summary: string;
}

const mealSchema = {
  type: "object",
  properties: {
    meal_type: {
      type: "string",
      enum: ["breakfast", "lunch", "dinner", "snack"],
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short, normalized name for the food item." },
          calories_est: { type: ["integer", "null"] },
          protein_g: { type: ["number", "null"] },
          carbs_g: { type: ["number", "null"] },
          fat_g: { type: ["number", "null"] },
        },
        required: ["name", "calories_est", "protein_g", "carbs_g", "fat_g"],
        additionalProperties: false,
      },
      description:
        "Each distinct food item mentioned, with its own estimated macros — use reasonable nutritional estimates " +
        "for typical portion sizes when exact amounts aren't given.",
    },
    calories: { type: ["integer", "null"], description: "Total calories — should equal roughly the sum of the items' calories_est." },
    protein_g: { type: ["number", "null"], description: "Total protein — should equal roughly the sum of the items' protein_g." },
    carbs_g: { type: ["number", "null"], description: "Total carbs — should equal roughly the sum of the items' carbs_g." },
    fat_g: { type: ["number", "null"], description: "Total fat — should equal roughly the sum of the items' fat_g." },
    summary: { type: "string", description: "A short one-line summary for list views, e.g. '3 eggs, oatmeal, coffee'." },
    notes: { type: "string" },
    coaching_feedback: {
      type: "string",
      description:
        "1-3 sentences of practical fueling feedback for a marathon-training runner: macro balance, timing relative to training, and one concrete suggestion.",
    },
  },
  required: ["meal_type", "items", "calories", "protein_g", "carbs_g", "fat_g", "summary", "notes", "coaching_feedback"],
  additionalProperties: false,
};

export async function parseMealEntry(text: string): Promise<ParsedMeal> {
  return parseWithTool<ParsedMeal>({
    system:
      "You are a sports nutritionist parsing a natural-language meal log into structured data for a runner training " +
      "for a marathon. Break the meal into individual food items and estimate calories/macros per item — use " +
      "reasonable nutritional estimates for common foods and typical portion sizes when exact amounts aren't " +
      "given — then roll those up into meal totals. Then give brief, practical fueling feedback.",
    userText: text,
    toolName: "record_meal",
    toolDescription: "Records a structured, parsed meal with itemized macros and coaching feedback.",
    inputSchema: mealSchema,
  });
}

// ── Periodic summary ───────────────────────────────────────────────────

export interface TrainingSummary {
  headline: string;
  summary: string;
  wins: string[];
  watchouts: string[];
  next_week_focus: string;
}

const summarySchema = {
  type: "object",
  properties: {
    headline: { type: "string", description: "A punchy 4-8 word headline capturing the period's overall theme." },
    summary: { type: "string", description: "3-4 sentence narrative summary of the period's training, running, and fueling." },
    wins: {
      type: "array",
      items: { type: "string" },
      description: "2-4 specific, concrete wins from the period, grounded in the actual data provided.",
    },
    watchouts: {
      type: "array",
      items: { type: "string" },
      description:
        "1-3 specific things to watch out for or improve — supportive, not alarmist. Empty array if genuinely " +
        "nothing stands out.",
    },
    next_week_focus: { type: "string", description: "1-2 sentences on what to prioritize going into the next training week." },
  },
  required: ["headline", "summary", "wins", "watchouts", "next_week_focus"],
  additionalProperties: false,
};

export async function summarizeTraining(input: {
  rangeLabel: string;
  workoutsSummary: string;
  runsSummary: string;
  mealsSummary: string;
  totalDaysInRange: number;
  daysWithMealsLogged: number;
}): Promise<TrainingSummary> {
  const coveragePct =
    input.totalDaysInRange > 0 ? Math.round((input.daysWithMealsLogged / input.totalDaysInRange) * 100) : 0;
  const coverageNote =
    coveragePct < 50
      ? `Meal logging coverage this period is low (${input.daysWithMealsLogged}/${input.totalDaysInRange} days, ` +
        `${coveragePct}%). This reflects logging habits, not necessarily actual eating — never assume unlogged ` +
        `days mean the athlete didn't eat. If it feels natural, gently and supportively encourage more consistent ` +
        `logging (one soft mention at most, not preachy); otherwise don't dwell on it.`
      : `Meal logging coverage this period is good (${input.daysWithMealsLogged}/${input.totalDaysInRange} days, ` +
        `${coveragePct}%) — no need to comment on logging consistency.`;

  return parseWithTool<TrainingSummary>({
    system:
      "You are a marathon training coach writing a periodic review for an athlete training for a 3:30:00 marathon " +
      "(goal pace 8:01/mi). Review their logged workouts, runs, and meals for the period and write an encouraging, " +
      "specific, non-generic summary grounded in the actual numbers provided — avoid vague platitudes.\n\n" +
      todayContext(),
    userText:
      `Reviewing ${input.rangeLabel}.\n\n` +
      `Workouts logged:\n${input.workoutsSummary || "None logged."}\n\n` +
      `Runs logged:\n${input.runsSummary || "None logged."}\n\n` +
      `Meals logged:\n${input.mealsSummary || "None logged."}\n\n` +
      coverageNote,
    toolName: "record_training_summary",
    toolDescription: "Records a structured periodic coaching summary.",
    inputSchema: summarySchema,
  });
}
