import type { PlanDay, PlanSession } from "@/lib/planner/types";

/**
 * How far above recent actual weekly mileage a single week is allowed to
 * reach.
 *
 * Deliberately loose. The athlete has committed to an aggressive nine-week
 * build toward a fixed race date, and the week targets in marathonPlan.ts
 * were rewritten to encode that ramp directly (including a cutback week).
 * A tight ~10% ceiling here would silently veto that plan every week, so
 * this is set to catch only absurdity — a jump from 12 to 33 in one week —
 * while letting the planned progression through. It rises on its own as
 * actual volume rises.
 */
const PROGRESSION_CEILING = 1.5;
/** Below this, a shortfall isn't worth restructuring the week over. */
const MIN_GAP_MILES = 2;
/** An added easy run won't be longer than this. */
const MAX_ADDED_RUN_MILES = 8;

export interface MileageOutcome {
  /** Miles still to run this week after what's already planned. */
  gap: number;
  /** Miles the reconciler actually added. */
  added: number;
  /** Shortfall left on the table because closing it would be an unsafe jump. */
  residual: number;
  note: string | null;
  sessions: PlanSession[];
  days: PlanDay[];
}

function isRun(session: PlanSession): boolean {
  return session.kind === "run" || session.kind === "lift_and_run";
}

/**
 * Keeps the week honest about mileage. If what's still planned falls short
 * of the weekly target, extends the easy runs already scheduled and then
 * adds a run onto a rest or recovery day — so falling behind results in the
 * miles reappearing somewhere, not quietly vanishing.
 */
export function reconcileMileage(opts: {
  sessions: PlanSession[];
  days: PlanDay[];
  today: string;
  milesThisWeek: number;
  weeklyTarget: number | null;
  avgWeeklyMiles: number;
  typicalRunMiles: number;
}): MileageOutcome {
  const { days, today, milesThisWeek, weeklyTarget, avgWeeklyMiles, typicalRunMiles } = opts;
  // Stored weeks could already hold duplicate ids (see the reuse below);
  // keep the first so a duplicate can't be scheduled onto a second day.
  const seen = new Set<string>();
  const sessions = opts.sessions.filter((s) => !seen.has(s.id) && !!seen.add(s.id)).map((s) => ({ ...s }));
  const byId = new Map(sessions.map((s) => [s.id, s]));

  if (!weeklyTarget || weeklyTarget <= 0) {
    return { gap: 0, added: 0, residual: 0, note: null, sessions, days };
  }

  const upcoming = days.filter((d) => d.date >= today && d.status !== "done");
  const plannedRemaining = upcoming.reduce((sum, d) => {
    const s = d.sessionId ? byId.get(d.sessionId) : undefined;
    return sum + (s && isRun(s) ? s.miles ?? 0 : 0);
  }, 0);

  // What this week can safely reach, which may be well under the block's ask.
  const safeCeiling = Math.max(milesThisWeek + plannedRemaining, Math.round(avgWeeklyMiles * PROGRESSION_CEILING));
  const weekTarget = Math.min(weeklyTarget, safeCeiling);

  const gap = Math.round((weekTarget - milesThisWeek - plannedRemaining) * 10) / 10;
  const residual = Math.round((weeklyTarget - weekTarget) * 10) / 10;

  if (gap < MIN_GAP_MILES) {
    return {
      gap: Math.max(0, gap),
      added: 0,
      residual,
      note:
        residual >= MIN_GAP_MILES
          ? `Plan asks ${weeklyTarget}mi this week. Your recent average is ${avgWeeklyMiles}mi, so this week tops out near ${weekTarget}mi — building past that safely takes a few weeks, not one.`
          : null,
      sessions,
      days,
    };
  }

  let remaining = gap;
  let added = 0;
  const runSize = Math.min(MAX_ADDED_RUN_MILES, Math.max(2, Math.round(typicalRunMiles)));

  // 1. Lengthen easy runs already on the board before inventing new ones.
  for (const day of upcoming) {
    if (remaining < MIN_GAP_MILES) break;
    const session = day.sessionId ? byId.get(day.sessionId) : undefined;
    if (!session || !isRun(session) || session.taxesLegs) continue;
    const bump = Math.min(remaining, Math.max(1, Math.round((session.miles ?? runSize) * 0.5)));
    session.miles = Math.round(((session.miles ?? 0) + bump) * 10) / 10;
    session.title = `${session.title.replace(/\s*\d+(\.\d+)?mi\b/, "")} ${session.miles}mi`.replace(/\s+/g, " ").trim();
    // A written breakdown would no longer add up; the extra is easy running.
    if (session.run?.structure) session.run = { ...session.run, structure: `${session.run.structure} · +${bump} mi easy` };
    session.addedByReconciler = true;
    remaining = Math.round((remaining - bump) * 10) / 10;
    added += bump;
  }

  // 2. Then put a run on a day that isn't already doing real work.
  for (const day of upcoming) {
    if (remaining < MIN_GAP_MILES) break;
    const session = day.sessionId ? byId.get(day.sessionId) : undefined;
    if (session && session.kind !== "rest" && session.kind !== "active_recovery") continue;
    const miles = Math.min(remaining, runSize);
    const id = `add-${day.date}`;
    // The run joins whatever light work the day already had ("Easy 4mi +
    // Mobility + core") instead of pushing it to a day of its own — easy runs
    // and mobility share a day so the other days stay free.
    const carried = session && session.kind === "active_recovery" && session.id !== id ? session : undefined;
    if (carried) {
      const at = sessions.findIndex((s) => s.id === carried.id);
      if (at >= 0) sessions.splice(at, 1);
      byId.delete(carried.id);
    }
    // A run added for this date on an earlier load may have been moved
    // elsewhere by the scheduler. Reuse it: pushing a second session with the
    // same id is how a week grew five copies of one catch-up run.
    const prior = sessions.findIndex((s) => s.id === id);
    if (prior >= 0) sessions.splice(prior, 1);
    const addition: PlanSession = {
      id,
      kind: "run",
      title: `Easy ${Math.round(miles * 10) / 10}mi${carried ? ` + ${carried.title}` : ""}`,
      rationale: `Added to close this week's mileage — ${Math.round((weekTarget - milesThisWeek) * 10) / 10}mi still to run.`,
      regions: carried?.regions ?? [],
      exercises: carried?.exercises ?? [],
      priority: 4,
      preferredDow: null,
      taxesLegs: false,
      miles: Math.round(miles * 10) / 10,
      run: { type: "Easy", structure: null },
      addedByReconciler: true,
    };
    sessions.push(addition);
    byId.set(addition.id, addition);
    day.sessionId = addition.id;
    remaining = Math.round((remaining - miles) * 10) / 10;
    added += miles;
  }

  added = Math.round(added * 10) / 10;
  const parts: string[] = [];
  if (added > 0) parts.push(`Behind on mileage — added ${added}mi to the days ahead.`);
  if (residual >= MIN_GAP_MILES) {
    parts.push(
      `Plan asks ${weeklyTarget}mi; your recent average is ${avgWeeklyMiles}mi, so this week tops out near ${weekTarget}mi.`
    );
  }

  return { gap, added, residual, note: parts.join(" ") || null, sessions, days };
}

