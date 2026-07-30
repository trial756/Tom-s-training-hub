"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CoachingNote from "@/components/CoachingNote";
import Spinner from "@/components/Spinner";
import type { Run } from "@/lib/types";
import { RUN_TYPES } from "@/lib/types";
import { formatDateTime, formatDuration, formatPace } from "@/lib/format";

const RUN_TYPE_COLORS: Record<string, string> = {
  Easy: "bg-run/20 text-run",
  Tempo: "bg-fuel/20 text-fuel",
  Long: "bg-accent/20 text-accent",
  "Marathon Pace": "bg-pink-500/20 text-pink-300",
  Interval: "bg-purple-500/20 text-purple-300",
  Race: "bg-red-500/20 text-red-300",
  Other: "bg-gray-500/20 text-gray-300",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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

interface FormState {
  distance: string;
  duration: string;
  pace: string;
  avgHr: string;
  maxHr: string;
  cadence: string;
  elevGain: string;
  elevLoss: string;
  calories: string;
  temp: string;
  humidity: string;
  surface: string;
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
  notes: "",
};

export default function RunsPage() {
  const [date, setDate] = useState(todayISO());
  const [runType, setRunType] = useState<string>("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Run | null>(null);
  const [recent, setRecent] = useState<Run[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteSaved, setFavoriteSaved] = useState(false);

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/runs?limit=8");
      const json = await res.json();
      setRecent(json.runs ?? []);
    } finally {
      setLoadingRecent(false);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!runType) {
      setError("Pick a run type.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setFavoriteSaved(false);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_type: runType,
          logged_at: new Date(`${date}T12:00:00`).toISOString(),
          distance_miles: form.distance ? Number(form.distance) : null,
          duration_seconds: parseClock(form.duration),
          pace_seconds_per_mile: parseClock(form.pace),
          avg_hr: form.avgHr ? Number(form.avgHr) : null,
          max_hr: form.maxHr ? Number(form.maxHr) : null,
          cadence_spm: form.cadence ? Number(form.cadence) : null,
          elev_gain_ft: form.elevGain ? Number(form.elevGain) : null,
          elev_loss_ft: form.elevLoss ? Number(form.elevLoss) : null,
          calories: form.calories ? Number(form.calories) : null,
          temp_f: form.temp ? Number(form.temp) : null,
          humidity_pct: form.humidity ? Number(form.humidity) : null,
          surface: form.surface || null,
          notes: form.notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to log run.");
      setLastSaved(json.run);
      setForm(EMPTY_FORM);
      setRunType("");
      setDate(todayISO());
      loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

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
      <PageHeader title="Log a Run" subtitle="Pick a type, fill in what you've got." />

      <form onSubmit={handleSubmit} className="px-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date</label>
        <input
          type="date"
          className="input-field mb-4"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={submitting}
        />

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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Distance (mi)" value={form.distance} onChange={(v) => updateField("distance", v)} placeholder="6.2" disabled={submitting} />
          <Field label="Duration (h:mm:ss)" value={form.duration} onChange={(v) => updateField("duration", v)} placeholder="0:54:10" disabled={submitting} />
          <Field label="Avg Pace (mm:ss)" value={form.pace} onChange={(v) => updateField("pace", v)} placeholder="8:44" disabled={submitting} />
          <Field label="Avg HR (bpm)" value={form.avgHr} onChange={(v) => updateField("avgHr", v)} placeholder="152" disabled={submitting} />
          <Field label="Max HR (bpm)" value={form.maxHr} onChange={(v) => updateField("maxHr", v)} placeholder="174" disabled={submitting} />
          <Field label="Cadence (spm)" value={form.cadence} onChange={(v) => updateField("cadence", v)} placeholder="172" disabled={submitting} />
          <Field label="Elev Gain (ft)" value={form.elevGain} onChange={(v) => updateField("elevGain", v)} placeholder="280" disabled={submitting} />
          <Field label="Elev Loss (ft)" value={form.elevLoss} onChange={(v) => updateField("elevLoss", v)} placeholder="265" disabled={submitting} />
          <Field label="Calories" value={form.calories} onChange={(v) => updateField("calories", v)} placeholder="620" disabled={submitting} />
          <Field label="Temp (°F)" value={form.temp} onChange={(v) => updateField("temp", v)} placeholder="72" disabled={submitting} />
          <Field label="Humidity (%)" value={form.humidity} onChange={(v) => updateField("humidity", v)} placeholder="55" disabled={submitting} />
          <Field label="Surface" value={form.surface} onChange={(v) => updateField("surface", v)} placeholder="road, trail…" disabled={submitting} type="text" />
        </div>

        <label className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes (optional)</label>
        <textarea
          className="input-field min-h-[70px] resize-none"
          placeholder="Felt great, negative split the last 2 miles…"
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          disabled={submitting}
        />

        <button type="submit" className="btn-primary mt-4 w-full" disabled={submitting || !runType}>
          {submitting ? "Getting coaching feedback…" : "Log Run"}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
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
                <p className="text-lg font-bold text-white">{formatPace(lastSaved.pace_seconds_per_mile)}</p>
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
            </div>
            <CoachingNote text={lastSaved.coaching_feedback} />
          </div>
        </div>
      )}

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Recent Runs</h2>
        {loadingRecent ? (
          <Spinner />
        ) : recent.length === 0 ? (
          <p className="text-sm text-gray-500">No runs logged yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <div key={r.id} className="card flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`pill ${RUN_TYPE_COLORS[r.run_type ?? "Other"] ?? RUN_TYPE_COLORS.Other}`}>
                      {r.run_type ?? "run"}
                    </span>
                    <span className="text-xs text-gray-500">{formatDateTime(r.logged_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-300">
                    {r.distance_miles ?? "?"} mi · {formatPace(r.pace_seconds_per_mile)} · {formatDuration(r.duration_seconds)}
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
