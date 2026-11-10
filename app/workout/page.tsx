"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UndoToast from "@/components/UndoToast";
import { localDateKey, loggedAtFor } from "@/lib/format";
import { notifyDataChanged } from "@/lib/refresh";
import { postOrQueue } from "@/lib/outbox";
import {
  completedExercises,
  elapsedMinutes,
  emptyWorkout,
  loadActiveWorkout,
  newExercise,
  saveActiveWorkout,
  workoutText,
  type ActiveSet,
  type ActiveWorkout,
} from "@/lib/workoutSession";

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

interface Logged {
  summary: string | null;
  coaching_feedback: string | null;
  vs_last_time: string | null;
}

export default function WorkoutPage() {
  const router = useRouter();
  const [w, setW] = useState<ActiveWorkout | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [adding, setAdding] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState<Logged | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  // Resume the workout on the phone, or start an empty one.
  useEffect(() => {
    setW(loadActiveWorkout() ?? emptyWorkout(localDateKey(new Date())));
  }, []);

  const update = useCallback((fn: (w: ActiveWorkout) => ActiveWorkout) => {
    setW((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      saveActiveWorkout(next);
      return next;
    });
  }, []);

  // The clock and rest countdown. Times are absolute, so a phone that slept
  // through part of the rest picks up the right number when it wakes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Keep the screen on between sets where the browser allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = () => {
      if (document.visibilityState === "visible" && nav.wakeLock) nav.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  const restLeft = w?.restEndsAt ? (w.restEndsAt - now) / 1000 : null;

  // Rest over: buzz and beep once, then clear the timer.
  useEffect(() => {
    if (restLeft == null || restLeft > 0) return;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {}
    const ctx = audio.current;
    if (ctx) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    }
    update((x) => ({ ...x, restEndsAt: null, restTotal: null }));
  }, [restLeft, update]);

  if (!w) return null;

  const total = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  function setField(exId: string, i: number, field: "weight" | "reps", value: string) {
    update((x) => ({
      ...x,
      exercises: x.exercises.map((e) => {
        if (e.id !== exId) return e;
        const old = e.sets[i][field];
        // A change carries to the later sets that still had the old number,
        // so dropping the weight on set 1 doesn't mean retyping sets 2 and 3.
        return {
          ...e,
          sets: e.sets.map((s, j) => (j === i || (j > i && !s.done && s[field] === old) ? { ...s, [field]: value } : s)),
        };
      }),
    }));
  }

  function toggleSet(exId: string, i: number) {
    // The first tap is the gesture that lets the page make a sound later.
    if (!audio.current) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audio.current = new Ctx();
      } catch {}
    }
    update((x) => {
      const ex = x.exercises.find((e) => e.id === exId)!;
      const wasDone = ex.sets[i].done;
      const isLastSetOverall = !wasDone && done + 1 === total;
      return {
        ...x,
        exercises: x.exercises.map((e) => (e.id === exId ? { ...e, sets: e.sets.map((s, j) => (j === i ? { ...s, done: !s.done } : s)) } : e)),
        // Ticking a set starts the rest; unticking leaves any rest alone.
        ...(wasDone || isLastSetOverall ? {} : { restEndsAt: Date.now() + ex.restSec * 1000, restTotal: ex.restSec }),
      };
    });
  }

  function addSet(exId: string) {
    update((x) => ({
      ...x,
      exercises: x.exercises.map((e) => {
        if (e.id !== exId) return e;
        const last: ActiveSet | undefined = e.sets[e.sets.length - 1];
        return { ...e, sets: [...e.sets, { weight: last?.weight ?? "", reps: last?.reps ?? "", done: false }] };
      }),
    }));
  }

  function removeSet(exId: string) {
    update((x) => ({
      ...x,
      exercises: x.exercises
        .map((e) => (e.id === exId ? { ...e, sets: e.sets.slice(0, -1) } : e))
        .filter((e) => e.id !== exId || e.sets.length > 0),
    }));
  }

  function addExercise() {
    if (!adding.trim()) return;
    update((x) => ({ ...x, exercises: [...x.exercises, newExercise(adding)] }));
    setAdding("");
  }

  const adjustRest = (delta: number) =>
    update((x) => (x.restEndsAt ? { ...x, restEndsAt: Math.max(Date.now() + 1000, x.restEndsAt + delta * 1000), restTotal: (x.restTotal ?? 0) + delta } : x));

  async function finish() {
    if (!w) return;
    const exercises = completedExercises(w);
    if (!exercises.length) {
      setError("Tick at least one set first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await postOrQueue<{ workout: Logged }>(
        "/api/workouts",
        { text: workoutText(w, notes), exercises, duration_minutes: elapsedMinutes(w), logged_at: loggedAtFor(w.date) },
        { kind: "workout", label: `Workout · ${w.title}` }
      );
      if (!result.queued && !result.ok) throw new Error(result.error);
      saveActiveWorkout(null);
      if (result.queued) {
        setLogged({ summary: `${w.title} — saved on this phone`, coaching_feedback: "No signal right now. It syncs by itself when you're back online, and the coaching arrives then.", vs_last_time: null });
        return;
      }
      notifyDataChanged("workout");
      setLogged(result.data.workout);
    } catch (err) {
      // The workout stays on the phone, so nothing is lost; try again.
      setError(err instanceof Error ? `${err.message} Your sets are saved on this phone — try again.` : "Couldn't log the workout.");
    } finally {
      setSaving(false);
    }
  }

  if (logged) {
    return (
      <div className="space-y-4 px-4">
        <h1 className="text-2xl font-bold text-ink">Logged ✓</h1>
        <div className="card space-y-3">
          {logged.summary && <p className="text-base font-semibold text-ink">{logged.summary}</p>}
          {logged.coaching_feedback && <p className="text-sm text-gray-300">{logged.coaching_feedback}</p>}
          {logged.vs_last_time && (
            <div className="rounded-lg bg-base-800 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">vs last time</p>
              <p className="text-sm text-gray-300">{logged.vs_last_time}</p>
            </div>
          )}
        </div>
        <button type="button" className="btn-primary min-h-[44px] w-full" onClick={() => router.push("/")}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className={`px-4 ${w.restEndsAt ? "pb-28" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-ink">{w.title}</h1>
          <p className="text-sm text-muted">
            {clock((now - w.startedAt) / 1000)} · {done}/{total} sets
          </p>
        </div>
        <Link href="/" className="min-h-[44px] shrink-0 pt-2 text-sm text-faint">
          Hide
        </Link>
      </div>

      <div className="space-y-3">
        {w.exercises.map((e) => {
          const exDone = e.sets.length > 0 && e.sets.every((s) => s.done);
          return (
            <div key={e.id} className={`card ${exDone ? "border-accent/40" : ""}`}>
              <div className="mb-2">
                <p className="text-base font-semibold text-ink">{e.name}</p>
                {e.target && <p className="text-xs text-muted">Plan: {e.target}</p>}
                {e.note && <p className="text-xs text-accent">{e.note}</p>}
                {e.cue && <p className="text-xs text-faint">New: {e.cue}</p>}
              </div>
              <div className="space-y-1.5">
                {e.sets.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-center text-xs text-faint">{i + 1}</span>
                    <input
                      aria-label={`${e.name} set ${i + 1} weight`}
                      className={`input-field min-h-[44px] w-0 flex-1 text-center tabular-nums ${s.done ? "opacity-60" : ""}`}
                      inputMode="decimal"
                      placeholder="lb"
                      value={s.weight}
                      onChange={(ev) => setField(e.id, i, "weight", ev.target.value.replace(/[^\d.]/g, ""))}
                    />
                    <span className="text-faint">×</span>
                    <input
                      aria-label={`${e.name} set ${i + 1} reps`}
                      className={`input-field min-h-[44px] w-0 flex-1 text-center tabular-nums ${s.done ? "opacity-60" : ""}`}
                      inputMode="numeric"
                      placeholder="reps"
                      value={s.reps}
                      onChange={(ev) => setField(e.id, i, "reps", ev.target.value.replace(/\D/g, ""))}
                    />
                    <button
                      type="button"
                      aria-label={s.done ? `Untick set ${i + 1}` : `Tick set ${i + 1}`}
                      aria-pressed={s.done}
                      onClick={() => toggleSet(e.id, i)}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-bold ${
                        s.done ? "border-accent bg-accent text-base-950" : "border-base-600 bg-base-800 text-faint"
                      }`}
                    >
                      ✓
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" className="min-h-[44px] flex-1 rounded-xl text-sm text-muted active:bg-base-800" onClick={() => addSet(e.id)}>
                  + Set
                </button>
                <button type="button" className="min-h-[44px] flex-1 rounded-xl text-sm text-faint active:bg-base-800" onClick={() => removeSet(e.id)}>
                  − Set
                </button>
              </div>
            </div>
          );
        })}

        <div className="flex gap-2">
          <input
            className="input-field min-h-[44px] flex-1"
            placeholder="Add an exercise"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addExercise()}
          />
          <button type="button" className="btn-secondary min-h-[44px] px-4 text-sm" disabled={!adding.trim()} onClick={addExercise}>
            Add
          </button>
        </div>

        <textarea
          className="input-field min-h-[70px] resize-none text-sm"
          placeholder="Notes (optional): how it felt, anything that hurt…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button type="button" className="btn-primary min-h-[48px] w-full" disabled={saving || done === 0} onClick={finish}>
          {saving ? "Logging…" : `Finish & log ${done} set${done === 1 ? "" : "s"}`}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="button" className="min-h-[44px] w-full text-sm text-faint" onClick={() => setDiscarding(true)} disabled={saving}>
          Discard workout
        </button>
      </div>

      {w.restEndsAt && restLeft != null && restLeft > 0 && (
        <div className="fixed inset-x-0 bottom-[76px] z-40 mx-auto max-w-lg px-4">
          <div className="overflow-hidden rounded-2xl border border-base-700 bg-base-900 shadow-lg">
            <div className="h-1 bg-accent transition-[width] duration-200" style={{ width: `${Math.min(100, (restLeft / (w.restTotal || 1)) * 100)}%` }} />
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1">
                <p className="text-xs uppercase tracking-wide text-faint">Rest</p>
                <p className="text-2xl font-bold tabular-nums text-ink">{clock(restLeft)}</p>
              </div>
              <button type="button" className="h-11 min-w-[44px] rounded-xl bg-base-800 px-3 text-sm text-muted" onClick={() => adjustRest(-15)}>
                −15
              </button>
              <button type="button" className="h-11 min-w-[44px] rounded-xl bg-base-800 px-3 text-sm text-muted" onClick={() => adjustRest(15)}>
                +15
              </button>
              <button
                type="button"
                className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-base-950"
                onClick={() => update((x) => ({ ...x, restEndsAt: null, restTotal: null }))}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {discarding && (
        <UndoToast
          label="Workout discarded"
          onUndo={() => setDiscarding(false)}
          onExpire={() => {
            saveActiveWorkout(null);
            router.push("/");
          }}
        />
      )}
    </div>
  );
}
