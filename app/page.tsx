"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StatTile from "@/components/StatTile";
import Spinner from "@/components/Spinner";
import { formatPace, formatMinutes } from "@/lib/format";
import { RACE_DATE, GOAL_TIME, GOAL_PACE_SECONDS_PER_MILE } from "@/lib/marathonPlan";
import ChartFrame from "@/components/charts/ChartFrame";
import ChartCarousel from "@/components/charts/ChartCarousel";
import TodayPlan from "@/components/TodayPlan";
import BodyMap, { type BodyRegionData } from "@/components/BodyMap";
import { daysBetweenKeys, localDateKey } from "@/lib/format";
import type { WeekPlan } from "@/lib/planner/types";
import BarChart from "@/components/charts/BarChart";
import GroupedBarChart from "@/components/charts/GroupedBarChart";
import LineChart from "@/components/charts/LineChart";

type Range = "7day" | "month";

// Validated against the dark chart surface for colorblind separation —
// see the palette check in lib docs. Single-series charts keep the brand
// accent instead, since one series carries no identity-by-color.
const SERIES_AMBER = "#c98100";
const SERIES_BLUE = "#4b9bd4";
const SERIES_MAGENTA = "#c364b0";
const LIFT_COLORS = [SERIES_BLUE, SERIES_AMBER, SERIES_MAGENTA];

