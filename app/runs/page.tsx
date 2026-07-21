"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CoachingNote from "@/components/CoachingNote";
import Spinner from "@/components/Spinner";
import type { Run } from "@/lib/types";
import { formatDateTime, formatDuration, formatPace } from "@/lib/format";

const RUN_TYPE_COLORS: Record<string, string> = {
  easy: "bg-run/20 text-run",
  tempo: "bg-fuel/20 text-fuel",
  long: "bg-accent/20 text-accent",
  interval: "bg-purple-500/20 text-purple-300",
  race: "bg-red-500/20 text-red-300",
  recovery: "bg-blue-500/20 text-blue-300",
  other: "bg-gray-500/20 text-gray-300",
};

export default function RunsPage() {
  const [text, setText] = useState("");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    setFavoriteSaved(false);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to log run.");
      setLastSaved(json.run);
      setText("");
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
      const name = window.prompt("Name this favorite:", `${lastSaved.distance_miles ?? "?"}mi ${lastSaved.run_type ?? "run"}`);
      if (!name) return;
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "run",
          name,
          raw_text: lastSaved.raw_text,
          data: {
            distance_miles: lastSaved.distance_miles,
            duration_seconds: lastSaved.duration_seconds,
            pace_seconds_per_mile: lastSaved.pace_seconds_per_mile,
            avg_hr: lastSaved.avg_hr,
            max_hr: lastSaved.max_hr,
            run_type: lastSaved.run_type,
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
      <PageHeader title="Log a Run" subtitle="Distance, pace, HR — describe it however you tracked it." />

      <form onSubmit={handleSubmit} className="px-4">
        <textarea
          className="input-field min-h-[110px] resize-none"
          placeholder="e.g. 8 mile long run this morning, 9:15 avg pace, avg HR 148, felt great, negative split the last 2 miles."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" className="btn-primary mt-3 w-full" disabled={submitting || !text.trim()}>
          {submitting ? "Parsing with AI…" : "Log Run"}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </form>

      {submitting && <Spinner label="Claude is parsing your run…" />}

      {lastSaved && !submitting && (
        <div className="mt-5 px-4">
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className={`pill ${RUN_TYPE_COLORS[lastSaved.run_type ?? "other"] ?? RUN_TYPE_COLORS.other}`}>
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
            {(lastSaved.avg_hr || lastSaved.max_hr) && (
              <p className="mt-2 text-center text-xs text-gray-500">
                {lastSaved.avg_hr && `Avg HR ${lastSaved.avg_hr}`}
                {lastSaved.avg_hr && lastSaved.max_hr && " · "}
                {lastSaved.max_hr && `Max HR ${lastSaved.max_hr}`}
              </p>
            )}
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
                    <span className={`pill ${RUN_TYPE_COLORS[r.run_type ?? "other"] ?? RUN_TYPE_COLORS.other}`}>
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
