"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import CoachingNote from "@/components/CoachingNote";
import UndoToast from "@/components/UndoToast";
import type { Favorite, Meal, Run, Workout } from "@/lib/types";
import { formatDateTime, formatDuration, formatPace, summarizeExerciseNames } from "@/lib/format";

type Filter = "all" | "workouts" | "runs" | "meals" | "favorites";
type WorkoutType = "strength" | "cardio" | "hiit" | "flexibility" | "run" | "other";
const WORKOUT_TYPES: WorkoutType[] = ["strength", "cardio", "hiit", "flexibility", "run", "other"];

const INTENSITY_SCORE: Record<string, { score: number; color: string }> = {
  low: { score: 3, color: "text-run" },
  moderate: { score: 6, color: "text-fuel" },
  high: { score: 9, color: "text-danger" },
};

type Entry =
  | { kind: "workout"; item: Workout }
  | { kind: "run"; item: Run }
  | { kind: "meal"; item: Meal };

type DeletableKind = Entry["kind"] | "favorite";
interface PendingDelete {
  kind: DeletableKind;
  item: Workout | Run | Meal | Favorite;
  timeoutId: ReturnType<typeof setTimeout>;
}

function entrySearchText(entry: Entry): string {
  const { kind, item } = entry;
  if (kind === "workout") {
    return [
      item.raw_text,
      item.type,
      item.intensity,
      item.summary,
      ...item.muscle_groups,
      ...item.exercises.map((e) => e.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  if (kind === "run") {
    return [item.raw_text, item.run_type, item.surface, item.shoes, item.feel, item.notes, item.summary]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  return [item.raw_text, item.meal_type, item.summary, item.notes, ...item.items.map((i) => i.name)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function HistoryPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [workoutType, setWorkoutType] = useState<WorkoutType | "all">("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [w, r, m, f] = await Promise.all([
        fetch("/api/workouts?limit=100").then((res) => res.json()),
        fetch("/api/runs?limit=100").then((res) => res.json()),
        fetch("/api/meals?limit=100").then((res) => res.json()),
        fetch("/api/favorites").then((res) => res.json()),
      ]);
      setWorkouts(w.workouts ?? []);
      setRuns(r.runs ?? []);
      setMeals(m.meals ?? []);
      setFavorites(f.favorites ?? []);
    } finally {
      setLoading(false);
    }
  }

  const entries: Entry[] = useMemo(() => {
    const all: Entry[] = [
      ...workouts.map((item) => ({ kind: "workout" as const, item })),
      ...runs.map((item) => ({ kind: "run" as const, item })),
      ...meals.map((item) => ({ kind: "meal" as const, item })),
    ];
    all.sort((a, b) => new Date(b.item.logged_at).getTime() - new Date(a.item.logged_at).getTime());

    let filtered = all;
    if (filter === "workouts") filtered = filtered.filter((e) => e.kind === "workout");
    if (filter === "runs") filtered = filtered.filter((e) => e.kind === "run");
    if (filter === "meals") filtered = filtered.filter((e) => e.kind === "meal");

    if (filter === "workouts" && workoutType !== "all") {
      filtered = filtered.filter((e) => e.kind === "workout" && e.item.type === workoutType);
    }

    const q = search.trim().toLowerCase();
    if (q) filtered = filtered.filter((e) => entrySearchText(e).includes(q));

    return filtered;
  }, [workouts, runs, meals, filter, workoutType, search]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function requestDeleteEntry(kind: Entry["kind"], item: Workout | Run | Meal) {
    if (kind === "workout") setWorkouts((prev) => prev.filter((w) => w.id !== item.id));
    if (kind === "run") setRuns((prev) => prev.filter((r) => r.id !== item.id));
    if (kind === "meal") setMeals((prev) => prev.filter((m) => m.id !== item.id));
    const timeoutId = setTimeout(() => finalizeDelete(kind, item.id), 5000);
    setPendingDelete({ kind, item, timeoutId });
  }

  function requestDeleteFavorite(fav: Favorite) {
    setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
    const timeoutId = setTimeout(() => finalizeDelete("favorite", fav.id), 5000);
    setPendingDelete({ kind: "favorite", item: fav, timeoutId });
  }

  async function finalizeDelete(kind: DeletableKind, id: string) {
    setPendingDelete((prev) => (prev?.item.id === id ? null : prev));
    const path = kind === "workout" ? "workouts" : kind === "run" ? "runs" : kind === "meal" ? "meals" : "favorites";
    await fetch(`/api/${path}/${id}`, { method: "DELETE" });
  }

  function undoDelete() {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timeoutId);
    const { kind, item } = pendingDelete;
    const byDateDesc = (a: { logged_at?: string; created_at: string }, b: { logged_at?: string; created_at: string }) =>
      new Date(b.logged_at ?? b.created_at).getTime() - new Date(a.logged_at ?? a.created_at).getTime();
    if (kind === "workout") setWorkouts((prev) => [...prev, item as Workout].sort(byDateDesc));
    if (kind === "run") setRuns((prev) => [...prev, item as Run].sort(byDateDesc));
    if (kind === "meal") setMeals((prev) => [...prev, item as Meal].sort(byDateDesc));
    if (kind === "favorite") setFavorites((prev) => [...prev, item as Favorite].sort(byDateDesc));
    setPendingDelete(null);
  }

  async function logFavorite(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/favorites/${id}/log`, { method: "POST" });
      await loadAll();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title="History" subtitle="Everything you've logged, in one feed." />

      <div className="mb-3 px-4">
        <input
          type="text"
          className="input-field"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {(["all", "workouts", "runs", "meals", "favorites"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              filter === f ? "bg-accent text-white" : "bg-base-800 text-gray-400 border border-base-600"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filter === "workouts" && (
        <div className="mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {(["all", ...WORKOUT_TYPES] as const).map((t) => (
            <button
              key={t}
              onClick={() => setWorkoutType(t)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                workoutType === t ? "bg-accent/20 text-accent border border-accent/40" : "bg-base-800 text-gray-500 border border-base-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner label="Loading history…" />
      ) : filter === "favorites" ? (
        <div className="space-y-2 px-4">
          {favorites.length === 0 && <p className="text-sm text-gray-500">No favorites saved yet.</p>}
          {favorites.map((f) => (
            <div key={f.id} className="card">
              <div className="flex items-center justify-between">
                <span className="pill bg-base-700 text-gray-300 capitalize">{f.type}</span>
                <div className="flex gap-3">
                  <button
                    onClick={() => logFavorite(f.id)}
                    disabled={busyId === f.id}
                    className="text-xs font-semibold text-accent"
                  >
                    Log again
                  </button>
                  <button onClick={() => requestDeleteFavorite(f)} className="text-xs text-gray-500 active:text-danger">
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-1 text-sm font-medium text-white">{f.name}</p>
              <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{f.raw_text}</p>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="px-4 text-sm text-gray-500">
          {search ? `Nothing matches "${search}".` : "Nothing logged yet."}
        </p>
      ) : (
        <div className="space-y-2 px-4">
          {entries.map((e) => (
            <HistoryCard
              key={`${e.kind}-${e.item.id}`}
              entry={e}
              expanded={expanded.has(e.item.id)}
              onToggleExpand={() => toggleExpand(e.item.id)}
              onDelete={() => requestDeleteEntry(e.kind, e.item)}
            />
          ))}
        </div>
      )}

      {pendingDelete && (
        <UndoToast
          label={`${pendingDelete.kind === "favorite" ? "Favorite" : pendingDelete.kind} deleted`}
          onUndo={undoDelete}
          onExpire={() => finalizeDelete(pendingDelete.kind, pendingDelete.item.id)}
        />
      )}
    </div>
  );
}

function HistoryCard({
  entry,
  expanded,
  onToggleExpand,
  onDelete,
}: {
  entry: Entry;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
}) {
  const { kind, item } = entry;
  const kindColor = kind === "workout" ? "bg-accent/20 text-accent" : kind === "run" ? "bg-run/20 text-run" : "bg-fuel/20 text-fuel";
  const intensity = kind === "workout" ? INTENSITY_SCORE[item.intensity ?? ""] : null;

  return (
    <div className="card">
      <button type="button" onClick={onToggleExpand} className="flex w-full items-start justify-between gap-2 text-left">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`pill ${kindColor} capitalize`}>{kind === "workout" ? item.type || kind : kind}</span>
            <span className="text-xs text-gray-500">{formatDateTime(item.logged_at)}</span>
          </div>

          {kind === "workout" && (
            <>
              <p className="mt-1 text-sm text-gray-300">{item.summary || summarizeExerciseNames(item.exercises) || item.raw_text}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>{item.exercises.length} exercise{item.exercises.length === 1 ? "" : "s"}</span>
                {item.calories_burned_est != null && <span>{item.calories_burned_est} cal</span>}
                {intensity && <span className={intensity.color}>Intensity {intensity.score}/10</span>}
              </div>
              {item.muscle_groups.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.muscle_groups.map((g, i) => (
                    <span key={g} className={`pill ${i === 0 ? "bg-accent/20 text-accent" : "bg-base-800 text-gray-500"}`}>
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {kind === "run" && (
            <p className="mt-1 text-sm text-gray-300">
              {item.distance_miles ?? "?"} mi · {formatPace(item.pace_seconds_per_mile)} · {formatDuration(item.duration_seconds)}
              {item.run_type ? ` · ${item.run_type}` : ""}
              {item.feel ? ` · ${item.feel}` : ""}
            </p>
          )}

          {kind === "meal" && (
            <p className="mt-1 text-sm text-gray-300">
              {item.items.map((i) => i.name).join(", ") || item.raw_text} {item.calories ? `· ${item.calories} cal` : ""}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 text-xs text-gray-600 active:text-danger"
        >
          Delete
        </button>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-base-700 pt-3">
          {kind === "workout" && item.exercises.length > 0 && (
            <div className="space-y-2">
              {item.exercises.map((ex, i) => (
                <div key={i} className="rounded-lg bg-base-800 p-2.5">
                  <p className="text-sm font-medium text-white">{ex.name}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {ex.sets.map((s) => `${s.reps ?? "?"}${s.weight ? ` × ${s.weight}${s.weight_unit ?? "lb"}` : ""}`).join(", ")}
                  </p>
                </div>
              ))}
              {item.notes && <p className="text-xs text-gray-500">{item.notes}</p>}
            </div>
          )}

          {kind === "run" && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
              {item.avg_hr && <span>Avg HR {item.avg_hr}</span>}
              {item.cadence_spm && <span>Cadence {item.cadence_spm} spm</span>}
              {item.surface && <span className="capitalize">{item.surface}</span>}
              {item.shoes && <span>{item.shoes}</span>}
              {item.pace_note && <span>{item.pace_note}</span>}
            </div>
          )}

          {kind === "meal" && item.items.length > 0 && (
            <ul className="space-y-1.5">
              {item.items.map((food, i) => (
                <li key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">{food.name}</span>
                  <span className="text-gray-500">
                    {food.calories_est ?? "—"} cal · {food.protein_g ?? "—"}p · {food.carbs_g ?? "—"}c · {food.fat_g ?? "—"}f
                  </span>
                </li>
              ))}
            </ul>
          )}

          {kind !== "meal" ? (
            <CoachingNote feedback={item.coaching_feedback} vsLastTime={item.vs_last_time} adjustments={item.adjustments} />
          ) : (
            <CoachingNote feedback={item.coaching_feedback} />
          )}

          {"weekly_note" in item && item.weekly_note && (
            <p className="rounded-lg bg-base-800 p-2.5 text-xs text-gray-400">
              <span className="font-semibold text-gray-300">Pattern: </span>
              {item.weekly_note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
