"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CoachingNote from "@/components/CoachingNote";
import Spinner from "@/components/Spinner";
import type { Workout } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

export default function LogPage() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Workout | null>(null);
  const [recent, setRecent] = useState<Workout[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteSaved, setFavoriteSaved] = useState(false);

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/workouts?limit=5");
      const json = await res.json();
      setRecent(json.workouts ?? []);
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
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to log workout.");
      setLastSaved(json.workout);
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
      const name = window.prompt("Name this favorite:", lastSaved.exercises[0]?.name ?? "Workout");
      if (!name) return;
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "workout",
          name,
          raw_text: lastSaved.raw_text,
          data: {
            exercises: lastSaved.exercises,
            duration_minutes: lastSaved.duration_minutes,
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
      <PageHeader title="Log a Workout" subtitle="Describe it in plain English — AI handles the rest." />

      <form onSubmit={handleSubmit} className="px-4">
        <textarea
          className="input-field min-h-[120px] resize-none"
          placeholder="e.g. Bench press 3x8 at 135, squats 4x5 at 185, then 3 sets of pull-ups to failure. Felt strong today, ~45 min total."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" className="btn-primary mt-3 w-full" disabled={submitting || !text.trim()}>
          {submitting ? "Parsing with AI…" : "Log Workout"}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </form>

      {submitting && <Spinner label="Claude is parsing your workout…" />}

      {lastSaved && !submitting && (
        <div className="mt-5 px-4">
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className="pill bg-accent/20 text-accent">Just Logged</span>
              <button
                onClick={saveFavorite}
                disabled={savingFavorite || favoriteSaved}
                className="text-xs font-medium text-gray-400 active:text-accent"
              >
                {favoriteSaved ? "★ Saved" : "☆ Save as favorite"}
              </button>
            </div>
            <ul className="space-y-2">
              {lastSaved.exercises.map((ex, i) => (
                <li key={i} className="text-sm">
                  <span className="font-semibold text-white">{ex.name}</span>
                  <span className="ml-2 text-gray-400">
                    {ex.sets
                      .map((s) => `${s.reps ?? "?"}${s.weight ? ` × ${s.weight}${s.weight_unit ?? "lb"}` : ""}`)
                      .join(", ")}
                  </span>
                </li>
              ))}
            </ul>
            {lastSaved.duration_minutes && (
              <p className="mt-2 text-xs text-gray-500">{lastSaved.duration_minutes} min total</p>
            )}
            <CoachingNote
              feedback={lastSaved.coaching_feedback}
              vsLastTime={lastSaved.vs_last_time}
              adjustments={lastSaved.adjustments}
            />
          </div>
        </div>
      )}

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Recent Workouts</h2>
        {loadingRecent ? (
          <Spinner />
        ) : recent.length === 0 ? (
          <p className="text-sm text-gray-500">No workouts logged yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((w) => (
              <div key={w.id} className="card">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{formatDateTime(w.logged_at)}</span>
                  {w.duration_minutes && <span className="text-xs text-gray-500">{w.duration_minutes} min</span>}
                </div>
                <p className="mt-1 text-sm text-gray-300">
                  {w.exercises.map((e) => e.name).join(", ") || w.raw_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
