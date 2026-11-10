"use client";

import { useCallback, useEffect, useState } from "react";
import type { Band, CheckIn, Readiness } from "@/lib/dailyReadiness";
import { useRefreshOn } from "@/lib/refresh";

interface ReadinessResponse {
  today: string;
  readiness: Readiness;
  checkin: CheckIn | null;
  history: { day: string; score: number; band: Band; checkedIn: boolean }[];
}

const QUESTIONS: { key: keyof Pick<CheckIn, "sleep" | "energy" | "soreness">; label: string; low: string; high: string }[] = [
  { key: "sleep", label: "Sleep", low: "Awful", high: "Great" },
  { key: "energy", label: "Energy", low: "Drained", high: "Fresh" },
  { key: "soreness", label: "Soreness", low: "Very sore", high: "None" },
];

const BAND_COLOR: Record<Band, string> = {
  push: "text-accent",
  normal: "text-ink",
  easy: "text-fuel",
  rest: "text-danger",
};
const DOT_COLOR: Record<Band, string> = { push: "bg-accent", normal: "bg-muted", easy: "bg-fuel", rest: "bg-danger" };

/**
 * Morning readiness: a three-tap check-in, then a 0–100 score with the
 * reasons behind it. `hardToday` names today's hard session, if any, so a
 * low score can say what to do about it.
 */
export default function ReadinessCard({ hardToday }: { hardToday: string | null }) {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [answers, setAnswers] = useState<Partial<CheckIn>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/readiness", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setData(j)))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useRefreshOn(load, { kinds: ["workout", "run"] });

  async function answer(key: keyof CheckIn, value: number) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    // The third tap saves; no button to find.
    if (next.sleep && next.energy && next.soreness) {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/readiness", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sleep: next.sleep, energy: next.energy, soreness: next.soreness }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save.");
        setEditing(false);
        setAnswers({});
        load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save.");
      } finally {
        setSaving(false);
      }
    }
  }

  if (!data) return null;
  const r = data.readiness;
  const asking = !data.checkin || editing;
  const lowDay = r.band === "easy" || r.band === "rest";

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Readiness</p>
          <p className={`text-lg font-semibold ${BAND_COLOR[r.band]}`}>{r.label}</p>
          {r.estimate && <p className="text-xs text-faint">Estimate from training load — check in for the real number</p>}
        </div>
        <div className="text-right">
          <p className={`text-4xl font-bold tabular-nums leading-none ${BAND_COLOR[r.band]}`}>{r.score}</p>
          <div className="mt-2 flex justify-end gap-1" aria-label="Last 7 days">
            {data.history.map((h) => (
              <span
                key={h.day}
                title={`${h.day}: ${h.score}`}
                className={`h-2 w-2 rounded-full ${DOT_COLOR[h.band]} ${h.checkedIn ? "" : "opacity-40"}`}
              />
            ))}
          </div>
        </div>
      </div>

      {asking ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">{data.checkin ? "Update this morning's check-in:" : "How are you this morning? Three taps."}</p>
          {QUESTIONS.map((q) => (
            <div key={q.key}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-semibold text-ink">{q.label}</span>
                <span className="text-faint">
                  {q.low} → {q.high}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((v) => {
                  const on = answers[q.key] === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      disabled={saving}
                      aria-label={`${q.label} ${v} of 5`}
                      aria-pressed={on}
                      onClick={() => answer(q.key, v)}
                      className={`h-11 rounded-xl border text-sm font-semibold ${
                        on ? "border-accent bg-accent text-base-950" : "border-base-600 bg-base-800 text-muted"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {saving && <p className="text-xs text-muted">Saving…</p>}
        </div>
      ) : (
        <>
          {r.reasons.length > 0 && (
            <ul className="space-y-1 text-sm text-gray-300">
              {r.reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span className="text-faint">·</span>
                  {reason}
                </li>
              ))}
            </ul>
          )}
          {lowDay && hardToday && (
            <p className="rounded-lg bg-base-800 p-3 text-sm text-fuel">
              Today has {hardToday}. On a day like this, run it by effort and cut it short if it drags, or swap it with an
              easier day using Replan week.
            </p>
          )}
          {r.band === "push" && hardToday && <p className="text-sm text-accent">Good day for {hardToday}.</p>}
          <button type="button" className="min-h-[44px] text-sm text-faint" onClick={() => setEditing(true)}>
            Edit check-in
          </button>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
