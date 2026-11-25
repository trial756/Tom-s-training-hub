"use client";

import { postOrQueue } from "@/lib/outbox";
import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CoachingNote from "@/components/CoachingNote";
import Spinner from "@/components/Spinner";
import type { Run, Workout } from "@/lib/types";
import { formatDuration, formatLoggedAt, formatPace, localDateKey, loggedAtFor, summarizeExerciseNames } from "@/lib/format";
import { notifyDataChanged } from "@/lib/refresh";
import SetLogger from "@/components/SetLogger";
import { TEMPLATES, buildTemplate, draftText, draftToExercises, type DraftExercise, type RecentSets } from "@/lib/workoutTemplates";

function todayISO(): string {
  return localDateKey(new Date());
}

type RecentEntry = { kind: "workout"; item: Workout } | { kind: "run"; item: Run };

export default function LogPage() {
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState("");
  // Set by set (Tom, Nov 2026: "the manual log could look more like the other log"),
  // with a template per day type; describing it in words stays as the fallback.
  const [mode, setMode] = useState<"sets" | "words">("sets");
  const [draft, setDraft] = useState<DraftExercise[]>([]);
  const [title, setTitle] = useState("Workout");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [recentSets, setRecentSets] = useState<RecentSets>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Workout | null>(null);
  const [savedOffline, setSavedOffline] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteSaved, setFavoriteSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadRecent();
    // Arriving from a Today plan session: start from its exercises rather
    // than a blank box. Read off location instead of useSearchParams so the
    // page stays statically rendered without a Suspense boundary.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const prefill = params.get("prefill");
      const planDate = params.get("date");
      if (prefill) setText(prefill);
      if (planDate && /^\d{4}-\d{2}-\d{2}$/.test(planDate)) setDate(planDate);
    }
  }, []);

  // Grow the box to fit what's in it — a plan prefill is one exercise per
  // line, and every line should be visible to edit without scrolling inside.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

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

  // Last top set of every lift, so a template opens with real numbers.
  useEffect(() => {
    fetch("/api/lifts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.recent && setRecentSets(j.recent))
      .catch(() => {});
  }, []);

  function applyTemplate(label: string) {
    const t = TEMPLATES.find((x) => x.label === label);
    if (!t) return;
    setMode("sets");
    setTitle(t.title);
    setDraft(buildTemplate(t, recentSets));
  }

  const ready = mode === "sets" ? draftToExercises(draft).length > 0 : !!text.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    setFavoriteSaved(false);
    setSavedOffline(null);
    const mins = Number(minutes);
    const body =
      mode === "sets"
        ? {
            text: draftText(title, draft, notes),
            exercises: draftToExercises(draft),
            ...(mins > 0 && mins < 600 ? { duration_minutes: mins } : {}),
            logged_at: loggedAtFor(date),
          }
        : { text, logged_at: loggedAtFor(date) };
    const label = mode === "sets" ? title : text.trim().split("\n")[0].slice(0, 40);
    const reset = () => {
      setText("");
      setDraft([]);
      setTitle("Workout");
      setMinutes("");
      setNotes("");
      setDate(todayISO());
    };
    try {
      const result = await postOrQueue<{ workout: Workout }>("/api/workouts", body, { kind: "workout", label: `Workout · ${label}` });
      if (result.queued) {
        setLastSaved(null);
        setSavedOffline("Saved on this phone. It\u2019ll sync, with coaching, when you\u2019re back online.");
        reset();
        return;
      }
      if (!result.ok) throw new Error(result.error);
      setLastSaved(result.data.workout);
      notifyDataChanged("workout");
      reset();
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
      <PageHeader title="Log a Workout" subtitle="Pick a day to start from your usual lifts, or add exercises one by one." />

      <div className="mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => applyTemplate(t.label)}
            disabled={submitting}
            className={`min-h-[40px] whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              mode === "sets" && title === t.title ? "border-accent text-accent" : "border-base-600 bg-base-800 text-gray-300"
            }`}
          >
            {t.label}
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

        {mode === "sets" ? (
          <>
            {draft.length > 0 && (
              <p className="mb-2 text-xs text-muted">
                Weights and reps are from the last time you did each lift — change anything, add or remove sets.
                Only filled-in sets are logged.
              </p>
            )}
            <SetLogger draft={draft} onChange={setDraft} recent={recentSets} disabled={submitting} />
            <div className="mt-3 flex gap-2">
              <input
                aria-label="Minutes"
                className="input-field min-h-[44px] w-28 text-center"
                inputMode="numeric"
                placeholder="min"
                value={minutes}
                disabled={submitting}
                onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
              />
              <input
                aria-label="Notes"
                className="input-field min-h-[44px] flex-1"
                placeholder="Notes (optional)"
                value={notes}
                disabled={submitting}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </>
        ) : (
          <textarea
            ref={textareaRef}
            className="input-field min-h-[120px] resize-none"
            placeholder="e.g. Bench press 3x8 at 135, squats 4x5 at 185, then 3 sets of pull-ups to failure. Felt strong today, ~45 min total."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
          />
        )}
        <button type="submit" className="btn-primary mt-3 w-full" disabled={submitting || !ready}>
          {submitting ? (mode === "sets" ? "Logging…" : "Parsing with AI…") : "Log Workout"}
        </button>
        <button
          type="button"
          className="mt-1 min-h-[44px] w-full text-sm text-faint"
          disabled={submitting}
          onClick={() => setMode((m) => (m === "sets" ? "words" : "sets"))}
        >
          {mode === "sets" ? "Or describe it in words instead" : "← Log set by set instead"}
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {savedOffline && <p className="mt-2 text-sm text-fuel">{savedOffline}</p>}
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
                  <span className="text-xs text-gray-500">{formatLoggedAt(entry.item.logged_at, entry.item.created_at)}</span>
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