/** A freshly generated week may run this far over its mileage target before easy runs are trimmed. */
const OVERSHOOT_ALLOWANCE = 1.15;
/** An easy run is never trimmed below this — shorter isn't worth lacing up for. */
const MIN_EASY_RUN_MILES = 2;

const isLongRun = (s: PlanSession) =>
  isRun(s) && (s.run?.type === "Long" || (!s.run?.type && /\blong\b/i.test(s.title)));

/** Rewrites the first distance in a title to match the planned miles ("Long run — 18mi…" planned at 16 → "16mi"). */
function syncTitleMiles(s: PlanSession) {
  if (!s.miles) return;
  s.title = s.title.replace(/(\d+(?:\.\d+)?)(\s?mi\b)/i, (match, n, unit) => (Number(n) === s.miles ? match : `${s.miles}${unit}`));
}

/**
 * Holds a freshly generated week to its marathon targets, in code rather than
 * trusting the model's arithmetic: the long run is the block's long-run
 * distance, every title states the miles actually planned, and if the week
 * would land well over its mileage target the easy runs give way first —
 * never the long run or the quality sessions.
 */
export function fitWeekToTargets(
  input: PlanSession[],
  opts: { weeklyTarget: number | null; longRunMiles: number | null; milesAlreadyRun: number }
): { sessions: PlanSession[]; note: string | null } {
  const sessions = input.map((s) => ({ ...s }));
  const notes: string[] = [];

  const long = sessions.find(isLongRun);
  if (long && opts.longRunMiles && long.miles !== opts.longRunMiles) {
    notes.push(`long run set to the block's ${opts.longRunMiles}mi (was ${long.miles ?? "?"})`);
    long.miles = opts.longRunMiles;
  }

  if (opts.weeklyTarget && opts.weeklyTarget > 0) {
    const ceiling = Math.round(opts.weeklyTarget * OVERSHOOT_ALLOWANCE * 10) / 10;
    const total = () => opts.milesAlreadyRun + sessions.reduce((sum, s) => sum + (isRun(s) ? s.miles ?? 0 : 0), 0);
    let over = Math.round((total() - ceiling) * 10) / 10;
    if (over > 0) {
      // Longest easy runs give first, so the cut is spread rather than one run gutted.
      const easy = sessions
        .filter((s) => isRun(s) && !s.taxesLegs && !isLongRun(s) && (s.miles ?? 0) > MIN_EASY_RUN_MILES)
        .sort((a, b) => (b.miles ?? 0) - (a.miles ?? 0));
      for (const s of easy) {
        if (over <= 0) break;
        const cut = Math.min(over, (s.miles ?? 0) - MIN_EASY_RUN_MILES);
        s.miles = Math.round(((s.miles ?? 0) - cut) * 10) / 10;
        over = Math.round((over - cut) * 10) / 10;
      }
      notes.push(`easy runs trimmed to keep the week near ${opts.weeklyTarget}mi`);
    }
  }

  for (const s of sessions) if (isRun(s)) syncTitleMiles(s);
  return { sessions, note: notes.length ? notes.join("; ") : null };
}
