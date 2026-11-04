import { normalizeExerciseName } from "@/lib/format";
import { COMPOUND, familyOf, patternOf, PATTERN_LABEL, PATTERN_TARGET, type Family, type Pattern } from "@/lib/planner/patterns";
import { prescribe, roleFromReps, type LiftTrend, type Role } from "@/lib/planner/progression";
import { STALL_BREAKERS } from "@/lib/planner/stallBreakers";
import type { PlanExercise, PlanSession } from "@/lib/planner/types";

// ── Strength rules, enforced after the model plans ───────────────────
//
// The model picks exercises; these rules make the week coherent:
//   • at most one heavy lift per family (push / pull / legs) in a session,
//     and at most two heavy lifts in a session — a second press drops to a
//     lighter 8–10 volume slot instead of competing with the first
//   • each pattern gets one heavy day a week; repeats that week are volume
//   • order: heavy compound → other compounds → isolation → core → mobility
//   • loads and reps for logged lifts come from the progression rules
//   • a stalled lift keeps its slot on a new scheme and gets a stall breaker
//     beside it, from a fixed list
//   • "new" means never logged — checked against the full history

const MAX_HEAVY_PER_SESSION = 2;

interface Context {
  trends: Map<string, LiftTrend>;
  /** Every exercise name ever logged, normalized. */
  knownNames: Set<string>;
  /** Big mileage jump or rough runs — no load increases on leg lifts. */
  fatigued: boolean;
  /** Sessions already behind us this week (kept through a replan). */
  alreadyThisWeek?: PlanSession[];
}

const isLift = (s: PlanSession) => s.kind === "lift" || s.kind === "lift_and_run";

function tier(pattern: Pattern, role: Role | null): number {
  if (pattern === "power") return -1; // fast work first, while fresh
  if (pattern === "mobility") return 4;
  if (pattern === "core") return 3;
  if (COMPOUND.has(pattern)) return role === "heavy" ? 0 : 1;
  return 2;
}

function findTrend(trends: Map<string, LiftTrend>, name: string): LiftTrend | undefined {
  return trends.get(normalizeExerciseName(name));
}

