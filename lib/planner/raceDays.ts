import { daysBetweenKeys } from "@/lib/format";
import type { Goal } from "@/lib/goals";
import { patternOf } from "@/lib/planner/patterns";
import type { PlanExercise, PlanSession } from "@/lib/planner/types";

// ── Race day, the days around it, and the recovery after ─────────────
//
// Nov 2026 review: the planner didn't know race day existed. The Dallas
// Marathon falls on a Sunday — the first day of the *recovery* week — so the
// card that morning would have read "easy run + mobility", the watch run
// would have been imported as an easy run, race week could put its "long
// run" on the Saturday, and recovery started running again the next day
// with no cap on miles.
//
// These days are set in code and pinned to their dates (`fixedDate`); the
// model plans only the days left over:
//   • race day        — the race itself, a Race-type run
//   • the day before  — a 2-mile shakeout with strides
//   • two days before — walk and mobility, no gym (A/B races, half and up)
//   • after           — no running for 3 days after a marathon, 1 after a half
// and the weeks around them are held to rules: a race week has no long run,
// one short sharpener at most and no leg lifting; a recovery week is easy
// runs only, capped per run and per week, with legs out (week 1) or light
// (week 2).

const live = (g: Goal) => (g.status ?? "active") !== "dropped";
const move = (name: string, sets: number, reps: string, regions: PlanExercise["regions"], cue: string | null = null): PlanExercise => ({
  name, sets, reps, target: null, cue, isNew: false, regions,
});

