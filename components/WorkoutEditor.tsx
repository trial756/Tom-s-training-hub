"use client";

import { useState } from "react";
import type { Workout } from "@/lib/types";
import { localDateKey, loggedAtFor } from "@/lib/format";

interface SetRow {
  reps: string;
  weight: string;
  unit: string | null;
}
interface ExerciseRow {
  name: string;
  sets: SetRow[];
}

const str = (v: number | null | undefined) => (v == null ? "" : String(v));

/**
 * Edits a logged workout in place. Row edits save without an AI call, so a
 * fixed number is saved exactly as typed; "Re-parse from text" is there for a
 * rewrite too big to fix row by row.
 */
export default function WorkoutEditor({
  workout,
  onSaved,
  onCancel,
}: {
  workout: Workout;
  onSaved: (w: Workout) => void;
  onCancel: () => void;
}) {
  const originalDate = localDateKey(new Date(workout.logged_at));
  const [date, setDate] = useState(originalDate);
  const [rows, setRows] = useState<ExerciseRow[]>(() =>
    workout.exercises.map((e) => ({
      name: e.name,
      sets: (e.sets.length ? e.sets : [{ reps: null, weight: null, weight_unit: null }]).map((s) => ({
        reps: str(s.reps),
        weight: str(s.weight),
        unit: s.weight_unit,
      })),
    }))
  );
  const [notes, setNotes] = useState(workout.notes ?? "");
  const [reparsing, setReparsing] = useState(false);
  const [text, setText] = useState(workout.raw_text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (i: number, patch: Partial<ExerciseRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const updateSet = (i: number, j: number, patch: Partial<SetRow>) =>
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, sets: r.sets.map((s, k) => (k === j ? { ...s, ...patch } : s)) } : r))
    );

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      if (date !== originalDate) body.logged_at = loggedAtFor(date);
      const res = await fetch(`/api/workouts/${workout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save changes.");
      onSaved(json.workout);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const saveRows = () =>
    save({
      notes,
      exercises: rows.map((r) => ({
        name: r.name,
        sets: r.sets.map((s) => ({ reps: s.reps, weight: s.weight, weight_unit: s.unit ?? (s.weight ? "lb" : null) })),
      })),
    });

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date</label>
        <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} />
      </div>

      {reparsing ? (
        <>
          <textarea
            className="input-field min-h-[140px] resize-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={saving}
          />
          <p className="text-[11px] text-faint">Re-parsing replaces the exercises and coaching note with a fresh read of this text.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1 text-sm" disabled={saving || !text.trim()} onClick={() => save({ text })}>
              {saving ? "Re-parsing…" : "Re-parse"}
            </button>
            <button type="button" className="btn-secondary text-sm" disabled={saving} onClick={() => setReparsing(false)}>
              Back
            </button>
          </div>
        </>
      ) : (
        <>
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg bg-base-800 p-2.5">
              <div className="mb-2 flex gap-2">
                <input
                  className="input-field flex-1"
                  value={row.name}
                  placeholder="Exercise"
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  className="min-h-[44px] shrink-0 px-2 text-xs text-gray-500 active:text-danger"
                  aria-label={`Remove ${row.name || "exercise"}`}
                  disabled={saving}
                >
                  Remove
                </button>
              </div>
              <div className="space-y-1.5">
                {row.sets.map((set, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-[11px] text-faint">Set {j + 1}</span>
                    <input
                      className="input-field w-0 flex-1"
                      inputMode="numeric"
                      placeholder="reps"
                      value={set.reps}
                      onChange={(e) => updateSet(i, j, { reps: e.target.value })}
                      disabled={saving}
                    />
                    <span className="text-xs text-faint">×</span>
                    <input
                      className="input-field w-0 flex-1"
                      inputMode="decimal"
                      placeholder={set.unit ?? "lb"}
                      value={set.weight}
                      onChange={(e) => updateSet(i, j, { weight: e.target.value })}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      onClick={() => updateRow(i, { sets: row.sets.filter((_, k) => k !== j) })}
                      className="min-h-[44px] w-8 shrink-0 text-gray-600 active:text-danger"
                      aria-label={`Remove set ${j + 1}`}
                      disabled={saving}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                // A new set starts as a copy of the last — usually only one number changes.
                onClick={() => updateRow(i, { sets: [...row.sets, { ...(row.sets[row.sets.length - 1] ?? { reps: "", weight: "", unit: null }) }] })}
                className="mt-2 min-h-[44px] w-full rounded-lg border border-dashed border-base-600 text-xs font-medium text-gray-400 active:border-accent active:text-accent"
                disabled={saving}
              >
                + Set
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { name: "", sets: [{ reps: "", weight: "", unit: null }] }])}
            className="min-h-[44px] w-full rounded-lg border border-dashed border-base-600 text-xs font-medium text-gray-400 active:border-accent active:text-accent"
            disabled={saving}
          >
            + Exercise
          </button>

          <textarea
            className="input-field min-h-[60px] resize-none"
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
          />

          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1 text-sm" disabled={saving} onClick={saveRows}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="btn-secondary text-sm" disabled={saving} onClick={onCancel}>
              Cancel
            </button>
          </div>
          <button
            type="button"
            onClick={() => setReparsing(true)}
            className="min-h-[44px] w-full text-xs text-muted active:text-accent"
            disabled={saving}
          >
            Re-parse from text instead
          </button>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
