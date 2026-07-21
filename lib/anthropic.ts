import Anthropic from "@anthropic-ai/sdk";

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

// ── Workouts ────────────────────────────────────────────────────────────

export interface ParsedWorkout {
  exercises: {
    name: string;
    sets: { reps: number | null; weight: number | null; weight_unit: string | null }[];
  }[];
  duration_minutes: number | null;
  notes: string;
  coaching_feedback: string;
}

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
    coaching_feedback: {
      type: "string",
      description:
        "2-4 sentences of specific, encouraging coaching feedback on this workout: volume, intensity, balance, and one concrete suggestion for next time.",
    },
  },
  required: ["exercises", "duration_minutes", "notes", "coaching_feedback"],
  additionalProperties: false,
};

export async function parseWorkoutEntry(text: string): Promise<ParsedWorkout> {
  return parseWithTool<ParsedWorkout>({
    system:
      "You are a strength-training coach parsing a natural-language workout log into structured data. " +
      "Extract every exercise, set, rep count, and weight mentioned. If units are ambiguous, assume lb. " +
      "If a value isn't mentioned, use null rather than guessing. Then give brief, specific coaching feedback.",
    userText: text,
    toolName: "record_workout",
    toolDescription: "Records a structured, parsed weightlifting/strength workout with coaching feedback.",
    inputSchema: workoutSchema,
  });
}

// ── Runs ────────────────────────────────────────────────────────────────

export interface ParsedRun {
  distance_miles: number | null;
  duration_seconds: number | null;
  pace_seconds_per_mile: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  run_type: string;
  notes: string;
  coaching_feedback: string;
}

const runSchema = {
  type: "object",
  properties: {
    distance_miles: { type: ["number", "null"] },
    duration_seconds: { type: ["integer", "null"], description: "Total run duration in seconds." },
    pace_seconds_per_mile: {
      type: ["integer", "null"],
      description: "Average pace in seconds per mile. Compute from distance/duration if both are known and pace isn't stated directly.",
    },
    avg_hr: { type: ["integer", "null"] },
    max_hr: { type: ["integer", "null"] },
    run_type: {
      type: "string",
      enum: ["easy", "tempo", "long", "interval", "race", "recovery", "other"],
    },
    notes: { type: "string", description: "Route, weather, how it felt, anything noteworthy." },
    coaching_feedback: {
      type: "string",
      description:
        "2-4 sentences of specific, encouraging coaching feedback on this run relative to marathon training: pace discipline, effort, recovery, and one concrete suggestion.",
    },
  },
  required: [
    "distance_miles",
    "duration_seconds",
    "pace_seconds_per_mile",
    "avg_hr",
    "max_hr",
    "run_type",
    "notes",
    "coaching_feedback",
  ],
  additionalProperties: false,
};

export async function parseRunEntry(text: string): Promise<ParsedRun> {
  return parseWithTool<ParsedRun>({
    system:
      "You are a marathon running coach parsing a natural-language run log into structured data. " +
      "Extract distance, duration, pace, and heart rate. Compute pace from distance and duration when it isn't stated " +
      "directly. Classify the run type. If a value isn't mentioned or inferable, use null. Then give brief, specific " +
      "coaching feedback in the context of marathon training (goal: 3:30 marathon, ~8:01/mi race pace).",
    userText: text,
    toolName: "record_run",
    toolDescription: "Records a structured, parsed run with coaching feedback.",
    inputSchema: runSchema,
  });
}

// ── Meals ───────────────────────────────────────────────────────────────

export interface ParsedMeal {
  meal_type: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  items: string[];
  notes: string;
  coaching_feedback: string;
}

const mealSchema = {
  type: "object",
  properties: {
    meal_type: {
      type: "string",
      enum: ["breakfast", "lunch", "dinner", "snack"],
    },
    calories: { type: ["integer", "null"], description: "Best estimate of total calories." },
    protein_g: { type: ["number", "null"] },
    carbs_g: { type: ["number", "null"] },
    fat_g: { type: ["number", "null"] },
    items: {
      type: "array",
      items: { type: "string" },
      description: "Individual food items mentioned, normalized to short names.",
    },
    notes: { type: "string" },
    coaching_feedback: {
      type: "string",
      description:
        "1-3 sentences of practical fueling feedback for a marathon-training runner: macro balance, timing relative to training, and one concrete suggestion.",
    },
  },
  required: ["meal_type", "calories", "protein_g", "carbs_g", "fat_g", "items", "notes", "coaching_feedback"],
  additionalProperties: false,
};

export async function parseMealEntry(text: string): Promise<ParsedMeal> {
  return parseWithTool<ParsedMeal>({
    system:
      "You are a sports nutritionist parsing a natural-language meal log into structured data for a runner training " +
      "for a marathon. Extract or estimate calories and macros from the food items described — use reasonable " +
      "nutritional estimates for common foods and typical portion sizes when exact amounts aren't given. Then give " +
      "brief, practical fueling feedback.",
    userText: text,
    toolName: "record_meal",
    toolDescription: "Records a structured, parsed meal with estimated macros and coaching feedback.",
    inputSchema: mealSchema,
  });
}