/** Days with no running after a race, by distance. */
export function noRunDaysAfter(distanceMi: number): number {
  if (distanceMi >= 20) return 3;
  if (distanceMi >= 10) return 1;
  return 0;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** The code-made sessions pinned to dates in this week: race day and the days around it. */
export function fixedSessionsFor(goals: Goal[], weekDates: string[]): PlanSession[] {
  const out: PlanSession[] = [];
  const taken = new Set<string>();
  const races = goals.filter((g) => g.kind === "race" && live(g)).sort((a, b) => a.date.localeCompare(b.date));
  const put = (s: PlanSession) => {
    if (!s.fixedDate || taken.has(s.fixedDate)) return;
    taken.add(s.fixedDate);
    out.push(s);
  };
  // Race days first, so nothing else can take a race's date.
  for (const r of races) {
    if (!weekDates.includes(r.date)) continue;
    const dist = r.distance_mi ?? null;
    const pace = dist && r.target_seconds ? Math.round(r.target_seconds / dist) : null;
    put({
      id: `race-${r.id}`,
      kind: "run",
      title: `${r.title} — race day`,
      rationale: pace
        ? `Race day. Start a few seconds slower than ${clock(pace)}/mi, settle onto it, and save the push for the last quarter.`
        : "Race day. Run it by feel and enjoy it.",
      regions: ["quads", "hamstrings", "glutes", "calves"],
      exercises: [
        move("Leg Swing", 1, "10 per side", ["glutes", "hamstrings"]),
        move("A-Skip", 2, "20 m", ["calves", "quads"]),
      ],
      priority: 0,
      preferredDow: null,
      taxesLegs: true,
      miles: dist,
      run: { type: "Race", structure: null },
      fixedDate: r.date,
    });
  }
  for (const r of races) {
    const dist = r.distance_mi ?? 0;
    const main = r.priority !== "C";
    for (const date of weekDates) {
      const offset = daysBetweenKeys(r.date, date); // negative before the race
      if (offset === -1) {
        put({
          id: `shakeout-${r.id}`,
          kind: "run",
          title: "Shakeout 2 mi + strides",
          rationale: `Day before ${r.title}: two very easy miles and a few strides to stay loose. Nothing else today.`,
          regions: ["calves"],
          exercises: [
            move("Strides", 1, "4 × 20 s", ["calves", "quads"], "Fast but relaxed, full walk back between each."),
            move("Leg Swing", 1, "10 per side", ["glutes", "hamstrings"]),
          ],
          priority: 1,
          preferredDow: null,
          taxesLegs: false,
          miles: 2,
          run: { type: "Easy", structure: "2 mi very easy · 4 × 20 s strides" },
          fixedDate: date,
        });
      } else if (offset === -2 && main && dist >= 13) {
        put({
          id: `prerace-${r.id}`,
          kind: "active_recovery",
          title: "Walk + mobility",
          rationale: `Two days before ${r.title}: no running and no gym. A walk and some easy mobility, then feet up.`,
          regions: ["glutes"],
          exercises: [
            move("Walking", 1, "20 min easy", ["calves", "glutes"]),
            move("90/90 Hip Stretch", 2, "60s per side", ["glutes"]),
            move("Couch Stretch", 2, "45s per side", ["quads"]),
          ],
          priority: 2,
          preferredDow: null,
          taxesLegs: false,
          miles: null,
          fixedDate: date,
        });
      } else if (offset >= 1 && offset <= noRunDaysAfter(dist)) {
        put({
          id: `postrace-${r.id}-${offset}`,
          kind: "active_recovery",
          title: "Recovery walk + mobility",
          rationale: `Day ${offset} after ${r.title}: no running yet. Walk to keep blood moving, stretch gently, eat and sleep well.`,
          regions: ["glutes"],
          exercises: [
            move("Walking", 1, offset === 1 ? "10-15 min easy" : "20-30 min easy", ["calves", "glutes"]),
            move("90/90 Hip Stretch", 2, "60s per side", ["glutes"]),
            move("Couch Stretch", 2, "45s per side", ["quads"]),
          ],
          priority: 2,
          preferredDow: null,
          taxesLegs: false,
          miles: null,
          fixedDate: date,
        });
      }
    }
  }
  return out.sort((a, b) => (a.fixedDate ?? "").localeCompare(b.fixedDate ?? ""));
}

export interface RecoveryCaps {
  /** 1 = the week holding the first days after the race; 2 = the week after. */
  phase: 1 | 2;
  maxWeekMiles: number;
  maxRunMiles: number;
}

/** Run limits for a recovery week, from the race's distance and how long ago it was. */
export function recoveryCapsFor(raceDate: string, distanceMi: number, weekStart: string): RecoveryCaps {
  const phase = daysBetweenKeys(raceDate, weekStart) < 7 ? 1 : 2;
  if (distanceMi >= 20) return phase === 1 ? { phase, maxWeekMiles: 8, maxRunMiles: 3 } : { phase, maxWeekMiles: 15, maxRunMiles: 6 };
  return phase === 1 ? { phase, maxWeekMiles: 12, maxRunMiles: 5 } : { phase, maxWeekMiles: 18, maxRunMiles: 7 };
}

const isRunKind = (s: PlanSession) => s.kind === "run" || s.kind === "lift_and_run";
const liftPart = (title: string) => (title.includes("+") ? title.split("+").slice(1).join("+").trim() : "");
const easyTitle = (s: PlanSession) => {
  const rest = liftPart(s.title);
  return `Easy run ${s.miles} mi${rest ? ` + ${rest}` : ""}`;
};
const isStrides = (name: string) => /strides?\b/i.test(name);
const legPattern = (name: string) => {
  const p = patternOf(name);
  return p === "squat" || p === "hinge" || (p === "power" && !isStrides(name));
};

/** Takes the run out of a session: a run day becomes a walk-and-mobility day, a run + lift day a lift. */
function dropRun(s: PlanSession) {
  const rest = liftPart(s.title);
  s.kind = s.kind === "lift_and_run" ? "lift" : "active_recovery";
  s.title = rest || "Walk + mobility";
  s.miles = null;
  s.run = null;
  if (s.kind === "active_recovery" && !s.exercises.some((e) => /walk/i.test(e.name))) {
    s.exercises = [move("Walking", 1, "20-30 min easy", ["calves", "glutes"]), ...s.exercises];
  }
}

/**
 * Holds a recovery week's model-planned sessions to the caps: easy runs only,
 * each within the per-run limit, the week within its total; no leg lifting or
 * jumps in week 1 (strides and calves included), light legs in week 2.
 */
export function applyRecoveryRules(input: PlanSession[], caps: RecoveryCaps): PlanSession[] {
  const sessions = input.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e })) }));
  for (const s of sessions) {
    s.taxesLegs = false;
    if (isRunKind(s)) {
      s.miles = Math.max(2, Math.min(s.miles ?? caps.maxRunMiles, caps.maxRunMiles));
      s.run = { type: "Easy", structure: null };
      s.title = easyTitle(s);
    }
    if (caps.phase === 1) {
      s.exercises = s.exercises.filter((e) => !legPattern(e.name) && !isStrides(e.name) && patternOf(e.name) !== "calf");
    } else {
      s.exercises = s.exercises
        .filter((e) => patternOf(e.name) !== "power" || isStrides(e.name))
        .map((e) =>
          legPattern(e.name)
            ? { ...e, sets: Math.min(e.sets, 2), reps: "10-12", target: null, note: "light — bodyweight or about half your usual load; the legs are still recovering" }
            : e
        );
    }
  }
  // The week's total: shorten the longest runs first, then drop runs.
  const runs = () => sessions.filter(isRunKind);
  const total = () => runs().reduce((sum, s) => sum + (s.miles ?? 0), 0);
  for (let guard = 0; guard < 40 && total() > caps.maxWeekMiles; guard++) {
    const longest = runs().sort((a, b) => (b.miles ?? 0) - (a.miles ?? 0))[0];
    if (!longest) break;
    if ((longest.miles ?? 0) > 2) {
      longest.miles = Math.max(2, (longest.miles ?? 0) - 1);
      longest.title = easyTitle(longest);
    } else {
      const last = runs().sort((a, b) => b.priority - a.priority)[0];
      dropRun(last);
    }
  }
  return sessions;
}

