"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import UndoToast from "@/components/UndoToast";
import { formatShortDate, localDateKey } from "@/lib/format";
import { parseWeight, weightSummary, type WeighIn } from "@/lib/weight";

const lb = (n: number) => `${Math.round(n * 10) / 10}`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${lb(Math.abs(n))}`;

/** Log a weigh-in and see the trend. One weigh-in per day; a second replaces the first. */
export default function WeightCard() {
  const [entries, setEntries] = useState<WeighIn[] | null>(null);
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => localDateKey(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WeighIn | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/weight", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load weigh-ins.");
      setEntries(json.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load weigh-ins.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (entries ?? []).filter((e) => e.date !== pendingDelete?.date),
    [entries, pendingDelete]
  );
  const summary = useMemo(() => weightSummary(visible), [visible]);

  async function save() {
    const weight = parseWeight(text);
    if (weight == null) {
      setError("Enter a weight in pounds, e.g. 158.4");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, weight_lb: weight }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      setText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const { latest, changeSinceStart, ratePerWeek, first } = summary;
  const recent = summary.points.slice(-5).reverse();

  return (
    <div className="card space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-gray-400">Body weight</p>
        {latest && <p className="text-xs text-muted">Trend {lb(latest.trend)} lb</p>}
      </div>

      {latest && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-lg font-bold tabular-nums text-ink">{lb(latest.weight_lb)}</p>
            <p className="text-xs text-muted">lb, {formatShortDate(latest.date)}</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-ink">{changeSinceStart == null ? "—" : signed(changeSinceStart)}</p>
            <p className="text-xs text-muted">since {first ? formatShortDate(first.date) : "start"}</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums text-ink">{ratePerWeek == null ? "—" : signed(ratePerWeek)}</p>
            <p className="text-xs text-muted">lb/week, last 4 wk</p>
          </div>
        </div>
      )}

      {summary.points.length >= 2 && <WeightChart points={summary.points} />}

      <div className="flex gap-2">
        <input
          className="input-field min-h-[44px] flex-1"
          inputMode="decimal"
          placeholder="Weight (lb)"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <input
          type="date"
          className="input-field min-h-[44px] w-[9.5rem]"
          value={date}
          max={localDateKey(new Date())}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </div>
      <button type="button" className="btn-primary min-h-[44px] w-full text-sm" disabled={saving || !text} onClick={save}>
        {saving ? "Saving…" : "Log weigh-in"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {entries == null && !error && <p className="text-sm text-muted">Loading…</p>}
      {entries && visible.length === 0 && <p className="text-sm text-muted">No weigh-ins yet.</p>}

      {recent.length > 0 && (
        <ul className="divide-y divide-base-700">
          {recent.map((p) => (
            <li key={p.date} className="flex min-h-[44px] items-center justify-between gap-3">
              <span className="text-sm text-muted">{formatShortDate(p.date)}</span>
              <span className="flex-1 truncate text-xs text-faint">{p.note}</span>
              <span className="text-sm font-semibold tabular-nums text-ink">{lb(p.weight_lb)} lb</span>
              <button
                type="button"
                className="min-h-[44px] min-w-[44px] text-sm text-faint hover:text-danger"
                aria-label={`Delete weigh-in on ${p.date}`}
                onClick={() => setPendingDelete(p)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-faint">
        Weigh in first thing in the morning, a few times a week. Day to day swings are mostly water; the trend line evens them out.
      </p>

      {pendingDelete && (
        <UndoToast
          label={`Deleted ${lb(pendingDelete.weight_lb)} lb (${formatShortDate(pendingDelete.date)})`}
          onUndo={() => setPendingDelete(null)}
          onExpire={async () => {
            const d = pendingDelete.date;
            await fetch(`/api/weight/${d}`, { method: "DELETE" });
            setPendingDelete(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

const DAY_MS = 86_400_000;

function WeightChart({ points }: { points: { date: string; weight_lb: number; trend: number }[] }) {
  const W = 320;
  const H = 120;
  const pad = { l: 30, r: 8, t: 8, b: 18 };
  const t = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const x0 = t(points[0].date);
  const x1 = Math.max(t(points[points.length - 1].date), x0 + DAY_MS);
  const ws = points.flatMap((p) => [p.weight_lb, p.trend]);
  const lo = Math.floor(Math.min(...ws) - 1);
  const hi = Math.ceil(Math.max(...ws) + 1);
  const x = (d: string) => pad.l + ((t(d) - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const y = (w: number) => pad.t + ((hi - w) / (hi - lo)) * (H - pad.t - pad.b);
  const trendPath = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.trend).toFixed(1)}`).join(" ");
  const ticks = [hi, Math.round((hi + lo) / 2), lo];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Weight trend">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#242424" strokeWidth={1} />
          <text x={pad.l - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#6b6b6b">
            {v}
          </text>
        </g>
      ))}
      <text x={pad.l} y={H - 4} fontSize={9} fill="#6b6b6b">
        {formatShortDate(points[0].date)}
      </text>
      <text x={W - pad.r} y={H - 4} fontSize={9} fill="#6b6b6b" textAnchor="end">
        {formatShortDate(points[points.length - 1].date)}
      </text>
      <path d={trendPath} fill="none" stroke="#00e676" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.weight_lb)} r={2.5} fill="#f5f5f5" />
      ))}
    </svg>
  );
}
