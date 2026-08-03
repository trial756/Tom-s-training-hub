"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StatTile from "@/components/StatTile";
import Spinner from "@/components/Spinner";
import { formatPace, formatMinutes } from "@/lib/format";
import { RACE_DATE, GOAL_TIME } from "@/lib/marathonPlan";

type Range = "7day" | "month";

interface StatsResponse {
  range: Range;
  stats: {
    workoutCount: number;
    runCount: number;
    caloriesBurned: number;
    caloriesConsumed: number;
    proteinG: number;
    netCalories: number;
  };
  avgPaceSecondsPerMile: number | null;
  gymTimeMinutes: number;
  muscleGroups: { group: string; count: number }[];
  dailySummary: { date: string; label: string; workouts: string[]; runs: string[]; meals: string[] }[];
}

interface TrainingSummary {
  headline: string;
  summary: string;
  wins: string[];
  watchouts: string[];
  next_week_focus: string;
}

export default function StatsPage() {
  const [range, setRange] = useState<Range>("7day");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [backupOpen, setBackupOpen] = useState(false);
  const [exportText, setExportText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    loadStats(range);
    setSummary(null);
    setSummaryError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  function loadStats(r: Range) {
    setLoading(true);
    setError(null);
    fetch(`/api/stats?range=${r}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setStats(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function generateSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/summary?range=${range}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate summary.");
      setSummary(json);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/backup");
      const json = await res.json();
      setExportText(JSON.stringify(json, null, 2));
    } finally {
      setExporting(false);
    }
  }

  async function copyExport() {
    if (!exportText) return;
    await navigator.clipboard.writeText(exportText);
  }

  async function restoreData() {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const parsed = JSON.parse(importText);
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Restore failed.");
      const counts = Object.entries(json.imported as Record<string, number>)
        .map(([table, n]) => `${n} ${table}`)
        .join(", ");
      setImportResult(`Restored: ${counts}`);
      setImportText("");
      loadStats(range);
    } catch (err) {
      setImportResult(err instanceof Error ? `Error: ${err.message}` : "Restore failed.");
    } finally {
      setImporting(false);
    }
  }

  const raceDate = new Date(`${RACE_DATE}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToRace = Math.max(0, Math.round((raceDate.getTime() - today.getTime()) / 86400000));

  const maxMuscleCount = stats ? Math.max(...stats.muscleGroups.map((m) => m.count), 1) : 1;
  const activeDays = stats ? stats.dailySummary.filter((d) => d.workouts.length + d.runs.length + d.meals.length > 0) : [];

  return (
    <div>
      <PageHeader title="Tom's Training Hub" subtitle="Your training at a glance." />

      <div className="px-4">
        <Link href="/marathon" className="card flex items-center justify-between bg-gradient-to-r from-accent/20 to-transparent">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Marathon countdown</p>
            <p className="text-lg font-bold text-white">{daysToRace} days to go</p>
          </div>
          <p className="text-sm font-semibold text-accent">Goal {GOAL_TIME} →</p>
        </Link>
      </div>

      <div className="mt-4 flex gap-2 px-4">
        {(["7day", "month"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
              range === r ? "bg-accent text-base-950" : "bg-base-800 border border-base-600 text-gray-400"
            }`}
          >
            {r === "7day" ? "7 Days" : "Monthly"}
          </button>
        ))}
      </div>

      {loading && <Spinner label="Loading stats…" />}
      {error && <p className="px-4 py-4 text-sm text-danger">{error}</p>}

      {stats && !loading && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 px-4">
            <StatTile label="Workouts" value={stats.stats.workoutCount} accentColor="#00e676" />
            <StatTile label="Runs" value={stats.stats.runCount} accentColor="#2ec4b6" />
            <StatTile label="Cal Burned" value={stats.stats.caloriesBurned} unit="cal" accentColor="#00e676" />
            <StatTile label="Cal Consumed" value={stats.stats.caloriesConsumed} unit="cal" accentColor="#ffb703" />
            <StatTile label="Protein" value={stats.stats.proteinG} unit="g" accentColor="#ffb703" />
            <StatTile
              label="Net Calories"
              value={stats.stats.netCalories > 0 ? `+${stats.stats.netCalories}` : stats.stats.netCalories}
              unit="cal"
              accentColor={stats.stats.netCalories > 0 ? "#ffb703" : "#2ec4b6"}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 px-4">
            <StatTile label="Avg Pace" value={formatPace(stats.avgPaceSecondsPerMile)} accentColor="#2ec4b6" />
            <StatTile label="Gym Time" value={formatMinutes(stats.gymTimeMinutes)} accentColor="#00e676" />
          </div>

          {stats.muscleGroups.length > 0 && (
            <div className="mt-4 px-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Muscle Groups Hit</h2>
              <div className="card space-y-2">
                {stats.muscleGroups.map((m) => (
                  <div key={m.group} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-gray-400">{m.group}</span>
                    <div className="h-3 flex-1 rounded-full bg-base-800">
                      <div
                        className="h-3 rounded-full bg-accent"
                        style={{ width: `${Math.max(6, (m.count / maxMuscleCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-4 shrink-0 text-right text-xs text-gray-500">{m.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 px-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">AI Coaching Summary</h2>
              {!summary && (
                <button
                  onClick={generateSummary}
                  disabled={summaryLoading}
                  className="text-xs font-semibold text-accent disabled:opacity-40"
                >
                  {summaryLoading ? "Thinking…" : "Generate"}
                </button>
              )}
            </div>
            {summaryLoading && <Spinner label="Claude is reviewing your training…" />}
            {summaryError && <p className="text-sm text-danger">{summaryError}</p>}
            {summary && (
              <div className="card">
                <p className="text-base font-bold text-white">{summary.headline}</p>
                <p className="mt-2 text-sm leading-snug text-gray-300">{summary.summary}</p>
                {summary.wins.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-accent">Wins</p>
                    <ul className="space-y-1">
                      {summary.wins.map((w, i) => (
                        <li key={i} className="flex gap-1.5 text-sm text-gray-300">
                          <span className="text-accent">✓</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.watchouts.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-fuel">Watchouts</p>
                    <ul className="space-y-1">
                      {summary.watchouts.map((w, i) => (
                        <li key={i} className="flex gap-1.5 text-sm text-gray-300">
                          <span className="text-fuel">!</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-3 rounded-lg bg-base-800 p-2.5">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Next Week</p>
                  <p className="text-sm text-gray-300">{summary.next_week_focus}</p>
                </div>
                <button onClick={generateSummary} disabled={summaryLoading} className="mt-3 text-xs font-medium text-gray-500">
                  Regenerate
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 px-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Daily Summary</h2>
            {activeDays.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing logged in this range.</p>
            ) : (
              <div className="space-y-2">
                {activeDays.map((d) => (
                  <div key={d.date} className="card">
                    <p className="text-xs font-semibold text-gray-400">{d.label}</p>
                    <div className="mt-1 space-y-0.5 text-sm text-gray-300">
                      {d.workouts.map((w, i) => (
                        <p key={`w-${i}`}>💪 {w}</p>
                      ))}
                      {d.runs.map((r, i) => (
                        <p key={`r-${i}`}>🏃 {r}</p>
                      ))}
                      {d.meals.map((m, i) => (
                        <p key={`m-${i}`}>🍽️ {m}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3 px-4">
        <Link href="/log" className="btn-secondary text-sm">
          + Workout
        </Link>
        <Link href="/runs" className="btn-secondary text-sm">
          + Run
        </Link>
        <Link href="/fuel" className="btn-secondary text-sm">
          + Meal
        </Link>
      </div>

      <div className="mt-6 px-4">
        <button
          onClick={() => setBackupOpen((v) => !v)}
          className="text-sm font-semibold uppercase tracking-wide text-gray-500"
        >
          Data Backup {backupOpen ? "▲" : "▼"}
        </button>
        {backupOpen && (
          <div className="mt-3 space-y-4">
            <div className="card">
              <p className="mb-2 text-sm font-medium text-white">Export</p>
              <p className="mb-2 text-xs text-gray-500">Copies all your data as JSON text you can save somewhere safe.</p>
              <div className="flex gap-2">
                <button onClick={exportData} disabled={exporting} className="btn-secondary flex-1 text-sm">
                  {exporting ? "Exporting…" : "Export All Data"}
                </button>
                {exportText && (
                  <button onClick={copyExport} className="btn-secondary text-sm">
                    Copy
                  </button>
                )}
              </div>
              {exportText && (
                <textarea readOnly className="input-field mt-2 min-h-[120px] text-xs" value={exportText} />
              )}
            </div>

            <div className="card">
              <p className="mb-2 text-sm font-medium text-white">Import / Restore</p>
              <p className="mb-2 text-xs text-gray-500">
                Paste previously exported JSON. Matching ids are updated, new ids are added — nothing is ever deleted.
              </p>
              <textarea
                className="input-field min-h-[120px] text-xs"
                placeholder="Paste exported JSON here…"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <button
                onClick={restoreData}
                disabled={importing || !importText.trim()}
                className="btn-primary mt-2 w-full text-sm"
              >
                {importing ? "Restoring…" : "Restore"}
              </button>
              {importResult && <p className="mt-2 text-xs text-gray-400">{importResult}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
