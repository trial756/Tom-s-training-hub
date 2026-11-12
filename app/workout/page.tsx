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

/** Time to change sides between the two halves of a two-sided hold. */
const SWITCH_MS = 5000;

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

  /**
   * The alert: three square-wave pips (a square wave carries far more than the
   * old soft sine, Nov 2026: "the ding could be louder") plus a buzz. `short`
   * is one pip, for "switch sides".
   */
  const chime = useCallback((short = false) => {
    try {
      navigator.vibrate?.(short ? 150 : [250, 120, 250, 120, 250]);
    } catch {}
    const ctx = audio.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const pips = short ? [{ at: 0, f: 1320 }] : [{ at: 0, f: 880 }, { at: 0.22, f: 880 }, { at: 0.44, f: 1320 }];
    for (const { at, f } of pips) {
      const t0 = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.01);
      gain.gain.setValueAtTime(0.6, t0 + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  }, []);

  // Rest over: chime once, then clear the timer.
  useEffect(() => {
    if (restLeft == null || restLeft > 0) return;
    chime();
    update((x) => ({ ...x, restEndsAt: null, restTotal: null }));
  }, [restLeft, update, chime]);

  // A hold: count down, switch sides when there are two, then tick the set and start the rest.
  const hold = w?.hold ?? null;
  const switching = hold?.switchUntil != null && now < hold.switchUntil;
  const holdLeft = hold ? (switching ? (hold.switchUntil! - now) / 1000 : (hold.endsAt - now) / 1000) : null;
  useEffect(() => {
    if (!hold) return;
    if (hold.switchUntil != null && now >= hold.switchUntil) {
      chime(true); // go
      update((x) => (x.hold ? { ...x, hold: { ...x.hold, switchUntil: null } } : x));
      return;
    }
    if (now < hold.endsAt) return;
    chime();
    if (hold.side === 1 && hold.sides === 2) {
      const t = Date.now();
      update((x) => (x.hold ? { ...x, hold: { ...x.hold, side: 2, switchUntil: t + SWITCH_MS, endsAt: t + SWITCH_MS + x.hold.seconds * 1000 } } : x));
      return;
    }
    update((x) => {
      const ex = x.exercises.find((e) => e.id === hold.exId);
      const totalSets = x.exercises.reduce((n, e) => n + e.sets.length, 0);
      const doneSets = x.exercises.reduce((n, e) => n + e.sets.filter((st) => st.done).length, 0);
      const last = doneSets + 1 >= totalSets;
      return {
        ...x,
        hold: null,
        exercises: x.exercises.map((e) =>
          e.id === hold.exId ? { ...e, sets: e.sets.map((st, j) => (j === hold.set ? { ...st, done: true } : st)) } : e
        ),
        ...(ex && !last ? { restEndsAt: Date.now() + ex.restSec * 1000, restTotal: ex.restSec } : {}),
      };
    });
  }, [hold, now, update, chime]);

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

  // The first tap is the gesture that lets the page make a sound later.
  function ensureAudio() {
    if (audio.current) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = new Ctx();
    } catch {}
  }

  function startHold(exId: string, i: number) {
    ensureAudio();
    update((x) => {
      const ex = x.exercises.find((e) => e.id === exId)!;
      const seconds = Number(ex.sets[i].reps) || 30;
      const t = Date.now();
      return {
        ...x,
        restEndsAt: null,
        restTotal: null,
        hold: { exId, set: i, side: 1, sides: ex.sides ?? 1, seconds, endsAt: t + seconds * 1000, switchUntil: null },
      };
    });
  }

  function toggleSet(exId: string, i: number) {
    ensureAudio();
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
    <div className={`px-4 ${w.restEndsAt || hold ? "pb-28" : ""}`}>
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
                {e.timed && (
                  <p className="text-xs text-muted">
                    Hold in seconds{e.sides === 2 ? " — each side; the timer runs both with a 5-second switch" : ""}. Tap ▶ to start.
                  </p>
                )}
                {e.sets.map((s, i) =>
                  e.timed ? (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-center text-xs text-faint">{i + 1}</span>
                      <input
                        aria-label={`${e.name} set ${i + 1} seconds`}
                        className={`input-field min-h-[44px] w-0 flex-1 text-center tabular-nums ${s.done ? "opacity-60" : ""}`}
                        inputMode="numeric"
                        placeholder="sec"
                        value={s.reps}
                        onChange={(ev) => setField(e.id, i, "reps", ev.target.value.replace(/\D/g, ""))}
                      />
                      <span className="text-xs text-faint">sec</span>
                      <button
                        type="button"
                        aria-label={`Start ${e.name} set ${i + 1}`}
                        disabled={s.done || !!hold}
                        onClick={() => startHold(e.id, i)}
                        className="flex h-11 min-w-[64px] shrink-0 items-center justify-center gap-1 rounded-xl border border-accent/60 px-3 text-sm font-semibold text-accent disabled:opacity-30"
                      >
                        ▶ Start
                      </button>
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
                  ) : (
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
                  )
                )}
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

      {hold && holdLeft != null && (
        <div className="fixed inset-x-0 bottom-[76px] z-40 mx-auto max-w-lg px-4">
          <div className={`overflow-hidden rounded-2xl border bg-base-900 shadow-lg ${switching ? "border-fuel/60" : "border-accent/60"}`}>
            <div
              className={`h-1 transition-[width] duration-200 ${switching ? "bg-fuel" : "bg-accent"}`}
              style={{ width: `${Math.min(100, (holdLeft / (switching ? SWITCH_MS / 1000 : hold.seconds)) * 100)}%` }}
            />
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1">
                <p className="text-xs uppercase tracking-wide text-faint">
                  {switching
                    ? "Switch sides"
                    : `Hold${hold.sides === 2 ? ` · ${hold.side === 1 ? "first" : "second"} side` : ""} · ${
                        w.exercises.find((e) => e.id === hold.exId)?.name ?? ""
                      }`}
                </p>
                <p className={`text-3xl font-bold tabular-nums ${switching ? "text-fuel" : "text-ink"}`}>{clock(Math.ceil(holdLeft))}</p>
              </div>
              <button
                type="button"
                className="h-11 rounded-xl bg-base-800 px-4 text-sm text-muted"
                onClick={() => update((x) => ({ ...x, hold: null }))}
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}

      {!hold && w.restEndsAt && restLeft != null && restLeft > 0 && (
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
