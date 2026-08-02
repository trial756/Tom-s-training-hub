"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CoachingNote from "@/components/CoachingNote";
import Spinner from "@/components/Spinner";
import type { Meal } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "bg-fuel/20 text-fuel",
  lunch: "bg-run/20 text-run",
  dinner: "bg-accent/20 text-accent",
  snack: "bg-purple-500/20 text-purple-300",
};

export default function FuelPage() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Meal | null>(null);
  const [recent, setRecent] = useState<Meal[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteSaved, setFavoriteSaved] = useState(false);

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/meals?limit=8");
      const json = await res.json();
      setRecent(json.meals ?? []);
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
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to log meal.");
      setLastSaved(json.meal);
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
      const name = window.prompt("Name this favorite:", lastSaved.items[0] ?? lastSaved.meal_type ?? "Meal");
      if (!name) return;
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "meal",
          name,
          raw_text: lastSaved.raw_text,
          data: {
            meal_type: lastSaved.meal_type,
            calories: lastSaved.calories,
            protein_g: lastSaved.protein_g,
            carbs_g: lastSaved.carbs_g,
            fat_g: lastSaved.fat_g,
            items: lastSaved.items,
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
      <PageHeader title="Log a Meal" subtitle="Describe what you ate — macros are estimated automatically." />

      <form onSubmit={handleSubmit} className="px-4">
        <textarea
          className="input-field min-h-[110px] resize-none"
          placeholder="e.g. Post-run breakfast: 3 eggs, oatmeal with banana and peanut butter, black coffee."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" className="btn-primary mt-3 w-full" disabled={submitting || !text.trim()}>
          {submitting ? "Parsing with AI…" : "Log Meal"}
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </form>

      {submitting && <Spinner label="Claude is estimating macros…" />}

      {lastSaved && !submitting && (
        <div className="mt-5 px-4">
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className={`pill ${MEAL_TYPE_COLORS[lastSaved.meal_type ?? ""] ?? "bg-gray-500/20 text-gray-300"}`}>
                {lastSaved.meal_type ?? "meal"}
              </span>
              <button
                onClick={saveFavorite}
                disabled={savingFavorite || favoriteSaved}
                className="text-xs font-medium text-gray-400 active:text-accent"
              >
                {favoriteSaved ? "★ Saved" : "☆ Save as favorite"}
              </button>
            </div>
            <p className="text-sm text-gray-300">{lastSaved.items.join(", ")}</p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-base font-bold text-white">{lastSaved.calories ?? "—"}</p>
                <p className="text-[10px] text-gray-500">cal</p>
              </div>
              <div>
                <p className="text-base font-bold text-white">{lastSaved.protein_g ?? "—"}g</p>
                <p className="text-[10px] text-gray-500">protein</p>
              </div>
              <div>
                <p className="text-base font-bold text-white">{lastSaved.carbs_g ?? "—"}g</p>
                <p className="text-[10px] text-gray-500">carbs</p>
              </div>
              <div>
                <p className="text-base font-bold text-white">{lastSaved.fat_g ?? "—"}g</p>
                <p className="text-[10px] text-gray-500">fat</p>
              </div>
            </div>
            <CoachingNote feedback={lastSaved.coaching_feedback} />
          </div>
        </div>
      )}

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Recent Meals</h2>
        {loadingRecent ? (
          <Spinner />
        ) : recent.length === 0 ? (
          <p className="text-sm text-gray-500">No meals logged yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((m) => (
              <div key={m.id} className="card">
                <div className="flex items-center justify-between">
                  <span className={`pill ${MEAL_TYPE_COLORS[m.meal_type ?? ""] ?? "bg-gray-500/20 text-gray-300"}`}>
                    {m.meal_type ?? "meal"}
                  </span>
                  <span className="text-xs text-gray-500">{formatDateTime(m.logged_at)}</span>
                </div>
                <p className="mt-1 text-sm text-gray-300">{m.items.join(", ") || m.raw_text}</p>
                <p className="mt-1 text-xs text-gray-500">{m.calories ?? "—"} cal</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
