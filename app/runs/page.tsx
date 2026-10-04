"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CoachingNote from "@/components/CoachingNote";
import Spinner from "@/components/Spinner";
import type { IntervalSet, Run, RunIntervals } from "@/lib/types";
import { RUN_TYPES } from "@/lib/types";
import { formatDateTime, formatDuration, formatPace, localDateKey } from "@/lib/format";
import { GOAL_PACE_SECONDS_PER_MILE } from "@/lib/marathonPlan";
import {
  describeIntervals,
  emptyIntervalSet,
  emptyIntervals,
  hasIntervalData,
  setRepPaceSeconds,
} from "@/lib/intervals";

const RUN_TYPE_COLORS: Record<string, string> = {
  Easy: "bg-run/20 text-run",
  Tempo: "bg-fuel/20 text-fuel",
  Long: "bg-accent/20 text-accent",
  "Marathon Pace": "bg-pink-500/20 text-pink-300",
  Interval: "bg-purple-500/20 text-purple-300",
  Race: "bg-red-500/20 text-red-300",
  Other: "bg-gray-500/20 text-gray-300",
};

const FEEL_CHIPS = [
  { emoji: "🔥", label: "Great" },
  { emoji: "😊", label: "Good" },
  { emoji: "😐", label: "Okay" },
  { emoji: "😓", label: "Tough" },
  { emoji: "💀", label: "Rough" },
];

// Goal marathon pace is 8:01/mi (481s). Green = at or ahead of goal, amber =
// within 60s of it, red = more than 60s slower. Applied uniformly regardless
// of run type, matching the reference artifact's simple at-a-glance coding.
function paceColorClass(paceSecondsPerMile: number | null | undefined): string {
  if (!paceSecondsPerMile) return "text-gray-300";
  const diff = paceSecondsPerMile - GOAL_PACE_SECONDS_PER_MILE;
  if (diff <= 0) return "text-accent";
  if (diff <= 60) return "text-fuel";
  return "text-danger";
}

function todayISO(): string {
  return localDateKey(new Date());
}

