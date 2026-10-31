"use client";

import { useEffect, useState } from "react";
import type { Run } from "@/lib/types";
import { FEEL_CHIPS, RUN_TYPES } from "@/lib/types";
import { formatLoggedAt, formatPace } from "@/lib/format";
import { digitsToClock, parseClock, secondsToDigits } from "@/lib/clock";
import { formatPaceRange, type PlannedRun } from "@/lib/planner/runPlan";

export interface PendingItem {
  run: Run;
  planned: { title: string; run: PlannedRun | null } | null;
}

/** "Planned: Tempo 5 mi @ 7:20–7:40 — 1 mi easy · 3 mi tempo · 1 mi easy" */
export function plannedLine(planned: PendingItem["planned"]): string | null {
  if (!planned) return null;
  const r = planned.run;
  if (!r) return `Planned: ${planned.title} (no run)`;
  return [
    `Planned: ${r.type}`,
    r.miles ? `${r.miles} mi` : null,
    r.pace ? `@ ${formatPaceRange(r.pace)}` : null,
    r.structure ? `— ${r.structure}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** A few of Garmin's extras, to help judge how it felt. */
export function garminLine(run: Run): string | null {
  const g = (run.garmin_data ?? {}) as Record<string, number | null | undefined>;
  const bits = [
    g.fastestMileSeconds ? `fastest mile ${formatPace(g.fastestMileSeconds).replace("/mi", "")}` : null,
    g.aerobicTrainingEffect ? `aerobic TE ${g.aerobicTrainingEffect}` : null,
    g.trainingLoad ? `load ${g.trainingLoad}` : null,
    g.bodyBatteryChange ? `Body Battery ${g.bodyBatteryChange}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}

/**
 * A just-imported Garmin run, ready to confirm. Everything is prefilled;
 * the athlete adds feel, fixes anything, and confirms — which is when the
 * coaching is written, for the run type they chose. The X closes it and
 * leaves the run waiting on the Runs tab.
 */
export default function PendingRunReview({
  item,
  onClose,
  onDelete,
  onConfirmed,
}: {
  item: PendingItem;
  onClose: () => void;
  onDelete: () => void;
  onConfirmed: (run: Run) => void;
}) {
  const { run, planned } = item;
  const [runType, setRunType] = useState(run.run_type ?? "");
  const [feel, setFeel] = useState(run.feel ?? "");
  const [distance, setDistance] = useState(run.distance_miles == null ? "" : String(run.distance_miles));
  const [duration, setDuration] = useState(secondsToDigits(run.duration_seconds));
  const [pace, setPace] = useState(secondsToDigits(run.pace_seconds_per_mile));
  const [avgHr, setAvgHr] = useState(run.avg_hr == null ? "" : String(run.avg_hr));
  const [shoes, setShoes] = useState(run.shoes ?? "");
  const [notes, setNotes] = useState(run.notes ?? "");
  const [shoeOptions, setShoeOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Run | null>(null);

  useEffect(() => {
    fetch("/api/runs/shoes")
      .then((r) => r.json())
      .then((j) => setShoeOptions(((j.shoes ?? []) as { shoes: string }[]).map((s) => s.shoes)))
      .catch(() => {});
  }, []);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const distanceChanged = distance.trim() !== (run.distance_miles == null ? "" : String(run.distance_miles));
      const durationChanged = duration !== secondsToDigits(run.duration_seconds);
      const paceChanged = pace !== secondsToDigits(run.pace_seconds_per_mile);
      const res = await fetch(`/api/runs/${run.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_type: runType || null,
          feel: feel || null,
          distance_miles: distance || null,
          duration_seconds: paceChanged && !distanceChanged && !durationChanged ? null : parseClock(digitsToClock(duration)),
          // Whichever of distance / time / pace wasn't touched follows the others.
          pace_seconds_per_mile: (distanceChanged || durationChanged) && !paceChanged ? null : parseClock(digitsToClock(pace)),
          avg_hr: avgHr || null,
          max_hr: run.max_hr,
          cadence_spm: run.cadence_spm,
          elev_gain_ft: run.elev_gain_ft,
          elev_loss_ft: run.elev_loss_ft,
          calories: run.calories,
          temp_f: run.temp_f,
          humidity_pct: run.humidity_pct,
          surface: run.surface,
          shoes: shoes || null,
          notes: notes || null,
          intervals: run.intervals,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't confirm the run.");
      setDone(json.run);
      onConfirmed(json.run);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const plan = plannedLine(planned);
  const extras = garminLine(run);
  const offPlan = planned?.run && runType && runType !== planned.run.type;
  const chip = (active: boolean) =>
    `min-h-[40px] rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
      active ? "border-accent bg-accent text-base-950" : "border-base-600 bg-base-800 text-gray-300"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" role="dialog" aria-modal="true" aria-label="New run from Garmin">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-base-700 bg-base-900 p-4 pb-8">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">New run from Garmin</p>
            <h2 className="text-lg font-semibold text-ink">
              {run.distance_miles ?? "?"} mi · {formatLoggedAt(run.logged_at, run.created_at)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close — review later on the Runs tab"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-base-800 text-xl text-muted active:text-ink"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-accent">Saved.</p>
            {done.coaching_feedback && <p className="text-sm leading-snug text-ink">{done.coaching_feedback}</p>}
            {done.pace_note && <p className="text-xs text-muted">{done.pace_note}</p>}
            <button type="button" onClick={onClose} className="btn-primary w-full">
              Done
            </button>
          </div>
        ) : (
          <>
            {plan && <p className="mb-1 text-xs text-muted">{plan}</p>}
            {extras && <p className="mb-3 text-[11px] text-faint">Garmin: {extras}</p>}

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Run type</p>
            <div className="mb-1 flex flex-wrap gap-2">
              {RUN_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => setRunType(t)} className={chip(runType === t)} disabled={saving}>
                  {t}
                </button>
              ))}
            </div>
            {offPlan && (
              <p className="mb-2 text-[11px] text-fuel">
                Different from the plan — coaching will follow {runType}, and the planned {planned!.run!.type.toLowerCase()} moves later in
                the week.
              </p>
            )}

            <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">How did it feel?</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {FEEL_CHIPS.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setFeel((cur) => (cur === f.label ? "" : f.label))}
                  className={chip(feel === f.label)}
                  disabled={saving}
                >
                  {f.emoji} {f.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Distance (mi)">
                <input className="input-field" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} disabled={saving} />
              </Labeled>
              <Labeled label="Duration">
                <input
                  className="input-field"
                  inputMode="numeric"
                  value={digitsToClock(duration)}
                  onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))}
                  disabled={saving}
                />
              </Labeled>
              <Labeled label="Avg pace">
                <input
                  className="input-field"
                  inputMode="numeric"
                  value={digitsToClock(pace)}
                  onChange={(e) => setPace(e.target.value.replace(/\D/g, ""))}
                  disabled={saving}
                />
              </Labeled>
              <Labeled label="Avg HR">
                <input className="input-field" inputMode="numeric" value={avgHr} onChange={(e) => setAvgHr(e.target.value)} disabled={saving} />
              </Labeled>
              <div className="col-span-2">
                <Labeled label="Shoes">
                  <select className="input-field" value={shoes} onChange={(e) => setShoes(e.target.value)} disabled={saving}>
                    <option value="">—</option>
                    {Array.from(new Set([...(shoes ? [shoes] : []), ...shoeOptions])).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Labeled>
              </div>
            </div>

            <div className="mt-3">
              <Labeled label="Notes">
                <textarea
                  className="input-field min-h-[60px] resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={saving}
                />
              </Labeled>
            </div>

            <button type="button" onClick={confirm} disabled={saving} className="btn-primary mt-4 w-full">
              {saving ? "Getting coaching feedback…" : "Confirm run"}
            </button>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              className="mt-2 min-h-[44px] w-full text-sm text-gray-500 active:text-danger"
            >
              Delete this run
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
    </div>
  );
}
