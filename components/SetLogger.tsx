"use client";

import { useState } from "react";
import { draftExercise, type DraftExercise, type RecentSets } from "@/lib/workoutTemplates";

/**
 * Logs a workout set by set, the way workout mode does but after the fact:
 * every filled-in row counts, no ticking. Changing a number carries to the
 * later sets that still had the old one, so a dropped weight is typed once.
 */
export default function SetLogger({
  draft,
  onChange,
  recent,
  disabled,
}: {
  draft: DraftExercise[];
  onChange: (d: DraftExercise[]) => void;
  recent: RecentSets;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState("");

  const update = (id: string, fn: (e: DraftExercise) => DraftExercise) => onChange(draft.map((e) => (e.id === id ? fn(e) : e)));
  const setField = (id: string, i: number, field: "weight" | "reps", value: string) =>
    update(id, (e) => {
      const old = e.sets[i][field];
      return { ...e, sets: e.sets.map((s, j) => (j === i || (j > i && s[field] === old) ? { ...s, [field]: value } : s)) };
    });
  const addSet = (id: string) =>
    update(id, (e) => ({ ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] ?? { weight: "", reps: "" }) }] }));
  const removeSet = (id: string) => update(id, (e) => ({ ...e, sets: e.sets.slice(0, -1) }));
  const remove = (id: string) => onChange(draft.filter((e) => e.id !== id));
  const add = () => {
    if (!adding.trim()) return;
    onChange([...draft, draftExercise(adding.trim(), 3, "", recent)]);
    setAdding("");
  };

  return (
    <div className="space-y-3">
      {draft.map((e) => (
        <div key={e.id} className="card">
          <div className="mb-2 flex items-center gap-2">
            <input
              aria-label="Exercise name"
              className="input-field min-h-[44px] flex-1 text-base font-semibold"
              value={e.name}
              disabled={disabled}
              onChange={(ev) => update(e.id, (x) => ({ ...x, name: ev.target.value }))}
            />
            <button
              type="button"
              aria-label={`Remove ${e.name}`}
              disabled={disabled}
              className="min-h-[44px] min-w-[44px] shrink-0 text-faint active:text-danger"
              onClick={() => remove(e.id)}
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5">
            {e.sets.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs text-faint">{i + 1}</span>
                <input
                  aria-label={`${e.name} set ${i + 1} weight`}
                  className="input-field min-h-[44px] w-0 flex-1 text-center tabular-nums"
                  inputMode="decimal"
                  placeholder="lb"
                  value={s.weight}
                  disabled={disabled}
                  onChange={(ev) => setField(e.id, i, "weight", ev.target.value.replace(/[^\d.]/g, ""))}
                />
                <span className="text-faint">×</span>
                <input
                  aria-label={`${e.name} set ${i + 1} ${e.timed ? "seconds" : "reps"}`}
                  className="input-field min-h-[44px] w-0 flex-1 text-center tabular-nums"
                  inputMode="numeric"
                  placeholder={e.timed ? "sec" : "reps"}
                  value={s.reps}
                  disabled={disabled}
                  onChange={(ev) => setField(e.id, i, "reps", ev.target.value.replace(/\D/g, ""))}
                />
                {e.timed && <span className="w-7 shrink-0 text-xs text-faint">sec</span>}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={disabled} className="min-h-[44px] flex-1 rounded-xl text-sm text-muted active:bg-base-800" onClick={() => addSet(e.id)}>
              + Set
            </button>
            <button
              type="button"
              disabled={disabled || e.sets.length <= 1}
              className="min-h-[44px] flex-1 rounded-xl text-sm text-faint active:bg-base-800 disabled:opacity-40"
              onClick={() => removeSet(e.id)}
            >
              − Set
            </button>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <input
          className="input-field min-h-[44px] flex-1"
          placeholder={draft.length ? "Add an exercise" : "Add your first exercise"}
          value={adding}
          disabled={disabled}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-secondary min-h-[44px] px-4 text-sm" disabled={disabled || !adding.trim()} onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}
