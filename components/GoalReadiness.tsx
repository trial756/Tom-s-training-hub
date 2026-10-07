"use client";

import { formatDuration } from "@/lib/format";
import type { Readiness } from "@/lib/readiness";

const STATUS_STYLE = {
  on_track: { bar: "bg-accent", text: "text-accent", label: "on track" },
  behind: { bar: "bg-fuel", text: "text-fuel", label: "behind" },
  critical: { bar: "bg-danger", text: "text-danger", label: "at risk" },
} as const;

/**
 * The goal attempt, judged on evidence rather than optimism. Each marker is
 * something that decides a marathon, with the week it has to be met by — so
 * the answer arrives while there's still time to act on it.
 */
export default function GoalReadiness({ readiness, goalTime }: { readiness: Readiness; goalTime: string }) {
  const { markers, verdict, projectedSeconds, projectedFrom, daysToRace } = readiness;

  return (
    <div className="card">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">{goalTime} Readiness</h3>
        <span className="text-[11px] text-faint">{daysToRace} days out</span>
      </div>
      <p className="mb-3 text-xs leading-snug text-muted">{verdict}</p>

      <div className="space-y-3">
        {markers.map((m) => {
          const style = STATUS_STYLE[m.status];
          const pct = Math.min(100, Math.round((m.current / m.target) * 100));
          return (
            <div key={m.key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-gray-300">{m.label}</span>
                <span className="tabular-nums text-muted">
                  {m.current} / {m.target} {m.unit}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-sm bg-base-800">
                <div className={`h-2 rounded-r-sm ${style.bar}`} style={{ width: `${Math.max(3, pct)}%` }} />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-[10px] leading-snug text-faint">{m.note}</span>
                <span className={`shrink-0 text-[10px] font-medium ${style.text}`}>
                  {style.label} · by wk {m.dueWeek}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {projectedSeconds != null && (
        <div className="mt-3 rounded-lg bg-base-800 p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-300">Current race equivalent</span>
            <span className="text-sm font-bold text-ink">{formatDuration(projectedSeconds)}</span>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-faint">
            Riegel projection from {projectedFrom}. Short efforts flatter the marathon — treat it as a ceiling, not
            a prediction, until the goal-pace marker is met.
          </p>
        </div>
      )}
    </div>
  );
}
