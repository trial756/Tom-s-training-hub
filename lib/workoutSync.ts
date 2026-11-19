import { loadActiveWorkout, saveActiveWorkout, type ActiveWorkout } from "@/lib/workoutSession";

// ── Backing up the workout in progress ───────────────────────────────
//
// Tom, Nov 2026: pausing should save progress so he can switch screens or
// leave it for hours without worrying. Every change is already written to
// the phone (localStorage); this also copies it to the server — at once on
// pause or when the app goes to the background, and every 30 s while it
// runs — so a cleared browser or another device can pick the workout up.
// A finished or discarded workout is remembered on the phone so a backup
// that couldn't be cleared (no signal) is never brought back.

const FINISHED_KEY = "tth-finished-workouts";

function finishedList(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(FINISHED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function markFinished(startedAt: number) {
  try {
    localStorage.setItem(FINISHED_KEY, JSON.stringify([startedAt, ...finishedList().filter((n) => n !== startedAt)].slice(0, 20)));
  } catch {}
}

/** Copies the workout to the server. Resolves to when it was saved, or null with no signal. */
export async function backupWorkout(w: ActiveWorkout, opts: { keepalive?: boolean } = {}): Promise<number | null> {
  if (!w.exercises.length) return null;
  try {
    const res = await fetch("/api/workout-session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workout: w }),
      keepalive: opts.keepalive,
    });
    return res.ok ? Date.now() : null;
  } catch {
    return null;
  }
}

/** The server's copy, unless that workout was already finished or discarded on this phone. */
export async function fetchBackup(): Promise<ActiveWorkout | null> {
  try {
    const res = await fetch("/api/workout-session", { cache: "no-store" });
    if (!res.ok) return null;
    const { workout } = (await res.json()) as { workout: ActiveWorkout | null };
    if (!workout || workout.version !== 1 || !Array.isArray(workout.exercises)) return null;
    if (finishedList().includes(workout.startedAt)) {
      void clearBackup(workout.startedAt);
      return null;
    }
    return workout;
  } catch {
    return null;
  }
}

/** The finished or discarded workout's backup goes; a newer one is left alone. */
export async function clearBackup(startedAt: number) {
  markFinished(startedAt);
  try {
    await fetch(`/api/workout-session?startedAt=${startedAt}`, { method: "DELETE", keepalive: true });
  } catch {}
}

/**
 * The workout to show: the phone's copy, or the server's when the phone has
 * none or the server's copy of the same workout is newer (another device).
 */
export function pickWorkout(local: ActiveWorkout | null, server: ActiveWorkout | null): ActiveWorkout | null {
  if (!server) return local;
  if (!local) return server;
  if (local.startedAt === server.startedAt && (server.updatedAt ?? 0) > (local.updatedAt ?? 0)) return server;
  return local;
}

/** Brings a backed-up workout onto this phone when the phone has lost its own. Once per app load. */
let restored = false;
export async function restoreIfMissing(): Promise<void> {
  if (restored) return;
  restored = true;
  const local = loadActiveWorkout();
  const server = await fetchBackup();
  const pick = pickWorkout(local, server);
  if (pick && pick !== local) saveActiveWorkout(pick, { keepTime: true });
}
