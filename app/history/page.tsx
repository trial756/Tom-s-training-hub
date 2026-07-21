"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import type { Favorite, Meal, Run, Workout } from "@/lib/types";
import { formatDateTime, formatDuration, formatPace } from "@/lib/format";

type Filter = "all" | "workouts" | "runs" | "meals" | "favorites";

type Entry =
  | { kind: "workout"; item: Workout }
  | { kind: "run"; item: Run }
  | { kind: "meal"; item: Meal };

export default function HistoryPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

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
    if (filter === "all" || filter === "favorites") return all;
    if (filter === "workouts") return all.filter((e) => e.kind === "workout");
    if (filter === "runs") return all.filter((e) => e.kind === "run");
    if (filter === "meals") return all.filter((e) => e.kind === "meal");
    return all;
  }, [workouts, runs, meals, filter]);

  async function deleteEntry(kind: Entry["kind"], id: string) {
    setBusyId(id);
    const path = kind === "workout" ? "workouts" : kind === "run" ? "runs" : "meals";
    try {
      await fetch(`/api/${path}/${id}`, { method: "DELETE" });
      if (kind === "workout") setWorkouts((prev) => prev.filter((w) => w.id !== id));
      if (kind === "run") setRuns((prev) => prev.filter((r) => r.id !== id));
      if (kind === "meal") setMeals((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteFavorite(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/favorites/${id}`, { method: "DELETE" });
      setFavorites((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setBusyId(null);
    }
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

      <div className="mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
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
                  <button
                    onClick={() => deleteFavorite(f.id)}
                    disabled={busyId === f.id}
                    className="text-xs text-gray-500"
                  >
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
        <p className="px-4 text-sm text-gray-500">Nothing logged yet.</p>
      ) : (
        <div className="space-y-2 px-4">
          {entries.map((e) => (
            <HistoryCard key={`${e.kind}-${e.item.id}`} entry={e} busy={busyId === e.item.id} onDelete={deleteEntry} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryCard({
  entry,
  busy,
  onDelete,
}: {
  entry: Entry;
  busy: boolean;
  onDelete: (kind: Entry["kind"], id: string) => void;
}) {
  const { kind, item } = entry;
  const kindColor = kind === "workout" ? "bg-accent/20 text-accent" : kind === "run" ? "bg-run/20 text-run" : "bg-fuel/20 text-fuel";

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`pill ${kindColor} capitalize`}>{kind}</span>
          <span className="text-xs text-gray-500">{formatDateTime(item.logged_at)}</span>
        </div>
        <button onClick={() => onDelete(kind, item.id)} disabled={busy} className="text-xs text-gray-600 active:text-red-400">
          {busy ? "…" : "Delete"}
        </button>
      </div>

      {kind === "workout" && (
        <p className="mt-1 text-sm text-gray-300">
          {item.exercises.map((ex) => ex.name).join(", ") || item.raw_text}
        </p>
      )}
      {kind === "run" && (
        <p className="mt-1 text-sm text-gray-300">
          {item.distance_miles ?? "?"} mi · {formatPace(item.pace_seconds_per_mile)} · {formatDuration(item.duration_seconds)}
          {item.run_type ? ` · ${item.run_type}` : ""}
        </p>
      )}
      {kind === "meal" && (
        <p className="mt-1 text-sm text-gray-300">
          {item.items.join(", ") || item.raw_text} {item.calories ? `· ${item.calories} cal` : ""}
        </p>
      )}
    </div>
  );
}
