"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefreshOn } from "@/lib/refresh";

/** Water over the last 14 days, against today's target as a guide line. */
export default function WaterTrend() {
  const [data, setData] = useState<{ history: { day: string; oz: number }[]; target: { oz: number } } | null>(null);
  const load = useCallback(() => {
    fetch("/api/water?history=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.history && setData(j))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useRefreshOn(load, { kinds: ["water"] });
  if (!data) return null;

  const days = data.history;
  const logged = days.filter((d) => d.oz > 0);
  const avg = logged.length ? Math.round(logged.reduce((s, d) => s + d.oz, 0) / logged.length) : 0;
  const max = Math.max(data.target.oz, ...days.map((d) => d.oz), 1);
  const H = 64;

  return (
    <div className="card space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wide text-gray-400">Water · 14 days</p>
        <p className="text-xs text-muted">{logged.length ? `${avg} oz a day on ${logged.length} logged days` : "Nothing logged yet"}</p>
      </div>
      <div className="relative" style={{ height: H }}>
        <div className="absolute inset-x-0 border-t border-dashed border-base-600" style={{ bottom: (data.target.oz / max) * H }} />
        <div className="flex h-full items-end gap-1">
          {days.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${Math.round(d.oz)} oz`}
              className={`flex-1 rounded-t ${d.oz >= data.target.oz ? "bg-run" : d.oz > 0 ? "bg-run/50" : "bg-base-800"}`}
              style={{ height: Math.max(2, (d.oz / max) * H) }}
            />
          ))}
        </div>
      </div>
      <p className="text-[10px] text-faint">Dashed line: today&apos;s target ({data.target.oz} oz). Full bars hit it.</p>
    </div>
  );
}