const QUALITY = new Set(["Tempo", "Interval", "Marathon Pace"]);

/**
 * Race week: no long run (it becomes a short easy run), at most one short
 * sharpener, and no leg lifting or jumps — strides stay.
 */
export function applyRaceWeekRules(input: PlanSession[]): PlanSession[] {
  const sessions = input.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e })) }));
  let sharpeners = 0;
  for (const s of [...sessions].sort((a, b) => a.priority - b.priority)) {
    s.taxesLegs = false;
    s.exercises = s.exercises.filter((e) => !legPattern(e.name));
    if (!isRunKind(s)) continue;
    const type = s.run?.type ?? null;
    if (type && QUALITY.has(type) && sharpeners === 0) {
      sharpeners++;
      s.miles = Math.min(s.miles ?? 5, 5);
      // Earliest well-spaced day, wherever the model wanted it: far from race day.
      s.preferredDow = null;
      s.title = s.title.replace(/(\d+(?:\.\d+)?)(\s?mi\b)/i, `${s.miles}$2`);
    } else if (type === "Long" || (type && QUALITY.has(type)) || type === "Race") {
      s.miles = Math.min(s.miles ?? 4, 5);
      s.run = { type: "Easy", structure: null };
      s.title = easyTitle(s);
    }
  }
  return sessions;
}

/** Keeps the `n` sessions that matter most (by the model's priority) when fixed days leave fewer open ones. */
export function keepForOpenDays(sessions: PlanSession[], n: number): PlanSession[] {
  if (sessions.length <= n) return sessions;
  const keep = new Set([...sessions].sort((a, b) => a.priority - b.priority).slice(0, Math.max(0, n)).map((s) => s.id));
  return sessions.filter((s) => keep.has(s.id));
}
