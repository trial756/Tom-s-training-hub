import type { PlanDay, PlanSession } from "@/lib/planner/types";

/**
 * How far above recent actual weekly mileage a single week is allowed to
 * reach. The classic ~10% rule, loosened slightly — the point is that the
 * block's target says what the plan wants, while recent volume says what the
 * athlete is currently built for. Prescribing the full gap in one week is
 * how people get hurt, so the reconciler closes what it safely can and
 * reports the rest rather than pretending.
 */
const PROGRESSION_CEILING = 1.15;
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
  const sessions = opts.sessions.map((s) => ({ ...s }));
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
    const addition: PlanSession = {
      id: `add-${day.date}`,
      kind: "run",
      title: `Easy ${Math.round(miles * 10) / 10}mi`,
      rationale: `Added to close this week's mileage — ${Math.round((weekTarget - milesThisWeek) * 10) / 10}mi still to run.`,
      regions: [],
      exercises: [],
      priority: 4,
      preferredDow: null,
      taxesLegs: false,
      miles: Math.round(miles * 10) / 10,
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
