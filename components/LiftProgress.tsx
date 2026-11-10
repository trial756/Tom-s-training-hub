"use client";

import { useCallback, useEffect, useState } from "react";
import { formatShortDate } from "@/lib/format";
import { useRefreshOn } from "@/lib/refresh";

interface Lift {
  name: string;
  pattern: string;
  status: "building" | "progressing" | "stalled" | "regressing";
  sessions: number;
  best: { set: string; e1rm: number; date: string } | null;
  last: { set: string; e1rm: number; date: string } | null;
  points: { date: string; e1rm: number }[];
}

const STATUS: Record<Lift["status"], { label: string; cls: string }> = {
  progressing: { label: "Progressing", cls: "bg-accent/15 text-accent" },
  stalled: { label: "Stalled", cls: "bg-fuel/15 text-fuel" },
  regressing: { label: "Slipping", cls: "bg-danger/15 text-danger" },
  building: { label: "New", cls: "bg-base-800 text-muted" },
};

// Bodyweight ratios are only meaningful for the big barbell lifts.
const RATIO_PATTERNS = new Set(["squat", "hinge", "horizontal_press", "vertical_press", "horizontal_pull", "vertical_pull"]);
const SHOWN = 6;

/** Each lift's estimated 1RM over time, newest-trained first. */
export default function LiftProgress() {
  const [data, setData] = useState<{ bodyweight: number; lifts: Lift[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const load = useCallback(() => {
    fetch("/api/lifts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setData(j)))
      .catch(() => setError("Couldn't load lifts."));
  }, []);
  useEffect(load, [load]);
  useRefreshOn(load, { kinds: ["workout", "weight"] });

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading lifts…</p>;

  const counts = data.lifts.reduce<Record<string, number>>((c, l) => ({ ...c, [l.status]: (c[l.status] ?? 0) + 1 }), {});
  const shown = all ? data.lifts : data.lifts.slice(0, SHOWN);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Lifts</h2>
        <p className="text-xs text-muted">
          {[
            counts.progressing && `${counts.progressing} progressing`,
            counts.stalled && `${counts.stalled} stalled`,
            counts.regressing && `${counts.regressing} slipping`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {data.lifts.length === 0 && <p className="text-sm text-muted">Lifts show here once one has two logged sessions with weight.</p>}
      <div className="card divide-y divide-base-700 py-1">
        {shown.map((l) => {
          const s = STATUS[l.status];
          const ratio = l.best && RATIO_PATTERNS.has(l.pattern) ? l.best.e1rm / data.bodyweight : null;
          return (
            <div key={l.name} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink">{l.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>{s.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {l.best && (
                    <>
                      Best {l.best.set} · e1RM {l.best.e1rm}
                      {ratio != null && ` (${ratio.toFixed(2)}× BW)`}
                    </>
                  )}
                  {l.last && l.best && l.last.date !== l.best.date && ` · last ${l.last.set} ${formatShortDate(l.last.date)}`}
                </p>
              </div>
              <Sparkline points={l.points.map((p) => p.e1rm)} />
            </div>
          );
        })}
      </div>
      {data.lifts.length > SHOWN && (
        <button type="button" className="btn-secondary min-h-[44px] w-full text-sm" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${data.lifts.length} lifts`}
        </button>
      )}
      <p className="text-xs text-faint">
        e1RM is the estimated one-rep max from your best set each session. Bodyweight ratios use your latest weigh-in ({data.bodyweight} lb).
      </p>
    </section>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const W = 64;
  const H = 24;
  const pts = points.slice(-10);
  if (pts.length < 2) return <div style={{ width: W }} />;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const span = hi - lo || 1;
  const d = pts
    .map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * (W - 4) + 2).toFixed(1)} ${(H - 2 - ((v - lo) / span) * (H - 4)).toFixed(1)}`)
    .join(" ");
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={up ? "#00e676" : "#ff5277"} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
