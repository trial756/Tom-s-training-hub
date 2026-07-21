import PageHeader from "@/components/PageHeader";
import { buildMarathonPlan, currentWeek, phaseSummaries, GOAL_TIME, RACE_DATE } from "@/lib/marathonPlan";
import { formatPace, formatShortDate } from "@/lib/format";

const GOAL_PACE_SECONDS = 8 * 60 + 1;

const PHASE_COLORS: Record<string, string> = {
  Base: "bg-blue-500/20 text-blue-300",
  Build: "bg-run/20 text-run",
  Peak: "bg-accent/20 text-accent",
  Taper: "bg-fuel/20 text-fuel",
  "Race Week": "bg-red-500/20 text-red-300",
};

export default function MarathonPage() {
  const weeks = buildMarathonPlan();
  const phases = phaseSummaries(weeks);
  const active = currentWeek(weeks);

  const raceDate = new Date(`${RACE_DATE}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToRace = Math.round((raceDate.getTime() - today.getTime()) / 86400000);

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
              <p className="text-lg font-bold text-white">{formatPace(GOAL_PACE_SECONDS)}</p>
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
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xl font-bold text-white">{active.weeklyMileage} mi</p>
                <p className="text-xs text-gray-500">weekly target</p>
              </div>
              <div>
                <p className="text-xl font-bold text-white">{active.longRunMiles} mi</p>
                <p className="text-xs text-gray-500">long run</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-300">{active.keyWorkout}</p>
            {active.notes && <p className="mt-2 text-xs text-gray-500">{active.notes}</p>}
          </div>
        </div>
      )}

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Phases</h2>
        <div className="space-y-2">
          {phases.map((p) => (
            <div key={p.phase} className="card flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`pill ${PHASE_COLORS[p.phase]}`}>{p.phase}</span>
                  <span className="text-xs text-gray-500">{p.weekRange}</span>
                </div>
                <p className="mt-1 max-w-[220px] text-xs text-gray-400">{p.focus}</p>
              </div>
              <span className="whitespace-nowrap text-xs font-medium text-gray-400">{p.mileageRange}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Week by Week</h2>
        <div className="overflow-hidden rounded-2xl border border-base-700">
          <table className="w-full text-left text-xs">
            <thead className="bg-base-800 text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Wk</th>
                <th className="px-3 py-2 font-medium">Dates</th>
                <th className="px-3 py-2 font-medium">Phase</th>
                <th className="px-3 py-2 text-right font-medium">Mi</th>
                <th className="px-3 py-2 text-right font-medium">Long</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr
                  key={w.weekNumber}
                  className={`border-t border-base-800 ${
                    active?.weekNumber === w.weekNumber ? "bg-accent/10" : w.isRecoveryWeek ? "bg-base-900/60" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-semibold text-white">{w.weekNumber}</td>
                  <td className="px-3 py-2 text-gray-400">
                    {formatShortDate(w.startDate)}–{formatShortDate(w.endDate)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`pill ${PHASE_COLORS[w.phase]}`}>{w.phase}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300">{w.weeklyMileage}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{w.longRunMiles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
