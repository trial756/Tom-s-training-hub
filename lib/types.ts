export interface ExerciseSet {
  reps: number | null;
  weight: number | null;
  weight_unit: string | null;
}

export interface Exercise {
  name: string;
  sets: ExerciseSet[];
}

export interface Workout {
  id: string;
  created_at: string;
  logged_at: string;
  raw_text: string;
  exercises: Exercise[];
  duration_minutes: number | null;
  notes: string | null;
  coaching_feedback: string | null;
  vs_last_time: string | null;
  adjustments: string[];
}

export const RUN_TYPES = ["Easy", "Long", "Tempo", "Marathon Pace", "Interval", "Race", "Other"] as const;
export type RunType = (typeof RUN_TYPES)[number];

export interface Run {
  id: string;
  created_at: string;
  logged_at: string;
  raw_text: string;
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
  run_type: string | null;
  notes: string | null;
  coaching_feedback: string | null;
  vs_last_time: string | null;
  adjustments: string[];
}

export interface Meal {
  id: string;
  created_at: string;
  logged_at: string;
  raw_text: string;
  meal_type: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  items: string[];
  notes: string | null;
  coaching_feedback: string | null;
}

export type FavoriteType = "workout" | "run" | "meal";

export interface Favorite {
  id: string;
  created_at: string;
  type: FavoriteType;
  name: string;
  raw_text: string;
  data: Record<string, unknown>;
}
