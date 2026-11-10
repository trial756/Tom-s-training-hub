"use client";

import type { PaceZones } from "@/lib/paceZones";
import { formatPaceRange } from "@/lib/planner/runPlan";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Today's paces and heart-rate caps, and where each number came from. */
export default function PaceZonesCard({ zones }: { zones: PaceZones }) {
  const z = zones.zones;
  const rows: { name: string; pace: string; hr?: string }[] = [
    { name: "Easy / recovery", pace: formatPaceRange(z.Easy), hr: `under ${zones.easyHrCap}` },
    { name: "Long run", pace: formatPaceRange(z.Long), hr: `under ${zones.longHrCap}` },
    { name: "Marathon pace", pace: formatPaceRange(z["Marathon Pace"]) },
    { name: "Tempo / threshold", pace: formatPaceRange(z.Tempo) },
    { name: "Intervals", pace: formatPaceRange(z.Interval) },
  ];
  if (z.Race && z.Race.low !== z["Marathon Pace"]?.low) rows.push({ name: "Race", pace: formatPaceRange(z.Race) });

  return (
    <div className="card space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">Paces &amp; heart rate</p>
        <p className="text-xs text-muted">The plan uses these. They update as you log runs.</p>
      </div>
      <div className="divide-y divide-base-700">
        {rows.map((r) => (
          <div key={r.name} className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-sm text-ink">{r.name}</span>
            <span className="text-right">
              <span className="text-sm font-semibold tabular-nums text-ink">{r.pace}/mi</span>
              {r.hr && <span className="block text-xs tabular-nums text-run">HR {r.hr}</span>}
            </span>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-xs text-muted">
        <li>
          Heart-rate caps: 80% (easy) and 84% (long) of your max,{" "}
          {zones.maxHrSource === "runs" ? `${zones.maxHr} — the highest a run has recorded this year.` : `${zones.maxHr} (default — no run has recorded a max yet).`}
        </li>
        <li>
          {zones.fit
            ? `Easy and long paces: what your last ${zones.fit.runs} steady runs say you hold at those caps — about ${clock(zones.fit.paceAtEasyCap)}/mi at ${zones.easyHrCap} and ${clock(zones.fit.paceAtLongCap)}/mi at ${zones.longHrCap}. Heart rate is the rule; the pace is a guide.`
            : "Easy and long paces: set from marathon pace until there are enough steady runs with heart rate to read your own."}
        </li>
        <li>
          Marathon, tempo and interval paces follow{" "}
          {zones.mpSource === "goal" ? `the ${zones.mpLabel}` : zones.mpSource === "fitness" ? `an ${zones.mpLabel}` : `the ${zones.mpLabel}`}: marathon pace{" "}
          {clock(zones.mpPace)}/mi.
        </li>
      </ul>
    </div>
  );
}
