import type { MuscleRegion } from "@/lib/muscles";
import type { PlanDay, PlanDayStatus, PlanSession } from "@/lib/planner/types";

export interface DayLog {
  hasWorkout: boolean;
  hasRun: boolean;
  summary: string;
  /** Regions the logged workout actually hit, resolved via the lookup. */
  regions: MuscleRegion[];
}

/** A session that leaves the legs cooked shouldn't sit next to a key run. */
function isKeyRun(session: PlanSession): boolean {
  return (session.kind === "run" || session.kind === "lift_and_run") && session.taxesLegs;
}

/**
 * A lift session only counts as done if the work actually overlapped what it
 * targeted. Training chest on the day legs were planned is training — but it
 * isn't *this* session, so the session returns to the pool and the rest of
 * the week re-flows to pick it back up.
 */
function liftMatched(session: PlanSession, log: DayLog): boolean {
  if (!log.hasWorkout) return false;
  if (session.regions.length === 0) return true;
  if (log.regions.length === 0) return true; // untagged workout — give it the benefit
  return session.regions.some((r) => log.regions.includes(r));
}

function satisfiedBy(session: PlanSession, log: DayLog): boolean {
  switch (session.kind) {
    case "lift":
      return liftMatched(session, log);
    case "run":
      return log.hasRun;
    case "lift_and_run":
      return liftMatched(session, log) && log.hasRun;
    case "active_recovery":
      return log.hasWorkout || log.hasRun;
    case "rest":
      return true; // resting needs nothing logged to count
  }
}

export function fallbackSession(id: string): PlanSession {
  return {
    id,
    kind: "active_recovery",
    title: "Easy movement",
    rationale: "Nothing scheduled — keep it light with a walk or some mobility work.",
    regions: [],
    exercises: [],
    priority: 99,
    preferredDow: null,
    taxesLegs: false,
    miles: null,
  };
}

/**
 * Places sessions onto the week's days.
 *
 * Past days are frozen: they report what actually happened. A past day whose
 * logged work doesn't match what was planned is marked off-script and its
 * session returns to the pool, so the week re-flows forward to keep the
 * athlete on track rather than quietly dropping the missed work.
 *
 * Deterministic by design — a reshuffle after a logged session is instant
 * and never costs an AI call.
 */
export function scheduleWeek(opts: {
  sessions: PlanSession[];
  weekDates: string[];
  today: string;
  logs: Record<string, DayLog>;
  priorAssignments?: Record<string, string>; // sessionId -> date
}): PlanDay[] {
  const { sessions, weekDates, today, logs, priorAssignments = {} } = opts;

  const byId = new Map(sessions.map((s) => [s.id, s]));
  const assignment = new Map<string, string>(); // date -> sessionId, live placements
  // What a past day had been asked to do, kept only so the day can still
  // show it. Deliberately separate from `assignment`: a session shown on a
  // missed or off-script day is NOT placed, so it stays eligible to be
  // re-scheduled onto a day that's still ahead.
  const plannedHistory = new Map<string, string>();
  const consumed = new Set<string>();
  const statuses = new Map<string, PlanDayStatus>();

  // ── Freeze the past ───────────────────────────────────────────────────
  for (const date of weekDates) {
    if (date >= today) continue;
    const log = logs[date];
    const priorSessionId = Object.entries(priorAssignments).find(([, d]) => d === date)?.[0];
    const prior = priorSessionId ? byId.get(priorSessionId) : undefined;

    if (prior && log && satisfiedBy(prior, log)) {
      assignment.set(date, prior.id);
      consumed.add(prior.id);
      statuses.set(date, "done");
    } else if (log && (log.hasWorkout || log.hasRun)) {
      // Trained, but not what was planned — the session goes back in the pool.
      // With no prior assignment there was no plan to deviate from, so the
      // day simply counts as done.
      if (prior) {
        plannedHistory.set(date, prior.id);
        statuses.set(date, "off_script");
      } else {
        statuses.set(date, "done");
      }
    } else if (prior && prior.kind === "rest") {
      assignment.set(date, prior.id);
      consumed.add(prior.id);
      statuses.set(date, "done");
    } else {
      if (prior) plannedHistory.set(date, prior.id);
      statuses.set(date, "missed");
    }
  }

  // Today counts as done the moment something matching is logged.
  const todayLog = logs[today];
  const todayPriorId = Object.entries(priorAssignments).find(([, d]) => d === today)?.[0];
  const todayPrior = todayPriorId ? byId.get(todayPriorId) : undefined;
  if (todayPrior && todayLog && satisfiedBy(todayPrior, todayLog)) {
    assignment.set(today, todayPrior.id);
    consumed.add(todayPrior.id);
    statuses.set(today, "done");
  }

  // ── Place what's left on the days that remain ─────────────────────────
  const openDays = weekDates.filter((d) => d >= today && !assignment.has(d));
  const pending = sessions
    .filter((s) => !consumed.has(s.id) && !Array.from(assignment.values()).includes(s.id))
    .sort((a, b) => a.priority - b.priority);

  const dowOf = (date: string) => new Date(`${date}T00:00:00`).getDay();
  const take = (date: string, session: PlanSession) => {
    assignment.set(date, session.id);
    const idx = openDays.indexOf(date);
    if (idx >= 0) openDays.splice(idx, 1);
  };

  // Honour day preferences first — a long run asked for Saturday gets it.
  for (const session of [...pending]) {
    if (session.preferredDow == null) continue;
    const match = openDays.find((d) => dowOf(d) === session.preferredDow);
    if (match) {
      take(match, session);
      pending.splice(pending.indexOf(session), 1);
    }
  }

  // Key run days are now known; keep leg-taxing lifts off their neighbours.
  const keyRunDates = new Set(
    Array.from(assignment.entries())
      .filter(([, id]) => {
        const s = byId.get(id);
        return s ? isKeyRun(s) : false;
      })
      .map(([date]) => date)
  );
  const adjacentToKeyRun = (date: string) => {
    const t = new Date(`${date}T00:00:00`).getTime();
    for (const key of keyRunDates) {
      const diff = Math.abs(t - new Date(`${key}T00:00:00`).getTime()) / 86400000;
      if (diff === 1) return true;
    }
    return false;
  };

  for (const session of [...pending]) {
    if (openDays.length === 0) break;
    const preferred = session.taxesLegs ? openDays.find((d) => !adjacentToKeyRun(d)) : undefined;
    const date = preferred ?? openDays[0];
    take(date, session);
    pending.splice(pending.indexOf(session), 1);
  }

  // No day is ever blank — anything still unfilled gets easy movement.
  const extras: PlanSession[] = [];
  for (const date of openDays) {
    const filler = fallbackSession(`fallback-${date}`);
    extras.push(filler);
    byId.set(filler.id, filler);
    assignment.set(date, filler.id);
  }
  if (extras.length) sessions.push(...extras);

  // ── Build the days ────────────────────────────────────────────────────
  return weekDates.map((date) => {
    const sessionId = assignment.get(date) ?? plannedHistory.get(date) ?? null;
    const session = sessionId ? byId.get(sessionId) : undefined;
    const log = logs[date];
    let status = statuses.get(date);
    if (!status) status = date === today ? "today" : "upcoming";

    return {
      date,
      sessionId,
      runNote: null,
      isKeyRunDay: session ? isKeyRun(session) : false,
      status,
      loggedSummary: log && (log.hasWorkout || log.hasRun) ? log.summary : null,
    };
  });
}
