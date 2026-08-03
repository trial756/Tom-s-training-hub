"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import {
  buildMarathonPlan,
  currentWeek,
  phaseSummaries,
  coachingTipFor,
  GOAL_TIME,
  RACE_DATE,
  GOAL_PACE_SECONDS_PER_MILE,
  PACE_TARGETS,
  RACE_DAY_PLAN,
  FUELING_STRATEGY,
  type PlanPhase,
  type PlanWeek,
} from "@/lib/marathonPlan";
import { formatPace, formatShortDate, localDateKey } from "@/lib/format";
import type { Run } from "@/lib/types";

const PHASE_COLORS: Record<PlanPhase, string> = {
  "Base Building": "bg-blue-500/20 text-blue-300",
  Stamina: "bg-run/20 text-run",
  Peak: "bg-accent/20 text-accent",
  Taper: "bg-fuel/20 text-fuel",
};

const SHOE_WARNING_MILES = 350;

export default function MarathonPage() {
  const weeks = useMemo(() => buildMarathonPlan(), []);
  const phases = useMemo(() => phaseSummaries(weeks), [weeks]);
  const active = useMemo(() => currentWeek(weeks), [weeks]);

  const [runs, setRuns] = useState<Run[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<PlanPhase>>(new Set(active ? [active.phase] : []));
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set(active ? [active.weekNumber] : []));

  useEffect(() => {
    fetch("/api/runs?limit=500")
      .then((res) => res.json())
      .then((json) => setRuns(json.runs ?? []))
      .finally(() => setLoadingRuns(false));
  }, []);

  const actualWeekMileage = useMemo(() => {
    if (!active) return 0;
    return runs
      .filter((r) => {
        const key = localDateKey(new Date(r.logged_at));
        return key >= active.startDate && key <= active.endDate;
      })
      .reduce((sum, r) => sum + (Number(r.distance_miles) || 0), 0);
  }, [runs, active]);

  const shoeMileage = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of runs) {
      if (!r.shoes) continue;
      map.set(r.shoes, (map.get(r.shoes) ?? 0) + (Number(r.distance_miles) || 0));
    }
    return Array.from(map.entries())
      .map(([shoes, miles]) => ({ shoes, miles: Math.round(miles * 10) / 10 }))
      .sort((a, b) => b.miles - a.miles);
  }, [runs]);

  const raceDate = new Date(`${RACE_DATE}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToRace = Math.round((raceDate.getTime() - today.getTime()) / 86400000);

  function togglePhase(phase: PlanPhase) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }

  function toggleWeek(weekNumber: number) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekNumber)) next.delete(weekNumber);
      else next.add(weekNumber);
      return next;
    });
  }

  const weekProgressPct = active && active.weeklyMileage > 0 ? Math.min(100, Math.round((actualWeekMileage / active.weeklyMileage) * 100)) : 0;

  return (
    <div>
      <PageHeader title="Marathon Plan" subtitle="27 weeks to race day." />

      <div className="px-4">
        <div className="card bg-gradient-to-br from-base-900 to-black">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Race Day</p>
              <p className="text-lg font-bold text-white">
                {raceDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-accent">{daysToRace > 0 ? daysToRace : 0}</p>
              <p className="text-xs text-gray-500">days to go</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-base-700 pt-3">
            <div>
              <p className="text-xs text-gray-500">Goal Time</p>
              <p className="text-lg font-bold text-white">{GOAL_TIME}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Goal Pace</p>
              <p className="text-lg font-bold text-white">{formatPace(GOAL_PACE_SECONDS_PER_MILE)}</p>
            </div>
          </div>
        </div>
      </div>

      {active && (
        <div className="mt-4 px-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">This Week</h2>
          <div className="card border-accent/40">
            <div className="flex items-center justify-between">
              <span className={`pill ${PHASE_COLORS[active.phase]}`}>{active.phase}</span>
              <span className="text-xs text-gray-500">Week {active.weekNumber} of 27</span>
            </div>
            <p className="mt-3 text-sm text-gray-300">{active.keyWorkout}</p>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {loadingRuns ? "…" : `${Math.round(actualWeekMileage * 10) / 10} / ${active.weeklyMileage} mi this week`}
                </span>
                <span>{weekProgressPct}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-base-800">
                <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${weekProgressPct}%` }} />
              </div>
            </div>

            {active.notes && <p className="mt-3 text-xs text-gray-500">{active.notes}</p>}
          </div>
        </div>
      )}

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Pace Targets</h2>
        <div className="overflow-hidden rounded-2xl border border-base-700">
          <table className="w-full text-left text-xs">
            <thead className="bg-base-800 text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Zone</th>
                <th className="px-3 py-2 font-medium">Pace</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {PACE_TARGETS.map((p) => (
                <tr key={p.zone} className="border-t border-base-800">
                  <td className="px-3 py-2 font-medium text-white">{p.zone}</td>
                  <td className="px-3 py-2 text-accent">{p.pace}</td>
                  <td className="px-3 py-2 text-gray-400">{p.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Shoe Mileage</h2>
        {loadingRuns ? (
          <Spinner />
        ) : shoeMileage.length === 0 ? (
          <p className="text-sm text-gray-500">No shoes logged on runs yet.</p>
        ) : (
          <div className="space-y-2">
            {shoeMileage.map((s) => {
              const warn = s.miles >= SHOE_WARNING_MILES;
              const pct = Math.min(100, (s.miles / 500) * 100);
              return (
                <div key={s.shoes} className="card">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{s.shoes}</span>
                    <span className={`text-sm font-semibold ${warn ? "text-danger" : "text-gray-300"}`}>{s.miles} mi</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-base-800">
                    <div className={`h-2 rounded-full ${warn ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                  {warn && <p className="mt-1.5 text-xs text-danger">350+ miles — typical shoe lifespan is 300–500mi. Consider retiring these.</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">27-Week Training Plan</h2>
        <div className="space-y-2">
          {phases.map((p) => (
            <div key={p.phase} className="card">
              <button type="button" onClick={() => togglePhase(p.phase)} className="flex w-full items-center justify-between text-left">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`pill ${PHASE_COLORS[p.phase]}`}>{p.phase}</span>
                    <span className="text-xs text-gray-500">{p.weekRange}</span>
                  </div>
                  <p className="mt-1 max-w-[220px] text-xs text-gray-400">{p.focus}</p>
                </div>
                <div className="text-right">
                  <span className="whitespace-nowrap text-xs font-medium text-gray-400">{p.mileageRange}</span>
                  <p className="text-xs text-gray-600">{expandedPhases.has(p.phase) ? "▲" : "▼"}</p>
                </div>
              </button>

              {expandedPhases.has(p.phase) && (
                <div className="mt-3 space-y-1.5 border-t border-base-700 pt-3">
                  {p.weeks.map((w) => (
                    <WeekRow key={w.weekNumber} week={w} isActive={active?.weekNumber === w.weekNumber} expanded={expandedWeeks.has(w.weekNumber)} onToggle={() => toggleWeek(w.weekNumber)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Race Day Game Plan</h2>
        <div className="overflow-hidden rounded-2xl border border-base-700">
          <table className="w-full text-left text-xs">
            <tbody>
              {RACE_DAY_PLAN.map((r) => (
                <tr key={r.segment} className="border-t border-base-800 first:border-t-0">
                  <td className="w-24 px-3 py-2.5 font-semibold text-accent">{r.segment}</td>
                  <td className="px-3 py-2.5 text-gray-300">{r.plan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Race Fueling Strategy</h2>
        <div className="overflow-hidden rounded-2xl border border-base-700">
          <table className="w-full text-left text-xs">
            <tbody>
              {FUELING_STRATEGY.map((f) => (
                <tr key={f.when} className="border-t border-base-800 first:border-t-0">
                  <td className="w-32 px-3 py-2.5 font-semibold text-fuel">{f.when}</td>
                  <td className="px-3 py-2.5 text-gray-300">{f.plan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WeekRow({
  week,
  isActive,
  expanded,
  onToggle,
}: {
  week: PlanWeek;
  isActive: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const remainingMileage = Math.max(0, week.weeklyMileage - week.longRunMiles);

  return (
    <div className={`rounded-lg ${isActive ? "bg-accent/10" : week.isRecoveryWeek ? "bg-base-800/60" : ""}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-2 py-1.5 text-left">
        <div className="flex items-center gap-2">
          <span className="w-6 text-xs font-semibold text-white">{week.weekNumber}</span>
          <span className="text-xs text-gray-400">
            {formatShortDate(week.startDate)}–{formatShortDate(week.endDate)}
          </span>
          {week.isRecoveryWeek && <span className="pill bg-base-700 text-[10px] text-gray-400">recovery</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{week.weeklyMileage} mi</span>
          <span className="text-gray-600">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 px-2 pb-2.5 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-base-800 p-2 text-center">
              <p className="text-sm font-bold text-white">{week.longRunMiles} mi</p>
              <p className="text-[10px] text-gray-500">long run</p>
            </div>
            <div className="rounded-lg bg-base-800 p-2 text-center">
              <p className="text-sm font-bold text-white">{remainingMileage} mi</p>
              <p className="text-[10px] text-gray-500">easy/moderate</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{week.keyWorkout}</p>
          <p className="rounded-lg border border-accent/20 bg-accent/5 p-2 text-xs text-gray-300">💡 {coachingTipFor(week)}</p>
        </div>
      )}
    </div>
  );
}
