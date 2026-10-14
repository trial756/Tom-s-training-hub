import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ParsedWorkout } from "@/lib/anthropic";
import { APP_TIMEZONE, normalizeExerciseName } from "@/lib/format";
import { cleanRegions } from "@/lib/muscles";
import type { Exercise, ExerciseSet } from "@/lib/types";

/**
 * Files any exercise the parser hasn't seen before into the exercise →
 * muscle lookup. First tagging wins: existing rows (including hand-seeded
 * and hand-corrected ones) are never overwritten, so fixing a bad tag is a
 * one-row edit that applies to every session using that movement.
 *
 * Failures are swallowed — this is secondary bookkeeping and must never
 * fail a workout that already saved.
 */
export async function recordExerciseMuscles(parsed: ParsedWorkout) {
  try {
    const byKey = new Map<string, { key: string; display_name: string; primary_muscles: string[]; secondary_muscles: string[]; source: string }>();
    for (const ex of parsed.exercises ?? []) {
      const key = normalizeExerciseName(ex.name ?? "");
      if (!key || byKey.has(key)) continue;
      const primary = cleanRegions(ex.primary_muscles);
      const secondary = cleanRegions(ex.secondary_muscles).filter((r) => !primary.includes(r));
      if (primary.length === 0 && secondary.length === 0) continue;
      byKey.set(key, { key, display_name: ex.name, primary_muscles: primary, secondary_muscles: secondary, source: "ai" });
    }
    if (byKey.size === 0) return;
    await supabaseAdmin()
      .from("exercise_muscles")
      .upsert(Array.from(byKey.values()), { onConflict: "key", ignoreDuplicates: true });
  } catch {
    // Non-critical.
  }
}

function summarizeExercises(exercises: Exercise[]): string {
  return (exercises ?? [])
    .map((e) => `${e.name}: ${(e.sets ?? []).map((s) => `${s.weight ?? "?"}${s.weight_unit ?? ""}x${s.reps ?? "?"}`).join(",")}`)
    .join(" | ");
}

export async function buildWorkoutHistoryContext(): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("workouts")
    .select("logged_at, exercises, muscle_groups")
    .order("logged_at", { ascending: false })
    .limit(10);

  return (data ?? [])
    .map((w) => {
      const date = new Date(w.logged_at).toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric", year: "numeric" });
      const groups = (w.muscle_groups ?? []).length ? ` [${(w.muscle_groups ?? []).join(", ")}]` : "";
      return `${date}${groups} — ${summarizeExercises(w.exercises ?? [])}`;
    })
    .join("\n");
}

/**
 * Exercises as edited by hand → the stored shape. Blank names and empty sets
 * are dropped; numbers are read leniently, like the run form.
 */
export function sanitizeExercises(raw: unknown): Exercise[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(",", ".").match(/-?\d+(\.\d+)?/)?.[0]);
    return Number.isFinite(n) ? n : null;
  };
  return raw
    .map((e) => {
      const ex = (e ?? {}) as { name?: unknown; sets?: unknown };
      const name = typeof ex.name === "string" ? ex.name.trim() : "";
      const sets: ExerciseSet[] = (Array.isArray(ex.sets) ? ex.sets : [])
        .map((s) => {
          const set = (s ?? {}) as { reps?: unknown; weight?: unknown; weight_unit?: unknown };
          return {
            reps: num(set.reps),
            weight: num(set.weight),
            weight_unit: typeof set.weight_unit === "string" && set.weight_unit.trim() ? set.weight_unit.trim() : null,
          };
        })
        .filter((s) => s.reps != null || s.weight != null);
      return { name, sets };
    })
    .filter((e) => e.name);
}