export function applyStrengthRules(input: PlanSession[], ctx: Context): PlanSession[] {
  const sessions = input.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e })) }));
  const heavyThisWeek = new Set<Pattern>();
  // A stalled lift gets its breaker once a week, beside its first appearance.
  const brokenThisWeek = new Set<string>();
  // What earlier days already covered: a pattern that went heavy on Sunday
  // gets its volume day if it comes back on Thursday.
  for (const s of ctx.alreadyThisWeek ?? []) {
    if (!isLift(s)) continue;
    for (const ex of s.exercises) {
      const pattern = patternOf(ex.name);
      if (roleFromReps(ex.reps, pattern) === "heavy") heavyThisWeek.add(pattern);
      if (/stall breaker/.test(ex.note ?? "")) {
        const m = /\(([^:]+):/.exec(ex.note ?? "");
        if (m) brokenThisWeek.add(normalizeExerciseName(m[1]));
      }
    }
  }
  const order = [...sessions].sort((a, b) => (a.preferredDow ?? 9) - (b.preferredDow ?? 9));

  for (const session of order) {
    if (isLift(session)) {
      const heavyFamilies = new Set<Family>();
      let heavyCount = 0;

      // Roles first, in the order the model wrote them.
      const rows = session.exercises.map((ex) => {
        const pattern = patternOf(ex.name);
        let role = roleFromReps(ex.reps, pattern);
        if (role === "heavy") {
          const fam = familyOf(pattern);
          if (heavyFamilies.has(fam) || heavyCount >= MAX_HEAVY_PER_SESSION || heavyThisWeek.has(pattern)) {
            role = "volume";
            ex.reps = "8-10";
            ex.note = heavyThisWeek.has(pattern)
              ? `volume day — the ${PATTERN_LABEL[pattern]} already had its heavy day this week`
              : `volume slot — one heavy ${fam} lift per session`;
          } else {
            heavyFamilies.add(fam);
            heavyThisWeek.add(pattern);
            heavyCount++;
          }
        }
        return { ex, pattern, role };
      });

      // Loads from the progression rules.
      for (const row of rows) {
        const trend = findTrend(ctx.trends, row.ex.name);
        if (!trend || !row.role) continue;
        const rx = prescribe(trend, row.role, { fatigued: ctx.fatigued });
        if (!rx) continue;
        row.ex.reps = rx.reps;
        row.ex.target = `${rx.target} lb`;
        row.ex.note = row.ex.note ? `${row.ex.note}; ${rx.basis}` : rx.basis;
        row.role = rx.role;
      }

      // Stall breakers beside stalled lifts. Prefer a movement the session
      // doesn't already have; if every option duplicates one, the breaker takes
      // the slot of the isolation exercise it overlaps rather than piling on.
      const present = new Set(rows.map((r) => normalizeExerciseName(r.ex.name)));
      for (const row of [...rows]) {
        const trend = findTrend(ctx.trends, row.ex.name);
        // A lift that's flat or sliding gets the same help.
        if (!trend || (trend.status !== "stalled" && trend.status !== "regressing")) continue;
        if (brokenThisWeek.has(trend.key)) continue;
        const options = STALL_BREAKERS[trend.pattern] ?? [];
        if (!options.length) continue;
        brokenThisWeek.add(trend.key);
        if (options.some((o) => present.has(normalizeExerciseName(o.name)))) continue;

        const patternsHere = new Set(rows.map((r) => r.pattern));
        const fresh = options.find((o) => !patternsHere.has(patternOf(o.name)));
        const pick = fresh ?? options[0];
        const pattern = patternOf(pick.name);
        const role: Role = COMPOUND.has(pattern) ? "volume" : "isolation";
        const breakerTrend = findTrend(ctx.trends, pick.name);
        const rx = breakerTrend ? prescribe(breakerTrend, role, { fatigued: ctx.fatigued }) : null;
        const ex: PlanExercise = {
          name: pick.name,
          sets: 3,
          reps: rx?.reps ?? (role === "volume" ? "8-10" : "10-12"),
          target: rx ? `${rx.target} lb` : null,
          cue: null,
          isNew: false,
          regions: pick.regions,
          note: `stall breaker — ${pick.why} (${trend.name}: ${trend.summary})`,
        };
        const overlapAt = fresh
          ? -1
          : rows.findIndex((r) => {
              const target = PATTERN_TARGET[r.pattern];
              return !COMPOUND.has(r.pattern) && target != null && pick.regions.includes(target);
            });
        if (overlapAt >= 0) {
          ex.note = `${ex.note} — in place of ${rows[overlapAt].ex.name} this week`;
          rows[overlapAt] = { ex, pattern, role };
        } else {
          rows.push({ ex, pattern, role });
        }
        present.add(normalizeExerciseName(pick.name));
        for (const r of pick.regions) if (!session.regions.includes(r)) session.regions = [...session.regions, r];
      }

      rows.sort((a, b) => tier(a.pattern, a.role) - tier(b.pattern, b.role));
      session.exercises = rows.map((r) => r.ex);
    }

    // "New" only for movements never logged; the form cue goes with it.
    for (const ex of session.exercises) {
      ex.isNew = !ctx.knownNames.has(normalizeExerciseName(ex.name));
      if (!ex.isNew) ex.cue = null;
    }
  }
  return sessions;
}

/** For the planner's context: each lift's trend in a line, and the stalls with their fixes. */
export function progressReport(trends: Map<string, LiftTrend>) {
  const lifts = Array.from(trends.values())
    .filter((t) => t.sessions.length >= 2 && t.pattern !== "mobility" && t.pattern !== "core")
    .sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? ""))
    .slice(0, 25);
  return {
    lifts: lifts.map((t) => ({ lift: t.name, pattern: PATTERN_LABEL[t.pattern], status: t.status, trend: t.summary })),
    stalls: lifts
      .filter((t) => t.status === "stalled" || t.status === "regressing")
      .map((t) => ({
        lift: t.name,
        status: t.status,
        trend: t.summary,
        breakers: (STALL_BREAKERS[t.pattern] ?? []).map((b) => `${b.name} (${b.why})`),
      })),
  };
}
