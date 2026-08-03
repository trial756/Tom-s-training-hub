"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CoachingNote from "@/components/CoachingNote";
import Spinner from "@/components/Spinner";
import UndoToast from "@/components/UndoToast";
import type { Favorite, Meal } from "@/lib/types";
import { formatDateTime, localDateKey } from "@/lib/format";
import { AUTO_FAVORITE_THRESHOLD, normalizeMealKey } from "@/lib/mealFavorites";

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: "bg-fuel/20 text-fuel",
  lunch: "bg-run/20 text-run",
  dinner: "bg-accent/20 text-accent",
  snack: "bg-purple-500/20 text-purple-300",
};

function todayISO(): string {
  return localDateKey(new Date());
}

// Local-date comparison (not toISOString() slicing) so "today" follows the
// device's calendar day rather than rolling over at UTC midnight.
function isToday(iso: string): boolean {
  return localDateKey(new Date(iso)) === localDateKey(new Date());
}

interface PendingDelete {
  meal: Meal;
  timeoutId: ReturnType<typeof setTimeout>;
}

export default function FuelPage() {
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Meal | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [starBusyKey, setStarBusyKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoadingData(true);
    try {
      const [m, f] = await Promise.all([
        fetch("/api/meals?limit=60").then((res) => res.json()),
        fetch("/api/favorites?type=meal").then((res) => res.json()),
      ]);
      setMeals(m.meals ?? []);
      setFavorites(f.favorites ?? []);
    } finally {
      setLoadingData(false);
    }
  }

  const favoriteByKey = useMemo(() => {
    const map = new Map<string, Favorite>();
    for (const f of favorites) {
      if (f.key) map.set(f.key, f);
    }
    return map;
  }, [favorites]);

  const favoriteChips = useMemo(() => {
    return favorites
      .filter((f) => f.manual || f.count >= AUTO_FAVORITE_THRESHOLD)
      .sort((a, b) => {
        if (a.manual !== b.manual) return a.manual ? -1 : 1;
        return b.count - a.count;
      });
  }, [favorites]);

  const todayMeals = useMemo(() => meals.filter((m) => isToday(m.logged_at)), [meals]);
  const historyMeals = useMemo(() => meals.filter((m) => !isToday(m.logged_at)), [meals]);

  const todayMacros = useMemo(() => {
    return todayMeals.reduce(
      (acc, m) => ({
        protein_g: acc.protein_g + (Number(m.protein_g) || 0),
        carbs_g: acc.carbs_g + (Number(m.carbs_g) || 0),
        fat_g: acc.fat_g + (Number(m.fat_g) || 0),
      }),
      { protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }, [todayMeals]);

  function applyFavorite(fav: Favorite) {
    setText(fav.raw_text);
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
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, logged_at: new Date(`${date}T12:00:00`).toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to log meal.");
      setLastSaved(json.meal);
      setText("");
      setDate(todayISO());
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStar(rawText: string) {
    const key = normalizeMealKey(rawText);
    const currentlyManual = favoriteByKey.get(key)?.manual ?? false;
    setStarBusyKey(key);
    try {
      await fetch("/api/favorites/meal-star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText, manual: !currentlyManual }),
      });
      const f = await fetch("/api/favorites?type=meal").then((res) => res.json());
      setFavorites(f.favorites ?? []);
    } finally {
      setStarBusyKey(null);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function requestDelete(meal: Meal) {
    setMeals((prev) => prev.filter((m) => m.id !== meal.id));
    const timeoutId = setTimeout(() => finalizeDelete(meal.id), 5000);
    setPendingDelete({ meal, timeoutId });
  }

  async function finalizeDelete(id: string) {
    setPendingDelete((prev) => (prev?.meal.id === id ? null : prev));
    await fetch(`/api/meals/${id}`, { method: "DELETE" });
  }

  function undoDelete() {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timeoutId);
    setMeals((prev) => [...prev, pendingDelete.meal].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()));
    setPendingDelete(null);
  }

  return (
    <div>
      <PageHeader title="Log a Meal" subtitle="Describe what you ate — macros are estimated automatically." />

      {favoriteChips.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {favoriteChips.map((fav) => (
            <button
              key={fav.id}
              type="button"
              onClick={() => applyFavorite(fav)}
              className="whitespace-nowrap rounded-full border border-base-600 bg-base-800 px-3.5 py-1.5 text-sm font-medium text-gray-300 transition-colors active:border-accent active:text-accent"
            >
              {fav.manual && <span className="mr-1 text-fuel">★</span>}
              {fav.name}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="px-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date</label>
        <input
          type="date"
          className="input-field mb-3"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={submitting}
        />

        <textarea
          ref={textareaRef}
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
                onClick={() => toggleStar(lastSaved.raw_text)}
                disabled={starBusyKey === normalizeMealKey(lastSaved.raw_text)}
                className="text-xs font-medium text-gray-400 active:text-fuel"
              >
                {favoriteByKey.get(normalizeMealKey(lastSaved.raw_text))?.manual ? "★ Starred" : "☆ Star"}
              </button>
            </div>
            <p className="text-sm text-gray-300">{lastSaved.items.map((i) => i.name).join(", ")}</p>
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
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Today's Macros</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="card py-3">
            <p className="text-lg font-bold text-white">{Math.round(todayMacros.protein_g)}g</p>
            <p className="text-[11px] text-gray-500">Protein</p>
          </div>
          <div className="card py-3">
            <p className="text-lg font-bold text-white">{Math.round(todayMacros.carbs_g)}g</p>
            <p className="text-[11px] text-gray-500">Carbs</p>
          </div>
          <div className="card py-3">
            <p className="text-lg font-bold text-white">{Math.round(todayMacros.fat_g)}g</p>
            <p className="text-[11px] text-gray-500">Fat</p>
          </div>
        </div>
      </div>

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Today's Meals</h2>
        {loadingData ? (
          <Spinner />
        ) : todayMeals.length === 0 ? (
          <p className="text-sm text-gray-500">No meals logged today.</p>
        ) : (
          <div className="space-y-2">
            {todayMeals.map((m) => (
              <MealCard
                key={m.id}
                meal={m}
                expanded={expanded.has(m.id)}
                onToggleExpand={() => toggleExpand(m.id)}
                starred={favoriteByKey.get(normalizeMealKey(m.raw_text))?.manual ?? false}
                starBusy={starBusyKey === normalizeMealKey(m.raw_text)}
                onToggleStar={() => toggleStar(m.raw_text)}
                onDelete={() => requestDelete(m)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Meal History</h2>
        {loadingData ? (
          <Spinner />
        ) : historyMeals.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing older logged yet.</p>
        ) : (
          <div className="space-y-2">
            {historyMeals.map((m) => (
              <MealCard
                key={m.id}
                meal={m}
                expanded={expanded.has(m.id)}
                onToggleExpand={() => toggleExpand(m.id)}
                starred={favoriteByKey.get(normalizeMealKey(m.raw_text))?.manual ?? false}
                starBusy={starBusyKey === normalizeMealKey(m.raw_text)}
                onToggleStar={() => toggleStar(m.raw_text)}
                onDelete={() => requestDelete(m)}
              />
            ))}
          </div>
        )}
      </div>

      {pendingDelete && (
        <UndoToast
          label="Meal deleted"
          onUndo={undoDelete}
          onExpire={() => finalizeDelete(pendingDelete.meal.id)}
        />
      )}
    </div>
  );
}

function MealCard({
  meal,
  expanded,
  onToggleExpand,
  starred,
  starBusy,
  onToggleStar,
  onDelete,
}: {
  meal: Meal;
  expanded: boolean;
  onToggleExpand: () => void;
  starred: boolean;
  starBusy: boolean;
  onToggleStar: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card">
      <button type="button" onClick={onToggleExpand} className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <span className={`pill ${MEAL_TYPE_COLORS[meal.meal_type ?? ""] ?? "bg-gray-500/20 text-gray-300"}`}>
            {meal.meal_type ?? "meal"}
          </span>
          <span className="text-xs text-gray-500">{formatDateTime(meal.logged_at)}</span>
        </div>
        <span className="text-xs text-gray-500">{meal.calories ?? "—"} cal</span>
      </button>

      <p className="mt-1 text-sm text-gray-300">{meal.items.map((i) => i.name).join(", ") || meal.raw_text}</p>

      {expanded && (
        <div className="mt-3 space-y-3">
          {meal.items.length > 0 && (
            <ul className="space-y-1.5">
              {meal.items.map((item, i) => (
                <li key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">{item.name}</span>
                  <span className="text-gray-500">
                    {item.calories_est ?? "—"} cal · {item.protein_g ?? "—"}p · {item.carbs_g ?? "—"}c · {item.fat_g ?? "—"}f
                  </span>
                </li>
              ))}
            </ul>
          )}
          <CoachingNote feedback={meal.coaching_feedback} />
          <div className="flex items-center justify-between border-t border-base-700 pt-3">
            <button
              onClick={onToggleStar}
              disabled={starBusy}
              className={`text-xs font-medium ${starred ? "text-fuel" : "text-gray-400 active:text-fuel"}`}
            >
              {starred ? "★ Starred" : "☆ Star"}
            </button>
            <button onClick={onDelete} className="text-xs text-gray-600 active:text-danger">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
