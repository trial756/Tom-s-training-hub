import type { IntervalSegment, IntervalSet, RunIntervals } from "@/lib/types";
import { formatDuration, formatPace } from "@/lib/format";

const METERS_PER_MILE = 1609.344;

export function emptyIntervalSet(): IntervalSet {
  return { reps: null, distance_value: null, distance_unit: "m", rep_seconds: null, recovery_seconds: null };
}

export function emptyIntervals(): RunIntervals {
  return {
    mode: "quick",
    warmup: null,
    cooldown: null,
    work_pace_seconds_per_mile: null,
    recovery_pace_seconds_per_mile: null,
    sets: [emptyIntervalSet()],
  };
}

/** Distance of a single rep in miles, whatever unit it was entered in. */
export function setRepMiles(set: IntervalSet): number | null {
  if (set.distance_value == null || set.distance_value <= 0) return null;
  return set.distance_unit === "m" ? set.distance_value / METERS_PER_MILE : set.distance_value;
}

/** Pace per mile for a single rep, derived from its distance and time. */
export function setRepPaceSeconds(set: IntervalSet): number | null {
  const miles = setRepMiles(set);
  if (!miles || set.rep_seconds == null || set.rep_seconds <= 0) return null;
  return Math.round(set.rep_seconds / miles);
}

/** Total working mileage across all sets (reps × rep distance), excluding warmup/cooldown. */
export function workingMiles(intervals: RunIntervals): number {
  return intervals.sets.reduce((sum, set) => {
    const miles = setRepMiles(set);
    if (!miles || !set.reps) return sum;
    return sum + miles * set.reps;
  }, 0);
}

function hasSegmentData(seg: IntervalSegment | null): seg is IntervalSegment {
  return !!seg && (seg.distance_miles != null || seg.pace_seconds_per_mile != null);
}

function hasSetData(set: IntervalSet): boolean {
  return set.reps != null || set.distance_value != null || set.rep_seconds != null || set.recovery_seconds != null;
}

/** True when the athlete actually entered something worth saving. */
export function hasIntervalData(intervals: RunIntervals | null): boolean {
  if (!intervals) return false;
  if (hasSegmentData(intervals.warmup) || hasSegmentData(intervals.cooldown)) return true;
  if (intervals.mode === "quick") {
    return intervals.work_pace_seconds_per_mile != null || intervals.recovery_pace_seconds_per_mile != null;
  }
  return intervals.sets.some(hasSetData);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sanitizeSegment(raw: unknown): IntervalSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const seg: IntervalSegment = {
    distance_miles: toNum(r.distance_miles),
    pace_seconds_per_mile: toNum(r.pace_seconds_per_mile),
  };
  return hasSegmentData(seg) ? seg : null;
}

/**
 * Normalizes whatever the client posted into a trustworthy shape, dropping
 * empty sets. Returns null when nothing meaningful was entered, so
 * non-interval runs simply store null.
 */
export function sanitizeIntervals(raw: unknown): RunIntervals | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const sets: IntervalSet[] = Array.isArray(r.sets)
    ? (r.sets as unknown[])
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return {
            reps: toNum(o.reps),
            distance_value: toNum(o.distance_value),
            distance_unit: o.distance_unit === "mi" ? "mi" : "m",
            rep_seconds: toNum(o.rep_seconds),
            recovery_seconds: toNum(o.recovery_seconds),
          } as IntervalSet;
        })
        .filter(hasSetData)
    : [];

  const intervals: RunIntervals = {
    mode: r.mode === "detailed" ? "detailed" : "quick",
    warmup: sanitizeSegment(r.warmup),
    cooldown: sanitizeSegment(r.cooldown),
    work_pace_seconds_per_mile: toNum(r.work_pace_seconds_per_mile),
    recovery_pace_seconds_per_mile: toNum(r.recovery_pace_seconds_per_mile),
    sets,
  };

  return hasIntervalData(intervals) ? intervals : null;
}

function describeSegment(label: string, seg: IntervalSegment | null): string | null {
  if (!hasSegmentData(seg)) return null;
  const bits: string[] = [];
  if (seg.distance_miles != null) bits.push(`${seg.distance_miles}mi`);
  if (seg.pace_seconds_per_mile != null) bits.push(`@ ${formatPace(seg.pace_seconds_per_mile)}`);
  return `${label} ${bits.join(" ")}`;
}

/** One-line human summary of a set, e.g. "6 × 800m in 3:05 (6:12/mi), 2:00 recovery". */
export function describeSet(set: IntervalSet): string {
  const bits: string[] = [];
  const distance = set.distance_value != null ? `${set.distance_value}${set.distance_unit}` : "reps";
  bits.push(set.reps != null ? `${set.reps} × ${distance}` : distance);
  if (set.rep_seconds != null) {
    const pace = setRepPaceSeconds(set);
    bits.push(`in ${formatDuration(set.rep_seconds)}${pace ? ` (${formatPace(pace)})` : ""}`);
  }
  if (set.recovery_seconds != null) bits.push(`w/ ${formatDuration(set.recovery_seconds)} recovery`);
  return bits.join(" ");
}

/**
 * Human-readable breakdown of the whole session — used both in the UI and
 * in the coaching prompt, so the model sees the actual splits rather than
 * just a flat average pace.
 */
export function describeIntervals(intervals: RunIntervals | null): string {
  if (!hasIntervalData(intervals) || !intervals) return "";
  const parts: string[] = [];

  const warmup = describeSegment("Warmup", intervals.warmup);
  if (warmup) parts.push(warmup);

  if (intervals.mode === "quick") {
    if (intervals.work_pace_seconds_per_mile != null) {
      parts.push(`Work pace ${formatPace(intervals.work_pace_seconds_per_mile)}`);
    }
    if (intervals.recovery_pace_seconds_per_mile != null) {
      parts.push(`Recovery pace ${formatPace(intervals.recovery_pace_seconds_per_mile)}`);
    }
  } else {
    for (const set of intervals.sets) parts.push(describeSet(set));
  }

  const cooldown = describeSegment("Cooldown", intervals.cooldown);
  if (cooldown) parts.push(cooldown);

  return parts.join("; ");
}
