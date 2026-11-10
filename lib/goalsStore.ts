import { supabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_GOALS, type Goal } from "@/lib/goals";

/**
 * The athlete's goals from the `goals` table. Falls back to DEFAULT_GOALS if
 * the table is empty or can't be read, so planning never stops for lack of
 * a goal.
 */
export async function loadGoals(): Promise<Goal[]> {
  try {
    const { data, error } = await supabaseAdmin().from("goals").select("*").order("date");
    if (error || !data?.length) return DEFAULT_GOALS;
    // Postgres numerics arrive as strings; dates as YYYY-MM-DD.
    return data.map((g) => ({
      ...g,
      date: String(g.date).slice(0, 10),
      distance_mi: g.distance_mi == null ? null : Number(g.distance_mi),
      target_seconds: g.target_seconds == null ? null : Number(g.target_seconds),
    })) as Goal[];
  } catch {
    return DEFAULT_GOALS;
  }
}
