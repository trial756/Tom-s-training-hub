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
}

export interface RunCoachingResult {
  coaching_feedback: string;
  calories: number | null;
}

const runCoachingSchema = {
  type: "object",
  properties: {
    coaching_feedback: {
      type: "string",
      description:
        "2-4 sentences of specific, encouraging coaching feedback on this run relative to marathon training " +
        "(goal: 3:30 marathon, ~8:01/mi race pace). Reference the specific numbers given — pace discipline, " +
        "effort relative to conditions/terrain/elevation, and one concrete suggestion for next time.",
    },
    estimated_calories: {
      type: ["integer", "null"],
      description:
        "Only populate if the athlete did not already provide a calorie count — estimate from distance, pace, " +
        "and typical running energy expenditure. If a calorie count was already provided, return null here.",
    },
  },
  required: ["coaching_feedback", "estimated_calories"],
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
  if (run.notes) parts.push(`Notes: ${run.notes}`);
  return parts.join("\n");
}

export async function generateRunCoaching(run: StructuredRunInput): Promise<RunCoachingResult> {
  const result = await parseWithTool<{ coaching_feedback: string; estimated_calories: number | null }>({
    system:
      "You are a marathon running coach. The athlete logged a run using precise structured fields from their " +
      "watch/app — everything below is already extracted, there is nothing left to parse. Give brief, specific " +
      "coaching feedback grounded in the exact numbers provided.",
    userText: describeRun(run),
    toolName: "record_run_coaching",
    toolDescription: "Records coaching feedback (and an optional calorie estimate) for an already-structured run.",
    inputSchema: runCoachingSchema,
  });
  return {
    coaching_feedback: result.coaching_feedback,
    calories: run.calories ?? result.estimated_calories ?? null,
  };
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
