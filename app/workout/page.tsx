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
  elapsedMs,
  pauseWorkout,
  resumeWorkout,
  emptyWorkout,
  loadActiveWorkout,
  newExercise,
  saveActiveWorkout,
  setCounts,
  workoutText,
  type ActiveSet,
  type ActiveWorkout,
} from "@/lib/workoutSession";
import { backupWorkout, clearBackup, fetchBackup, pickWorkout } from "@/lib/workoutSync";
import { blockLabel } from "@/lib/planner/blocks";

const BACKUP_EVERY_MS = 30_000;

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
  // When the server last had a copy, and the change it had (updatedAt).
  const [backedUpAt, setBackedUpAt] = useState<number | null>(null);
  const backedVersion = useRef<number>(0);
  const [offline, setOffline] = useState(false);

  // Resume the workout on the phone — or the server's copy if the phone lost
  // it or another device moved it on — else start an empty one.
  useEffect(() => {
    const local = loadActiveWorkout();
    setW(local ?? emptyWorkout(localDateKey(new Date())));
    fetchBackup().then((server) => {
      const pick = pickWorkout(local, server);
      if (pick && pick !== local) {
        saveActiveWorkout(pick, { keepTime: true });
        setW(pick);
      }
      if (server && pick?.startedAt === server.startedAt && (pick.updatedAt ?? 0) <= (server.updatedAt ?? 0)) {
        backedVersion.current = server.updatedAt ?? 0;
        setBackedUpAt(server.updatedAt ?? Date.now());
      }
    });
  }, []);

  // The backup: every 30 s when something changed, and at once when the app
  // goes to the background. Pause backs up straight away (see pause()).
  const latest = useRef<ActiveWorkout | null>(null);
  latest.current = w;
  const backup = useCallback(async (keepalive = false) => {
    const cur = latest.current;
    if (!cur || !cur.exercises.length || (cur.updatedAt ?? 0) <= backedVersion.current) return;
    const at = await backupWorkout(cur, { keepalive });
    if (at) {
      backedVersion.current = cur.updatedAt ?? at;
      setBackedUpAt(at);
      setOffline(false);
    } else setOffline(true);
  }, []);
  useEffect(() => {
    const t = setInterval(() => void backup(), BACKUP_EVERY_MS);
    const hidden = () => {
      if (document.visibilityState === "hidden") void backup(true);
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", hidden);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", hidden);
    };
  }, [backup]);

  const update = useCallback((fn: (w: ActiveWorkout) => ActiveWorkout) => {
    setW((cur) => {
      if (!cur) return cur;
      const next = { ...fn(cur), updatedAt: Date.now() };
      saveActiveWorkout(next, { keepTime: true });
      latest.current = next;
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
      // A stretch or warm-up hold never starts a rest.
      const last = doneSets + 1 >= totalSets || (ex?.block ?? "main") !== "main";
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

  const { total, done, anyDone } = setCounts(w);
  const paused = !!w.pausedAt;
  const runDay = !!w.runDay;
  const hasStrides = w.exercises.some((x) => x.block === "after" && /strides?\b/i.test(x.name));

  function pause() {
    update((x) => pauseWorkout(x));
    // Straight to the server too, so nothing rides on the phone alone while paused.
    setTimeout(() => void backup(), 0);
  }

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
    if (paused) update((x) => resumeWorkout(x));
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
    // Ticking a set picks a paused workout back up.
    if (paused) update((x) => resumeWorkout(x));
    update((x) => {
      const ex = x.exercises.find((e) => e.id === exId)!;
      const wasDone = ex.sets[i].done;
      const isLastSetOverall = !wasDone && done + 1 === total;
      const checklist = (ex.block ?? "main") !== "main";
      return {
        ...x,
        exercises: x.exercises.map((e) => (e.id === exId ? { ...e, sets: e.sets.map((s, j) => (j === i ? { ...s, done: !s.done } : s)) } : e)),
        // Ticking a set starts the rest; unticking, or ticking off a stretch, leaves it alone.
        ...(wasDone || isLastSetOverall || checklist ? {} : { restEndsAt: Date.now() + ex.restSec * 1000, restTotal: ex.restSec }),
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
      setError("Tick at least one set or stretch first.");
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
      void clearBackup(w.startedAt);
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
            {clock(elapsedMs(w, now) / 1000)}
            {paused ? " · paused" : ""} · {done}/{total} sets
          </p>
          {w.exercises.length > 0 && (
            <p className={`text-xs ${offline ? "text-fuel" : "text-accent"}`}>
              Saved ✓
              <span className="text-faint">
                {offline
                  ? " on this phone · backup waits for signal"
                  : backedUpAt
                    ? ` · backed up ${new Date(backedUpAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                    : " on this phone"}
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-1">
          {!paused && (
            <button type="button" className="min-h-[44px] rounded-xl border border-base-600 px-3 text-sm text-muted" onClick={pause}>
              Pause
            </button>
          )}
          <Link href="/" className="flex min-h-[44px] items-center px-2 text-sm text-faint">
            Hide
          </Link>
        </div>
      </div>

      {paused && (
        <div className="card mb-3 space-y-3 border-fuel/50">
          <div>
            <p className="text-base font-semibold text-ink">Paused</p>
            <p className="text-sm text-muted">
              {done}/{total} sets done. Everything is saved — on this phone and backed up — and the clock is stopped.
              Switch screens, close the app, carry on at home later. Tap Resume (or tick a set) to pick it back up, then
              Finish &amp; log once at the end.
            </p>
          </div>
          <button type="button" className="btn-primary min-h-[48px] w-full" onClick={() => update((x) => resumeWorkout(x))}>
            Resume
          </button>
        </div>
      )}

      <div className="space-y-3">
        {w.exercises.map((e, idx) => {
          const exDone = e.sets.length > 0 && e.sets.every((s) => s.done);
          const block = e.block ?? "main";
          const prevBlock = idx > 0 ? (w.exercises[idx - 1].block ?? "main") : null;
          const heading =
            block !== prevBlock && w.exercises.some((x) => (x.block ?? "main") !== "main") ? (
              <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {blockLabel(block, runDay, block === "after" && hasStrides)}
              </p>
            ) : null;
          if (block !== "main") {
            const s = e.sets[0];
            return (
              <div key={e.id} className="space-y-3">
                {heading}
                <div className={`flex items-start gap-3 rounded-xl border bg-base-900 p-3 ${s?.done ? "border-accent/40" : "border-base-700"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {e.name} <span className="font-normal text-muted">· {e.reps ?? e.target}</span>
                    </p>
                    {e.cue && <p className={`mt-0.5 text-xs leading-snug ${e.isNew ? "text-gray-300" : "text-faint"}`}>{e.cue}</p>}
                  </div>
                  {e.timed && s && !s.done && (
                    <button
                      type="button"
                      aria-label={`Start ${e.name}`}
                      disabled={!!hold}
                      onClick={() => startHold(e.id, 0)}
                      className="flex h-11 min-w-[56px] shrink-0 items-center justify-center rounded-xl border border-accent/60 px-2 text-sm font-semibold text-accent disabled:opacity-30"
                    >
                      ▶ {s.reps || "30"}s
                    </button>
                  )}
                  {s && (
                    <button
                      type="button"
                      aria-label={s.done ? `Untick ${e.name}` : `Tick ${e.name}`}
                      aria-pressed={s.done}
                      onClick={() => toggleSet(e.id, 0)}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-bold ${
                        s.done ? "border-accent bg-accent text-base-950" : "border-base-600 bg-base-800 text-faint"
                      }`}
                    >
                      ✓
                    </button>
                  )}
                </div>
              </div>
            );
          }
          return (
            <div key={e.id} className="space-y-3">
            {heading}
            <div className={`card ${exDone ? "border-accent/40" : ""}`}>
              <div className="mb-2">
                <p className="text-base font-semibold text-ink">{e.name}</p>
                {e.target && <p className="text-xs text-muted">Plan: {e.target}</p>}
                {e.note && <p className="text-xs text-accent">{e.note}</p>}
                {e.cue && (
                  <p className={`mt-1 text-xs leading-snug ${e.isNew ? "text-gray-300" : "text-faint"}`}>
                    {e.isNew && <span className="font-semibold text-accent">New · how: </span>}
                    {e.cue}
                  </p>
                )}
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
        <button type="button" className="btn-primary min-h-[48px] w-full" disabled={saving || !anyDone} onClick={finish}>
          {saving ? "Logging…" : done > 0 ? `Finish & log ${done} set${done === 1 ? "" : "s"}` : "Finish & log"}
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
            if (w) void clearBackup(w.startedAt);
            saveActiveWorkout(null);
            router.push("/");
          }}
        />
      )}
    </div>
  );
}
