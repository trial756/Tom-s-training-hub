import { daysBetweenKeys, localDateKey, normalizeExerciseName } from "@/lib/format";
import { COMPOUND, isLowerBody, patternOf, type Pattern } from "@/lib/planner/patterns";

// ── Progression ──────────────────────────────────────────────────────
//
// Every lift's trend, computed from the logs rather than guessed by the
// model: an estimated one-rep max per session (Epley, from the best set),
// a status, and the next prescription by fixed rules.

export type LiftStatus = "building" | "progressing" | "stalled" | "regressing";
export type Role = "heavy" | "volume" | "isolation";

export const ROLE_RANGE: Record<Role, [number, number]> = {
  heavy: [5, 6],
  volume: [8, 10],
  isolation: [10, 15],
};

export interface LiftSession {
  date: string;
  topWeight: number;
  repsAtTop: number;
  /** The set behind the estimate, for display ("135x10"). */
  bestSet: string;
  e1rm: number;
}

export interface LiftTrend {
  key: string;
  name: string;
  pattern: Pattern;
  sessions: LiftSession[]; // oldest first
  status: LiftStatus;
  best: LiftSession | null;
  last: LiftSession | null;
  daysSinceBest: number | null;
  /** One line for the planner: "150x5 best (Oct 6) · last 140x5 · stalled 4 sessions". */
  summary: string;
}

/** Epley estimate, trusted for 1–15 reps. */
export const e1rm = (weight: number, reps: number) => weight * (1 + reps / 30);

interface SourceWorkout {
  logged_at: string;
  exercises?: { name?: string | null; sets?: { reps?: number | null; weight?: number | null }[] | null }[] | null;
}

const STALL_SESSIONS = 3;
const STALL_DAYS = 21;

