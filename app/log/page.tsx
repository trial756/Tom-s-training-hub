"use client";

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CoachingNote from "@/components/CoachingNote";
import Spinner from "@/components/Spinner";
import type { Run, Workout } from "@/lib/types";
import { formatDateTime, formatDuration, formatPace, localDateKey, summarizeExerciseNames } from "@/lib/format";

const QUICK_LOG_CHIPS: { label: string; prefill: string }[] = [
  { label: "Chest Day", prefill: "Chest day: " },
  { label: "Back Day", prefill: "Back day: " },
  { label: "Leg Day", prefill: "Leg day: " },
  { label: "Shoulders", prefill: "Shoulders: " },
  { label: "Arms", prefill: "Arms: " },
  { label: "Core", prefill: "Core: " },
  { label: "Yoga", prefill: "Yoga: " },
  { label: "Rest Day", prefill: "Rest day — no workout today." },
];

function todayISO(): string {
  return localDateKey(new Date());
}

type RecentEntry = { kind: "workout"; item: Workout } | { kind: "run"; item: Run };

export default function LogPage() {
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Workout | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteSaved, setFavoriteSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    setLoadingRecent(true);
    try {
      const [w, r] = await Promise.all([
        fetch("/api/workouts?limit=4").then((res) => res.json()),
        fetch("/api/runs?limit=4").then((res) => res.json()),
      ]);
      const combined: RecentEntry[] = [
        ...((w.workouts ?? []) as Workout[]).map((item) => ({ kind: "workout" as const, item })),
        ...((r.runs ?? []) as Run[]).map((item) => ({ kind: "run" as const, item })),
      ];
      combined.sort((a, b) => new Date(b.item.logged_at).getTime() - new Date(a.item.logged_at).getTime());
      setRecent(combined.slice(0, 4));
    } finally {
      setLoadingRecent(false);
    }
  }

  function applyQuickLog(prefill: string) {
    setText(prefill);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
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
        body: JSON.stringify({ text, logged_at: new Date(`${date}T12:00:00`).toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to log workout.");
      setLastSaved(json.workout);
      setText("");
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

      <div className="mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {QUICK_LOG_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => applyQuickLog(chip.prefill)}
            disabled={submitting}
            className="whitespace-nowrap rounded-full border border-base-600 bg-base-800 px-3.5 py-1.5 text-sm font-medium text-gray-300 transition-colors active:border-accent active:text-accent"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="px-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date</label>
        <input
          type="date"
          className="input-field mb-4"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={submitting}
        />

        <textarea
          ref={textareaRef}
          className="input-field min-h-[120px] resize-none"
          placeholder="e.g. Bench press 3x8 at 135, squats 4x5 at 185, then 3 sets of pull-ups to failure. Felt strong today, ~45 min total."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" className="btn-primary mt-3 w-full" disabled={submitting || !text.trim()}>
          {submitting ? "Parsing with AI…" : "Log Workout"}
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
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
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Recent</h2>
        {loadingRecent ? (
          <Spinner />
        ) : recent.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing logged yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((entry) => (
              <div key={`${entry.kind}-${entry.item.id}`} className="card">
                <div className="flex items-center justify-between">
                  <span className={`pill capitalize ${entry.kind === "run" ? "bg-run/20 text-run" : "bg-accent/20 text-accent"}`}>
                    {entry.kind}
                  </span>
                  <span className="text-xs text-gray-500">{formatDateTime(entry.item.logged_at)}</span>
                </div>
                {entry.kind === "workout" ? (
                  <p className="mt-1 text-sm text-gray-300">
                    {entry.item.summary || summarizeExerciseNames(entry.item.exercises) || entry.item.raw_text}
                    {entry.item.duration_minutes ? ` · ${entry.item.duration_minutes} min` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-gray-300">
                    {entry.item.distance_miles ?? "?"} mi · {formatPace(entry.item.pace_seconds_per_mile)} · {formatDuration(entry.item.duration_seconds)}
                    {entry.item.run_type ? ` · ${entry.item.run_type}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
