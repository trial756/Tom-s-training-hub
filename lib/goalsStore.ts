import { supabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_GOALS, type Goal } from "@/lib/goals";

const normalize = (g: Record<string, unknown>): Goal =>
  ({
    ...g,
    // Postgres numerics arrive as strings; dates as YYYY-MM-DD.
    date: String(g.date).slice(0, 10),
    distance_mi: g.distance_mi == null ? null : Number(g.distance_mi),
    target_seconds: g.target_seconds == null ? null : Number(g.target_seconds),
  }) as Goal;

/**
 * The athlete's goals from the `goals` table. Falls back to DEFAULT_GOALS if
 * the table can't be read, or (for planning) is empty, so planning never
 * stops for lack of a goal. `all` returns every row as stored, for editing.
 */
export async function loadGoals(opts: { all?: boolean } = {}): Promise<Goal[]> {
  try {
    const { data, error } = await supabaseAdmin().from("goals").select("*").order("date");
    if (error) return DEFAULT_GOALS;
    if (!data?.length) return opts.all ? [] : DEFAULT_GOALS;
    return data.map(normalize);
  } catch {
    return DEFAULT_GOALS;
  }
}

const FOCUS = ["athleticism", "strength", "hypertrophy", "endurance", "general"];

/** A goal from the form, checked and trimmed to the table's columns. */
export function sanitizeGoal(
  body: Record<string, unknown>,
  opts: { partial?: boolean } = {}
): { goal: Partial<Goal> } | { error: string } {
  const out: Partial<Goal> = {};
  const has = (k: string) => body[k] !== undefined;
  if (has("kind") || !opts.partial) {
    if (body.kind !== "race" && body.kind !== "focus") return { error: "A goal is a race or a focus." };
    out.kind = body.kind;
  }
  if (has("title") || !opts.partial) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t) return { error: "Give the goal a name." };
    out.title = t.slice(0, 80);
  }
  if (has("date") || !opts.partial) {
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return { error: "Pick a date." };
    out.date = body.date;
  }
  if (has("priority")) {
    if (!["A", "B", "C"].includes(String(body.priority))) return { error: "Priority is A, B or C." };
    out.priority = body.priority as Goal["priority"];
  }
  const num = (v: unknown) => (v === null || v === "" ? null : Number(v));
  if (has("distance_mi")) {
    const d = num(body.distance_mi);
    if (d !== null && !(d > 0 && d < 200)) return { error: "Distance looks off." };
    out.distance_mi = d;
  }
  if (has("target_seconds")) {
    const t = num(body.target_seconds);
    if (t !== null && !(t > 0)) return { error: "Target time looks off." };
    out.target_seconds = t === null ? null : Math.round(t);
  }
  if (has("focus")) {
    if (body.focus !== null && !FOCUS.includes(String(body.focus))) return { error: "Unknown focus." };
    out.focus = body.focus as Goal["focus"];
  }
  if (has("notes")) out.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;
  if (has("status")) {
    if (!["active", "done", "dropped"].includes(String(body.status))) return { error: "Unknown status." };
    out.status = body.status as Goal["status"];
  }
  return { goal: out };
}