export function liftTrends(workouts: SourceWorkout[], today: Date = new Date()): Map<string, LiftTrend> {
  const todayKey = localDateKey(today);
  const byKey = new Map<string, { names: Map<string, number>; days: Map<string, LiftSession> }>();

  for (const w of workouts) {
    const date = localDateKey(new Date(w.logged_at));
    for (const ex of w.exercises ?? []) {
      const name = ex?.name ?? "";
      const key = normalizeExerciseName(name);
      if (!key) continue;
      const sets = (ex?.sets ?? [])
        .map((s) => ({ reps: Number(s?.reps) || 0, weight: Number(s?.weight) || 0 }))
        .filter((s) => s.weight > 0 && s.reps >= 1 && s.reps <= 15);
      if (!sets.length) continue;
      const best = sets.reduce((a, b) => (e1rm(b.weight, b.reps) > e1rm(a.weight, a.reps) ? b : a));
      const topWeight = Math.max(...sets.map((s) => s.weight));
      const repsAtTop = Math.max(...sets.filter((s) => s.weight === topWeight).map((s) => s.reps));
      const entry = byKey.get(key) ?? { names: new Map(), days: new Map() };
      entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
      const session = { date, topWeight, repsAtTop, bestSet: `${best.weight}x${best.reps}`, e1rm: Math.round(e1rm(best.weight, best.reps)) };
      const prior = entry.days.get(date);
      if (!prior || session.e1rm > prior.e1rm) entry.days.set(date, session);
      byKey.set(key, entry);
    }
  }

  const out = new Map<string, LiftTrend>();
  for (const [key, { names, days }] of byKey) {
    const sessions = Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
    const name = Array.from(names.entries()).sort((a, b) => b[1] - a[1])[0][0];
    const best = sessions.reduce<LiftSession | null>((a, b) => (!a || b.e1rm >= a.e1rm ? b : a), null);
    const last = sessions[sessions.length - 1] ?? null;
    const sinceBest = best ? sessions.filter((s) => s.date > best.date).length : 0;
    const daysSinceBest = best ? daysBetweenKeys(best.date, todayKey) : null;

    let status: LiftStatus = "building";
    if (sessions.length >= 3 && best && last) {
      const recent = sessions.slice(-2);
      if (recent.every((s) => s.e1rm < best.e1rm * 0.94) && sinceBest >= 2) status = "regressing";
      else if (sinceBest >= STALL_SESSIONS && (daysSinceBest ?? 0) >= STALL_DAYS) status = "stalled";
      else status = "progressing";
    }

    const fmt = (s: LiftSession) => s.bestSet;
    const shortDate = (k: string) =>
      new Date(`${k}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const summary = best && last
      ? `best ${fmt(best)} (${shortDate(best.date)}) · last ${fmt(last)} (${shortDate(last.date)}) · ${status}` +
        (status === "stalled" || status === "regressing" ? ` — ${sinceBest} sessions since best` : "")
      : "no loaded sets";
    out.set(key, { key, name, pattern: patternOf(name), sessions, status, best, last, daysSinceBest, summary });
  }
  return out;
}

const roundLoad = (w: number) => (w < 40 ? Math.round(w / 2.5) * 2.5 : Math.round(w / 5) * 5);

export interface Prescription {
  role: Role;
  reps: string;
  target: number;
  /** Why this weight, in a few words — shown under the exercise. */
  basis: string;
}

/**
 * The next prescription for a lift with history. Double progression inside a
 * rep range: top of the range on the top set → add weight; inside it → same
 * weight, one more rep; below it → back off. A stalled heavy lift switches to
 * a lighter 8–10 block; a regressing one holds. `fatigued` (a big mileage
 * jump) freezes increments on leg lifts.
 */
export function prescribe(trend: LiftTrend, role: Role, opts: { fatigued?: boolean; hold?: boolean } = {}): Prescription | null {
  const last = trend.last;
  if (!last) return null;
  let useRole = role;
  let basis: string;
  const lower = isLowerBody(trend.pattern);
  const inc = lower ? 10 : 5;

  if (trend.status === "stalled" && role === "heavy" && trend.best) {
    useRole = "volume";
    const [, hi] = ROLE_RANGE.volume;
    const target = roundLoad((trend.best.e1rm / (1 + hi / 30)) * 0.95);
    return { role: useRole, reps: "8-10", target, basis: `stalled since ${trend.best.bestSet} — lighter 8–10 block to break it` };
  }

  const [lo, hi] = ROLE_RANGE[useRole];
  const sameZone = last.repsAtTop >= lo - 1 && last.repsAtTop <= hi + 3;
  let target: number;
  if (sameZone) {
    if (last.repsAtTop >= hi && trend.status !== "regressing" && !(opts.fatigued && lower) && !opts.hold) {
      target = last.topWeight + inc;
      basis = `hit ${last.topWeight}x${last.repsAtTop} — add ${inc} lb`;
    } else if (last.repsAtTop >= lo) {
      target = last.topWeight;
      basis = trend.status === "regressing" ? `holding ${last.topWeight} while it recovers` : `${last.topWeight}x${last.repsAtTop} last — same weight, one more rep`;
    } else {
      target = last.topWeight - inc;
      basis = `${last.topWeight}x${last.repsAtTop} fell short — back off ${inc} lb`;
    }
  } else {
    // Different rep zone than last time: convert through the best recent
    // estimated max (one down day shouldn't set the weight), less 5%.
    const recent = trend.sessions.slice(-3).reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    target = (recent.e1rm * 0.95) / (1 + (hi + 1) / 30);
    basis = `from ${recent.bestSet} (est. max ${recent.e1rm})`;
  }
  return { role: useRole, reps: `${lo}-${hi}`, target: roundLoad(Math.max(target, 0)), basis };
}

/** Role implied by planned reps: ≤6 heavy, ≤12 volume, above that isolation. */
export function roleFromReps(reps: string, pattern: Pattern): Role | null {
  const nums = (reps.match(/\d+/g) ?? []).map(Number);
  if (!nums.length || /s\b|sec|min/i.test(reps)) return null;
  const top = Math.max(...nums);
  if (top <= 6) return COMPOUND.has(pattern) ? "heavy" : "volume";
  if (top <= 12) return "volume";
  return "isolation";
}