interface TrendsResponse {
  trendWeeks: number;
  weeklyMileage: { week: string; label: string; miles: number }[];
  weeklyVolume: { week: string; label: string; volume: number }[];
  runPaces: { dayIndex: number; label: string; pace_seconds_per_mile: number; run_type: string; distance_miles: number | null }[];
  dailyFuel: { date: string; label: string; consumed: number; burned: number; protein_g: number }[];
  topLifts: { name: string; points: { dayIndex: number; label: string; weight: number }[] }[];
}

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
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [planContext, setPlanContext] = useState<{ milesThisWeek: number; marathon: { weeklyMileage: number } | null } | null>(null);
  const [mileageNote, setMileageNote] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [bodyRegions, setBodyRegions] = useState<BodyRegionData[] | null>(null);
  const [bodyWindow, setBodyWindow] = useState<"7d" | "all">("7d");
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
    loadPlan(false);
  }, []);

  useEffect(() => {
    fetch(`/api/muscle-map?window=${bodyWindow}`)
      .then((res) => res.json())
      .then((json) => setBodyRegions(json.error ? null : json.regions))
      .catch(() => setBodyRegions(null));
  }, [bodyWindow]);

  useEffect(() => {
    loadStats(range);
    setSummary(null);
    setSummaryError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  async function loadPlan(force: boolean) {
    if (force) setRegenerating(true);
    else setPlanLoading(true);
    setPlanError(null);
    try {
      const res = await fetch(force ? "/api/plan" : "/api/plan", force ? { method: "POST" } : undefined);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Could not build this week's plan.");
      setPlan(json.plan);
      setPlanContext(json.context ?? null);
      setMileageNote(json.mileage?.note ?? null);
      const todayKey = localDateKey(new Date());
      if (json.plan?.days?.some((d: { date: string }) => d.date === todayKey)) setSelectedDate(todayKey);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPlanLoading(false);
      setRegenerating(false);
    }
  }

  function loadStats(r: Range) {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/stats?range=${r}`).then((res) => res.json()),
      fetch(`/api/trends?range=${r}`).then((res) => res.json()),
    ])
      .then(([statsJson, trendsJson]) => {
        if (statsJson.error) throw new Error(statsJson.error);
        setStats(statsJson);
        // Charts are secondary — a trends failure shouldn't blank the page.
        setTrends(trendsJson.error ? null : trendsJson);
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

  const daysToRace = Math.max(0, daysBetweenKeys(localDateKey(new Date()), RACE_DATE));

  const maxMuscleCount = stats ? Math.max(...stats.muscleGroups.map((m) => m.count), 1) : 1;
  const totalMuscleHits = stats ? stats.muscleGroups.reduce((sum, m) => sum + m.count, 0) : 0;
  const activeDays = stats ? stats.dailySummary.filter((d) => d.workouts.length + d.runs.length + d.meals.length > 0) : [];

  return (
    <div>
      <PageHeader title="Today" subtitle="Your plan for the week." />

      {planLoading ? (
        <Spinner label="Building this week's plan…" />
      ) : planError ? (
        <div className="px-4">
          <div className="card">
            <p className="text-sm text-danger">{planError}</p>
            <button onClick={() => loadPlan(true)} className="btn-secondary mt-3 w-full text-sm">
              Try again
            </button>
          </div>
        </div>
      ) : plan ? (
        <TodayPlan
          plan={plan}
          milesThisWeek={planContext?.milesThisWeek ?? 0}
          weeklyMileage={planContext?.marathon?.weeklyMileage ?? null}
          onRegenerate={() => loadPlan(true)}
          regenerating={regenerating}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          mileageNote={mileageNote}
        />
      ) : null}

      {bodyRegions && (
        <div className="mt-4 px-4">
          <BodyMap regions={bodyRegions} window={bodyWindow} onWindowChange={setBodyWindow} />
        </div>
      )}

      <div className="mt-5 px-4">
        <Link href="/marathon" className="card flex items-center justify-between bg-gradient-to-r from-accent/20 to-transparent">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Marathon countdown</p>
            <p className="text-lg font-bold text-white">{daysToRace} days to go</p>
          </div>
          <p className="text-sm font-semibold text-accent">Goal {GOAL_TIME} →</p>
        </Link>
      </div>

      <div className="mt-6 px-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Stats</h2>
      </div>

      <div className="mt-2 flex gap-2 px-4">
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

          <div className="mt-4 px-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Muscle Groups Hit</h2>
            {stats.muscleGroups.length === 0 ? (
              <div className="card">
                <p className="text-sm text-gray-500">
                  No muscle groups tagged in this range yet. They&apos;ll show up here as you log workouts.
                </p>
              </div>
            ) : (
              <div className="card">
                <p className="mb-3 text-xs text-gray-500">
                  {totalMuscleHits} exercise{totalMuscleHits === 1 ? "" : "s"} across {stats.muscleGroups.length} area
                  {stats.muscleGroups.length === 1 ? "" : "s"}
                </p>
                <div className="space-y-2.5">
                  {stats.muscleGroups.map((m) => (
                    <div key={m.group} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 truncate text-xs text-gray-400">{m.group}</span>
                      <div className="h-2.5 flex-1 rounded-sm bg-base-800">
                        <div
                          className="h-2.5 rounded-r-sm bg-accent"
                          style={{ width: `${Math.max(4, (m.count / maxMuscleCount) * 100)}%` }}
                        />
                      </div>
                      <span className="w-5 shrink-0 text-right text-xs font-medium text-gray-300">{m.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {trends && (
            <div className="mt-6 px-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Trends</h2>
              <ChartCarousel>

              <ChartFrame
                title="Weekly Mileage"
                subtitle={`Last ${trends.trendWeeks} weeks · Sun–Sat`}
                empty={trends.weeklyMileage.every((w) => w.miles === 0)}
                emptyMessage="No runs logged in the last 12 weeks."
                tableHead={["Week of", "Miles"]}
                tableRows={trends.weeklyMileage.map((w) => [w.label, w.miles])}
              >
                <BarChart
                  data={trends.weeklyMileage.map((w) => ({
                    label: w.label,
                    value: w.miles,
                    tooltip: `Week of ${w.label}: ${w.miles} mi`,
                  }))}
                  formatValue={(v) => `${v} mi`}
                />
              </ChartFrame>

              <ChartFrame
                title="Pace Trend"
                subtitle="Each run · lower is faster"
                empty={trends.runPaces.length === 0}
                emptyMessage="No runs with a recorded pace yet."
                tableHead={["Date", "Type", "Pace"]}
                tableRows={trends.runPaces.map((p) => [p.label, p.run_type, formatPace(p.pace_seconds_per_mile)])}
              >
                <LineChart
                  series={[
                    {
                      name: "Pace",
                      color: "#2ec4b6",
                      points: trends.runPaces.map((p) => ({
                        x: p.dayIndex,
                        y: p.pace_seconds_per_mile,
                        label: `${p.label} ${p.run_type}`,
                      })),
                    },
                  ]}
                  formatValue={(v) => formatPace(v)}
                  referenceValue={GOAL_PACE_SECONDS_PER_MILE}
                  referenceLabel="8:01 goal"
                />
              </ChartFrame>

              <ChartFrame
                title="Calories In vs Burned"
                subtitle={range === "month" ? "Last 30 days" : "Last 7 days"}
                series={[
                  { name: "Consumed", color: SERIES_AMBER },
                  { name: "Burned", color: SERIES_BLUE },
                ]}
                empty={trends.dailyFuel.every((d) => d.consumed === 0 && d.burned === 0)}
                tableHead={["Day", "In", "Burned"]}
                tableRows={trends.dailyFuel.map((d) => [d.label, d.consumed, d.burned])}
              >
                <GroupedBarChart
                  data={trends.dailyFuel.map((d) => ({
                    label: d.label,
                    a: d.consumed,
                    b: d.burned,
                    tooltip: `${d.label}: ${d.consumed} in / ${d.burned} burned`,
                  }))}
                  colorA={SERIES_AMBER}
                  colorB={SERIES_BLUE}
                  formatValue={(v) => `${v} cal`}
                />
              </ChartFrame>

              <ChartFrame
                title="Protein"
                subtitle={range === "month" ? "Last 30 days" : "Last 7 days"}
                empty={trends.dailyFuel.every((d) => d.protein_g === 0)}
                emptyMessage="No meals logged in this range."
                tableHead={["Day", "Protein"]}
                tableRows={trends.dailyFuel.map((d) => [d.label, `${d.protein_g}g`])}
              >
                <BarChart
                  data={trends.dailyFuel.map((d) => ({
                    label: d.label,
                    value: d.protein_g,
                    tooltip: `${d.label}: ${d.protein_g}g protein`,
                  }))}
                  color={SERIES_AMBER}
                  formatValue={(v) => `${v}g`}
                />
              </ChartFrame>

              <ChartFrame
                title="Training Volume"
                subtitle={`Last ${trends.trendWeeks} weeks · reps × weight`}
                empty={trends.weeklyVolume.every((w) => w.volume === 0)}
                emptyMessage="No weighted sets logged in the last 12 weeks."
                tableHead={["Week of", "Volume (lb)"]}
                tableRows={trends.weeklyVolume.map((w) => [w.label, w.volume.toLocaleString()])}
              >
                <BarChart
                  data={trends.weeklyVolume.map((w) => ({
                    label: w.label,
                    value: w.volume,
                    tooltip: `Week of ${w.label}: ${w.volume.toLocaleString()} lb`,
                  }))}
                  formatValue={(v) => `${Math.round(v / 1000)}k lb`}
                />
              </ChartFrame>

              <ChartFrame
                title="Top Sets"
                subtitle="Heaviest set per session, most-logged lifts"
                series={trends.topLifts.map((l, i) => ({ name: l.name, color: LIFT_COLORS[i] }))}
                empty={trends.topLifts.length === 0}
                emptyMessage="Log a lift across two or more sessions to see progression."
                tableHead={["Lift", "Date", "Top set"]}
                tableRows={trends.topLifts.flatMap((l) => l.points.map((p) => [l.name, p.label, `${p.weight} lb`]))}
              >
                <LineChart
                  series={trends.topLifts.map((l, i) => ({
                    name: l.name,
                    color: LIFT_COLORS[i],
                    points: l.points.map((p) => ({ x: p.dayIndex, y: p.weight, label: p.label })),
                  }))}
                  formatValue={(v) => `${v} lb`}
                />
              </ChartFrame>
              </ChartCarousel>
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