// Accepts "H:MM:SS", "MM:SS", or a bare number of seconds/minutes.
function parseClock(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

// Formats a raw digit string (no colons) as a clock value, building from the
// right: last 2 digits are seconds, the next 2 are minutes, anything left
// over is hours. "10517" -> "1:05:17", "844" -> "8:44". Deleting the last
// digit and reformatting naturally shortens it, so this doubles as the
// backspace behavior too.
function digitsToClock(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, d.length - 2)}:${d.slice(-2)}`;
  return `${d.slice(0, d.length - 4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

interface FormState {
  distance: string;
  duration: string; // raw digits, e.g. "10517" for 1:05:17 — see digitsToClock
  pace: string; // raw digits, e.g. "844" for 8:44
  avgHr: string;
  maxHr: string;
  cadence: string;
  elevGain: string;
  elevLoss: string;
  calories: string;
  temp: string;
  humidity: string;
  surface: string;
  shoes: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  distance: "",
  duration: "",
  pace: "",
  avgHr: "",
  maxHr: "",
  cadence: "",
  elevGain: "",
  elevLoss: "",
  calories: "",
  temp: "",
  humidity: "",
  surface: "",
  shoes: "",
  notes: "",
};

export default function RunsPage() {
  const [date, setDate] = useState(todayISO());
  const [runType, setRunType] = useState<string>("");
  const [feel, setFeel] = useState<string>("");
  const [intervals, setIntervals] = useState<RunIntervals>(emptyIntervals);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Run | null>(null);
  const [recent, setRecent] = useState<Run[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [shoeOptions, setShoeOptions] = useState<{ shoes: string; miles: number }[]>([]);
  const [addingShoe, setAddingShoe] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteSaved, setFavoriteSaved] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    setLoadingRecent(true);
    try {
      const [runsJson, shoesJson] = await Promise.all([
        fetch("/api/runs?limit=8").then((res) => res.json()),
        fetch("/api/runs/shoes").then((res) => res.json()),
      ]);
      setRecent(runsJson.runs ?? []);
      setShoeOptions(shoesJson.shoes ?? []);
    } finally {
      setLoadingRecent(false);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFavoriteSaved(false);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_type: runType || null,
          logged_at: new Date(`${date}T12:00:00`).toISOString(),
          distance_miles: form.distance ? Number(form.distance) : null,
          duration_seconds: parseClock(digitsToClock(form.duration)),
          pace_seconds_per_mile: parseClock(digitsToClock(form.pace)),
          avg_hr: form.avgHr ? Number(form.avgHr) : null,
          max_hr: form.maxHr ? Number(form.maxHr) : null,
          cadence_spm: form.cadence ? Number(form.cadence) : null,
          elev_gain_ft: form.elevGain ? Number(form.elevGain) : null,
          elev_loss_ft: form.elevLoss ? Number(form.elevLoss) : null,
          calories: form.calories ? Number(form.calories) : null,
          temp_f: form.temp ? Number(form.temp) : null,
          humidity_pct: form.humidity ? Number(form.humidity) : null,
          surface: form.surface || null,
          shoes: form.shoes || null,
          notes: form.notes || null,
          feel: feel || null,
          intervals: hasIntervalData(intervals) ? intervals : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to log run.");
      setLastSaved(json.run);
      setForm(EMPTY_FORM);
      setRunType("");
      setFeel("");
      setIntervals(emptyIntervals());
      setAddingShoe(false);
      setDate(todayISO());
      loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function copyLastRun() {
    const last = recent[0];
    if (!last) return;
    setRunType(last.run_type ?? "");
    setForm((prev) => ({ ...prev, surface: last.surface ?? "", shoes: last.shoes ?? "" }));
  }

  // Nothing on this form is required — not even the run type. The only bar
  // for logging is that *something* was entered, so an accidental tap on an
  // empty form doesn't create a blank run.
  const hasAnyInput =
    Object.values(form).some((v) => v.trim() !== "") || !!runType || !!feel || hasIntervalData(intervals);

  function updateIntervals(patch: Partial<RunIntervals>) {
    setIntervals((prev) => ({ ...prev, ...patch }));
  }

  function updateSegment(which: "warmup" | "cooldown", patch: Partial<{ distance_miles: number | null; pace_seconds_per_mile: number | null }>) {
    setIntervals((prev) => ({
      ...prev,
      [which]: {
        distance_miles: prev[which]?.distance_miles ?? null,
        pace_seconds_per_mile: prev[which]?.pace_seconds_per_mile ?? null,
        ...patch,
      },
    }));
  }

  function updateSet(index: number, patch: Partial<IntervalSet>) {
    setIntervals((prev) => ({
      ...prev,
      sets: prev.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  function addSet() {
    setIntervals((prev) => ({ ...prev, sets: [...prev.sets, emptyIntervalSet()] }));
  }

  function removeSet(index: number) {
    setIntervals((prev) => ({
      ...prev,
      sets: prev.sets.length === 1 ? [emptyIntervalSet()] : prev.sets.filter((_, i) => i !== index),
    }));
  }

  const filteredRecent = recent.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.run_type, r.surface, r.shoes, r.notes, r.feel].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
  });

  async function saveFavorite() {
    if (!lastSaved) return;
    setSavingFavorite(true);
    try {
      const name = window.prompt(
        "Name this favorite:",
        `${lastSaved.distance_miles ?? "?"}mi ${lastSaved.run_type ?? "run"}`
      );
      if (!name) return;
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "run",
          name,
          raw_text: lastSaved.raw_text,
          data: {
            run_type: lastSaved.run_type,
            distance_miles: lastSaved.distance_miles,
            duration_seconds: lastSaved.duration_seconds,
            pace_seconds_per_mile: lastSaved.pace_seconds_per_mile,
            avg_hr: lastSaved.avg_hr,
            max_hr: lastSaved.max_hr,
            cadence_spm: lastSaved.cadence_spm,
            elev_gain_ft: lastSaved.elev_gain_ft,
            elev_loss_ft: lastSaved.elev_loss_ft,
            calories: lastSaved.calories,
            temp_f: lastSaved.temp_f,
            humidity_pct: lastSaved.humidity_pct,
            surface: lastSaved.surface,
            shoes: lastSaved.shoes,
            feel: lastSaved.feel,
            notes: lastSaved.notes,
            coaching_feedback: lastSaved.coaching_feedback,
          },
        }),
      });
      setFavoriteSaved(true);
    } finally {
      setSavingFavorite(false);
    }
  }

  return (
    <div>
      <PageHeader title="Log a Run" subtitle="Fill in whatever you've got — nothing is required." />

      <form onSubmit={handleSubmit} className="px-4">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date</label>
            <input
              type="date"
              className="input-field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
            />
          </div>
          <button
            type="button"
            onClick={copyLastRun}
            disabled={submitting || recent.length === 0}
            className="whitespace-nowrap rounded-xl border border-base-600 bg-base-800 px-3 py-3 text-sm font-medium text-gray-300 active:border-accent active:text-accent disabled:opacity-40"
          >
            Copy last run
          </button>
        </div>

        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Run Type</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {RUN_TYPES.map((rt) => (
            <button
              key={rt}
              type="button"
              onClick={() => setRunType(rt)}
              disabled={submitting}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                runType === rt
                  ? "border-accent bg-accent text-white"
                  : "border-base-600 bg-base-800 text-gray-300 active:border-accent"
              }`}
            >
              {rt}
            </button>
          ))}
        </div>

        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Feel</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {FEEL_CHIPS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFeel((prev) => (prev === f.label ? "" : f.label))}
              disabled={submitting}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                feel === f.label
                  ? "border-accent bg-accent text-white"
                  : "border-base-600 bg-base-800 text-gray-300 active:border-accent"
              }`}
            >
              {f.emoji} {f.label}
            </button>
          ))}
        </div>

        {runType === "Interval" && (
          <IntervalEditor
            intervals={intervals}
            disabled={submitting}
            onModeChange={(mode) => updateIntervals({ mode })}
            onSegmentChange={updateSegment}
            onQuickPaceChange={(which, seconds) =>
              updateIntervals(
                which === "work" ? { work_pace_seconds_per_mile: seconds } : { recovery_pace_seconds_per_mile: seconds }
              )
            }
            onSetChange={updateSet}
            onAddSet={addSet}
            onRemoveSet={removeSet}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Distance (mi)" value={form.distance} onChange={(v) => updateField("distance", v)} placeholder="6.2" disabled={submitting} />
          <ClockField label="Duration (h:mm:ss)" digits={form.duration} onChange={(v) => updateField("duration", v)} placeholder="0:54:10" disabled={submitting} />
          <ClockField label="Avg Pace (mm:ss)" digits={form.pace} onChange={(v) => updateField("pace", v)} placeholder="8:44" disabled={submitting} />
          <Field label="Avg HR (bpm)" value={form.avgHr} onChange={(v) => updateField("avgHr", v)} placeholder="152" disabled={submitting} />
          <Field label="Max HR (bpm)" value={form.maxHr} onChange={(v) => updateField("maxHr", v)} placeholder="174" disabled={submitting} />
          <Field label="Cadence (spm)" value={form.cadence} onChange={(v) => updateField("cadence", v)} placeholder="172" disabled={submitting} />
          <Field label="Elev Gain (ft)" value={form.elevGain} onChange={(v) => updateField("elevGain", v)} placeholder="280" disabled={submitting} />
          <Field label="Elev Loss (ft)" value={form.elevLoss} onChange={(v) => updateField("elevLoss", v)} placeholder="265" disabled={submitting} />
          <Field label="Calories" value={form.calories} onChange={(v) => updateField("calories", v)} placeholder="620" disabled={submitting} />
          <Field label="Temp (°F)" value={form.temp} onChange={(v) => updateField("temp", v)} placeholder="72" disabled={submitting} />
          <Field label="Humidity (%)" value={form.humidity} onChange={(v) => updateField("humidity", v)} placeholder="55" disabled={submitting} />
          <Field label="Surface" value={form.surface} onChange={(v) => updateField("surface", v)} placeholder="road, trail…" disabled={submitting} type="text" />
          <ShoeField
            value={form.shoes}
            options={shoeOptions}
            addingNew={addingShoe}
            onSelect={(v) => {
              setAddingShoe(false);
              updateField("shoes", v);
            }}
            onAddNew={() => {
              setAddingShoe(true);
              updateField("shoes", "");
            }}
            onTypeNew={(v) => updateField("shoes", v)}
            disabled={submitting}
          />
        </div>

        <label className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes (optional)</label>
        <textarea
          className="input-field min-h-[70px] resize-none"
          placeholder="Felt great, negative split the last 2 miles…"
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          disabled={submitting}
        />

        <button type="submit" className="btn-primary mt-4 w-full" disabled={submitting || !hasAnyInput}>
          {submitting ? "Getting coaching feedback…" : "Log Run"}
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </form>

      {submitting && <Spinner label="Claude is reviewing your run…" />}

      {lastSaved && !submitting && (
        <div className="mt-5 px-4">
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className={`pill ${RUN_TYPE_COLORS[lastSaved.run_type ?? "Other"] ?? RUN_TYPE_COLORS.Other}`}>
                {lastSaved.run_type ?? "run"}
              </span>
              <button
                onClick={saveFavorite}
                disabled={savingFavorite || favoriteSaved}
                className="text-xs font-medium text-gray-400 active:text-accent"
              >
                {favoriteSaved ? "★ Saved" : "☆ Save as favorite"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-white">{lastSaved.distance_miles ?? "—"}</p>
                <p className="text-[11px] text-gray-500">miles</p>
              </div>
              <div>
                <p className="text-lg font-bold text-white">{formatDuration(lastSaved.duration_seconds)}</p>
                <p className="text-[11px] text-gray-500">time</p>
              </div>
              <div>
                <p className={`text-lg font-bold ${paceColorClass(lastSaved.pace_seconds_per_mile)}`}>
                  {formatPace(lastSaved.pace_seconds_per_mile)}
                </p>
                <p className="text-[11px] text-gray-500">pace</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-gray-500">
              {lastSaved.avg_hr && <span>Avg HR {lastSaved.avg_hr}</span>}
              {lastSaved.max_hr && <span>Max HR {lastSaved.max_hr}</span>}
              {lastSaved.cadence_spm && <span>Cadence {lastSaved.cadence_spm} spm</span>}
              {(lastSaved.elev_gain_ft || lastSaved.elev_loss_ft) && (
                <span>
                  Elev +{lastSaved.elev_gain_ft ?? 0}/-{lastSaved.elev_loss_ft ?? 0} ft
                </span>
              )}
              {lastSaved.calories && <span>{lastSaved.calories} cal</span>}
              {lastSaved.surface && <span className="capitalize">{lastSaved.surface}</span>}
              {lastSaved.shoes && <span>{lastSaved.shoes}</span>}
              {lastSaved.feel && <span>{FEEL_CHIPS.find((f) => f.label === lastSaved.feel)?.emoji} {lastSaved.feel}</span>}
            </div>
            {lastSaved.intervals && (
              <p className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-2 text-xs text-gray-300">
                {describeIntervals(lastSaved.intervals)}
              </p>
            )}
            {lastSaved.pace_note && <p className="mt-2 text-center text-xs text-gray-500">{lastSaved.pace_note}</p>}
            <CoachingNote
              feedback={lastSaved.coaching_feedback}
              vsLastTime={lastSaved.vs_last_time}
              adjustments={lastSaved.adjustments}
            />
          </div>
        </div>
      )}

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Recent Runs</h2>
        <input
          type="text"
          className="input-field mb-3"
          placeholder="Search by type, surface, shoes, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {loadingRecent ? (
          <Spinner />
        ) : recent.length === 0 ? (
          <p className="text-sm text-gray-500">No runs logged yet.</p>
        ) : filteredRecent.length === 0 ? (
          <p className="text-sm text-gray-500">No runs match “{search}”.</p>
        ) : (
          <div className="space-y-2">
            {filteredRecent.map((r) => (
              <div key={r.id} className="card flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`pill ${RUN_TYPE_COLORS[r.run_type ?? "Other"] ?? RUN_TYPE_COLORS.Other}`}>
                      {r.run_type ?? "run"}
                    </span>
                    <span className="text-xs text-gray-500">{formatDateTime(r.logged_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-300">
                    {r.distance_miles ?? "?"} mi ·{" "}
                    <span className={paceColorClass(r.pace_seconds_per_mile)}>{formatPace(r.pace_seconds_per_mile)}</span> ·{" "}
                    {formatDuration(r.duration_seconds)}
                    {r.shoes ? ` · ${r.shoes}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  type = "number",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "number" | "text";
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      <input
        type={type === "number" ? "text" : "text"}
        inputMode={type === "number" ? "decimal" : "text"}
        className="input-field"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

// Type digits straight through and it auto-formats as a clock value
// (e.g. "10517" -> "1:05:17"). `digits` is the raw, unformatted state;
// the displayed value is always the formatted version.
function ClockField({
  label,
  digits,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  digits: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className="input-field"
        placeholder={placeholder}
        value={digitsToClock(digits)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        disabled={disabled}
      />
    </div>
  );
}

// ── Interval session editor ─────────────────────────────────────────────
// Shown only for Interval runs. Two modes, because an interval session is
// run at several different paces and how much detail you want to capture
// varies: "Quick" records one pace per effort type, "Detailed" records each
// repeat set so ladders and mixed sessions survive intact.

function secondsToDigits(total: number | null): string {
  if (total == null || total <= 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round(total % 60);
  if (h > 0) return `${h}${String(m).padStart(2, "0")}${String(s).padStart(2, "0")}`;
  if (m > 0) return `${m}${String(s).padStart(2, "0")}`;
  return String(s);
}

// Masked clock input that talks in seconds instead of raw digits. Internal
// digit state is seeded from the incoming value on mount, so switching run
// type away and back doesn't blank out what's already entered.
function SecondsClockField({
  label,
  seconds,
  onChange,
  placeholder,
  disabled,
  compact,
}: {
  label: string;
  seconds: number | null;
  onChange: (seconds: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [digits, setDigits] = useState(() => secondsToDigits(seconds));

  return (
    <div>
      <label className={`mb-1 block font-semibold uppercase tracking-wide text-gray-500 ${compact ? "text-[10px]" : "text-xs"}`}>
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        className="input-field"
        placeholder={placeholder}
        value={digitsToClock(digits)}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "");
          setDigits(next);
          onChange(parseClock(digitsToClock(next)));
        }}
        disabled={disabled}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  compact,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [text, setText] = useState(() => (value == null ? "" : String(value)));

  return (
    <div>
      <label className={`mb-1 block font-semibold uppercase tracking-wide text-gray-500 ${compact ? "text-[10px]" : "text-xs"}`}>
        {label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        className="input-field"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const n = Number(next);
          onChange(next.trim() === "" || !Number.isFinite(n) ? null : n);
        }}
        disabled={disabled}
      />
    </div>
  );
}

function IntervalEditor({
  intervals,
  disabled,
  onModeChange,
  onSegmentChange,
  onQuickPaceChange,
  onSetChange,
  onAddSet,
  onRemoveSet,
}: {
  intervals: RunIntervals;
  disabled?: boolean;
  onModeChange: (mode: RunIntervals["mode"]) => void;
  onSegmentChange: (
    which: "warmup" | "cooldown",
    patch: Partial<{ distance_miles: number | null; pace_seconds_per_mile: number | null }>
  ) => void;
  onQuickPaceChange: (which: "work" | "recovery", seconds: number | null) => void;
  onSetChange: (index: number, patch: Partial<IntervalSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (index: number) => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-purple-300">Intervals</span>
        <div className="flex gap-1 rounded-lg bg-base-800 p-0.5">
          {(["quick", "detailed"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              disabled={disabled}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                intervals.mode === m ? "bg-accent text-base-950" : "text-gray-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <NumField
          label="Warmup (mi)"
          compact
          value={intervals.warmup?.distance_miles ?? null}
          onChange={(v) => onSegmentChange("warmup", { distance_miles: v })}
          placeholder="1.5"
          disabled={disabled}
        />
        <SecondsClockField
          label="Warmup pace"
          compact
          seconds={intervals.warmup?.pace_seconds_per_mile ?? null}
          onChange={(v) => onSegmentChange("warmup", { pace_seconds_per_mile: v })}
          placeholder="9:40"
          disabled={disabled}
        />
      </div>

      {intervals.mode === "quick" ? (
        <div className="grid grid-cols-2 gap-2">
          <SecondsClockField
            label="Work pace"
            compact
            seconds={intervals.work_pace_seconds_per_mile}
            onChange={(v) => onQuickPaceChange("work", v)}
            placeholder="6:12"
            disabled={disabled}
          />
          <SecondsClockField
            label="Recovery pace"
            compact
            seconds={intervals.recovery_pace_seconds_per_mile}
            onChange={(v) => onQuickPaceChange("recovery", v)}
            placeholder="10:30"
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {intervals.sets.map((set, i) => {
            const pace = setRepPaceSeconds(set);
            return (
              <div key={i} className="rounded-xl border border-base-700 bg-base-900 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Set {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveSet(i)}
                    disabled={disabled}
                    className="text-xs text-gray-600 active:text-danger"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumField
                    label="Reps"
                    compact
                    value={set.reps}
                    onChange={(v) => onSetChange(i, { reps: v })}
                    placeholder="6"
                    disabled={disabled}
                  />
                  <NumField
                    label="Distance"
                    compact
                    value={set.distance_value}
                    onChange={(v) => onSetChange(i, { distance_value: v })}
                    placeholder="800"
                    disabled={disabled}
                  />
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Unit</label>
                    <div className="flex gap-1 rounded-xl bg-base-800 p-0.5">
                      {(["m", "mi"] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => onSetChange(i, { distance_unit: u })}
                          disabled={disabled}
                          className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                            set.distance_unit === u ? "bg-accent text-base-950" : "text-gray-400"
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <SecondsClockField
                    label="Time / rep"
                    compact
                    seconds={set.rep_seconds}
                    onChange={(v) => onSetChange(i, { rep_seconds: v })}
                    placeholder="3:05"
                    disabled={disabled}
                  />
                  <SecondsClockField
                    label="Recovery"
                    compact
                    seconds={set.recovery_seconds}
                    onChange={(v) => onSetChange(i, { recovery_seconds: v })}
                    placeholder="2:00"
                    disabled={disabled}
                  />
                </div>
                {pace && (
                  <p className={`mt-2 text-xs font-medium ${paceColorClass(pace)}`}>→ {formatPace(pace)} per rep</p>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={onAddSet}
            disabled={disabled}
            className="w-full rounded-xl border border-dashed border-base-600 py-2 text-xs font-medium text-gray-400 active:border-accent active:text-accent"
          >
            + Add set
          </button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumField
          label="Cooldown (mi)"
          compact
          value={intervals.cooldown?.distance_miles ?? null}
          onChange={(v) => onSegmentChange("cooldown", { distance_miles: v })}
          placeholder="1.0"
          disabled={disabled}
        />
        <SecondsClockField
          label="Cooldown pace"
          compact
          seconds={intervals.cooldown?.pace_seconds_per_mile ?? null}
          onChange={(v) => onSegmentChange("cooldown", { pace_seconds_per_mile: v })}
          placeholder="10:05"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// Picking a previously-used pair rather than retyping it is what keeps one
// pair from fragmenting into several spellings and splitting its mileage in
// the Marathon tab's shoe tracker. Mileage rides along in the option text so
// a pair nearing the ~350mi retirement mark is visible at the point of entry.
function ShoeField({
  value,
  options,
  addingNew,
  onSelect,
  onAddNew,
  onTypeNew,
  disabled,
}: {
  value: string;
  options: { shoes: string; miles: number }[];
  addingNew: boolean;
  onSelect: (value: string) => void;
  onAddNew: () => void;
  onTypeNew: (value: string) => void;
  disabled?: boolean;
}) {
  // An existing run being edited may carry a shoe that predates this list.
  const known = options.some((o) => o.shoes === value);
  const showNewInput = addingNew || (!!value && !known);

  return (
    // Full row — shoe names plus mileage don't fit a half-width field.
    <div className="col-span-2">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Shoes</label>
      {showNewInput ? (
        <div className="flex gap-1">
          <input
            type="text"
            className="input-field"
            placeholder="Brooks Ghost 15"
            value={value}
            onChange={(e) => onTypeNew(e.target.value)}
            disabled={disabled}
            autoFocus={addingNew}
          />
          {options.length > 0 && (
            <button
              type="button"
              onClick={() => onSelect("")}
              disabled={disabled}
              className="shrink-0 rounded-xl border border-base-600 bg-base-800 px-2 text-xs text-gray-400 active:text-accent"
              aria-label="Back to shoe list"
            >
              ↩
            </button>
          )}
        </div>
      ) : (
        <select
          className="input-field"
          value={value}
          onChange={(e) => (e.target.value === "__new__" ? onAddNew() : onSelect(e.target.value))}
          disabled={disabled}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.shoes} value={o.shoes}>
              {o.shoes}
              {o.miles > 0 ? ` · ${o.miles} mi` : ""}
            </option>
          ))}
          <option value="__new__">+ Add new shoe</option>
        </select>
      )}
    </div>
  );
}
