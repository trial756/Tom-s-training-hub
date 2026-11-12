"use client";

import { useState } from "react";
import { totalsOf } from "@/lib/foods";
import type { Meal, MealItem } from "@/lib/types";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type Row = { name: string; calories_est: string; protein_g: string; carbs_g: string; fat_g: string };
const FIELDS: { key: keyof Omit<Row, "name">; label: string }[] = [
  { key: "calories_est", label: "cal" },
  { key: "protein_g", label: "protein" },
  { key: "carbs_g", label: "carbs" },
  { key: "fat_g", label: "fat" },
];

const str = (v: number | null) => (v == null ? "" : String(v));
const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const toItem = (r: Row): MealItem => ({
  name: r.name.trim(),
  calories_est: num(r.calories_est),
  protein_g: num(r.protein_g),
  carbs_g: num(r.carbs_g),
  fat_g: num(r.fat_g),
});

/**
 * Fix a meal by hand: items, amounts in the name ("half", "1.5 tbsp"),
 * numbers, meal type. Saves exactly as typed; every item changed is
 * remembered in the food library so the AI reads it right next time.
 */
export default function MealEditor({
  meal,
  onSaved,
  onCancel,
}: {
  meal: Meal;
  onSaved: (meal: Meal, learned: string[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    (meal.items.length ? meal.items : [{ name: "", calories_est: null, protein_g: null, carbs_g: null, fat_g: null }]).map((i) => ({
      name: i.name,
      calories_est: str(i.calories_est),
      protein_g: str(i.protein_g),
      carbs_g: str(i.carbs_g),
      fat_g: str(i.fat_g),
    }))
  );
  const [mealType, setMealType] = useState(meal.meal_type ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const items = rows.map(toItem).filter((i) => i.name);
  const t = totalsOf(items);

  async function save() {
    if (!items.length) {
      setError("Add at least one item.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meals/${meal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, ...(mealType ? { meal_type: mealType } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      onSaved(json.meal, json.learned ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {MEAL_TYPES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMealType(m)}
            className={`min-h-[36px] rounded-full px-3 text-xs font-medium ${
              mealType === m ? "bg-accent text-base-950" : "border border-base-600 bg-base-800 text-muted"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {rows.map((r, i) => (
        <div key={i} className="space-y-1.5 rounded-xl border border-base-700 bg-base-800/60 p-2">
          <div className="flex gap-2">
            <input
              aria-label={`Item ${i + 1} name`}
              className="input-field min-h-[44px] flex-1 text-sm"
              placeholder="Food and amount, e.g. half a bagel"
              value={r.name}
              onChange={(e) => set(i, { name: e.target.value })}
            />
            <button
              type="button"
              aria-label={`Remove item ${i + 1}`}
              className="min-h-[44px] min-w-[44px] text-faint active:text-danger"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <input
                  aria-label={`Item ${i + 1} ${f.label}`}
                  className="input-field min-h-[44px] w-full px-1 text-center text-sm tabular-nums"
                  inputMode="decimal"
                  value={r[f.key]}
                  onChange={(e) => set(i, { [f.key]: e.target.value.replace(/[^\d.]/g, "") } as Partial<Row>)}
                />
                <span className="mt-0.5 block text-center text-[10px] text-faint">{f.label === "cal" ? "cal" : `${f.label} g`}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn-secondary min-h-[44px] w-full text-sm"
        onClick={() => setRows((rs) => [...rs, { name: "", calories_est: "", protein_g: "", carbs_g: "", fat_g: "" }])}
      >
        + Add item
      </button>

      <p className="text-xs text-muted">
        Total {t.calories ?? "—"} cal · {t.protein_g ?? "—"}g protein · {t.carbs_g ?? "—"}g carbs · {t.fat_g ?? "—"}g fat
      </p>
      <p className="text-[11px] text-faint">Items you change are remembered, so the AI uses your numbers next time.</p>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary min-h-[44px] flex-1 text-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn-primary min-h-[44px] flex-1 text-sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
