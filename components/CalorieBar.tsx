"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefreshOn } from "@/lib/refresh";
import type { CalorieTarget } from "@/lib/calories";

interface CalorieDay {
  goalLb: number;
  trendLb: number;
  consumed: number;
  target: CalorieTarget;
}

const MODE_LABEL: Record<CalorieTarget["mode"], string> = {
  fuel: "Race season · maintenance",
  trim: "Trimming",
  build: "Building",
};

/** Today's calories against the day's target, with how the target was set. */
export default function CalorieBar() {
  const [day, setDay] = useState<CalorieDay | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/calories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.target && setDay(j))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useRefreshOn(load, { kinds: ["meal", "run", "workout", "weight"] });
  if (!day) return null;

  const t = day.target;
  const left = t.target - day.consumed;
  const over = left < 0;
  const pct = Math.min(100, (day.consumed / Math.max(1, t.target)) * 100);
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <button type="button" onClick={() => setOpen((v) => !v)} className="card block w-full space-y-2 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Calories · {MODE_LABEL[t.mode]}</p>
          <p className="text-lg font-semibold tabular-nums text-ink">
            {fmt(day.consumed)} <span className="text-sm font-normal text-muted">/ {fmt(t.target)}</span>
          </p>
        </div>
        <p className={`shrink-0 whitespace-nowrap text-sm font-medium ${over ? "text-danger" : "text-muted"}`}>{over ? `${fmt(-left)} over` : `${fmt(left)} left`}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-base-800">
        <div className={`h-full rounded-full ${over ? "bg-danger" : "bg-fuel"}`} style={{ width: `${pct}%` }} />
      </div>
      {open && (
        <div className="space-y-1 rounded-lg bg-base-800 p-3 text-xs text-muted">
          <p>
            Baseline {fmt(t.baseline)}
            {t.baselineSource === "estimate" ? " (estimated from your weight until there are a few weeks of weigh-ins and logged meals)" : " (measured from your log and weigh-ins)"}
          </p>
          <p>+ Training {fmt(t.training)}</p>
          <p>
            {t.adjustment >= 0 ? "+" : "−"} {fmt(Math.abs(t.adjustment))} {t.mode === "trim" ? "deficit" : t.mode === "build" ? "surplus" : "(none in race season)"}
          </p>
          <p className="pt-1 text-gray-300">{t.reason}</p>
          <p className="text-faint">
            Goal {day.goalLb} lb · trend {day.trendLb} lb
          </p>
        </div>
      )}
    </button>
  );
}
