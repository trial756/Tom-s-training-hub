"use client";

import { useEffect, useRef } from "react";
import { localDateKey, shiftDays, startOfLocalDay } from "@/lib/format";

// ── Refresh signals ───────────────────────────────────────────────────
//
// Each homepage section reloads on the signals that actually change it, not
// on a timer and not all together:
//
//   • data — something was logged or deleted. Sections name the kinds they
//     care about, so logging a meal reloads stats but leaves the plan and
//     body map alone.
//   • midnight — the athlete's day rolled over (APP_TIMEZONE) while the app
//     was open, so "today" and every rolling window moved.
//   • foreground — the app came back from the background. Phones keep the
//     tab alive for days; without this the plan opens on yesterday. Skipped
//     when the section loaded recently and the day hasn't changed, so a
//     quick app switch costs nothing.

export type DataKind = "workout" | "run" | "meal";

const EVENT = "training-hub:data-changed";
const CHANNEL = "training-hub-data";
const ALL_KINDS: DataKind[] = ["workout", "run", "meal"];

/** A foreground return reloads only if the section is at least this old. */
const FOREGROUND_STALE_MS = 5 * 60 * 1000;

/**
 * Announces a write so any mounted section that depends on it reloads —
 * in this tab and in any other open tab. Call after the write has landed.
 * Omit `kinds` for a change that touches everything (a backup restore).
 */
export function notifyDataChanged(...kinds: DataKind[]) {
  const detail = kinds.length ? kinds : ALL_KINDS;
  window.dispatchEvent(new CustomEvent<DataKind[]>(EVENT, { detail }));
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(detail);
    channel.close();
  } catch {
    // BroadcastChannel is missing on some older browsers; other tabs then
    // catch up on their next foreground instead.
  }
}

function msUntilNextLocalMidnight(): number {
  const next = startOfLocalDay(shiftDays(new Date(), 1));
  // A couple of seconds past, so the reload lands firmly on the new day.
  return Math.max(1000, next.getTime() - Date.now() + 2000);
}

/**
 * Calls `reload` when any of its signals fire. `reload` should refresh
 * quietly — keep current content on screen rather than flashing a spinner.
 * Mount-time loading stays with the caller; this only handles *re*loads.
 */
export function useRefreshOn(reload: () => void, opts: { kinds: DataKind[]; midnight?: boolean; foreground?: boolean }) {
  const { midnight = true, foreground = true } = opts;
  const kindsKey = opts.kinds.join(",");

  // Latest callback without re-subscribing on every render.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const lastLoad = useRef({ at: Date.now(), day: localDateKey(new Date()) });

  useEffect(() => {
    const kinds = kindsKey.split(",") as DataKind[];
    const run = () => {
      lastLoad.current = { at: Date.now(), day: localDateKey(new Date()) };
      reloadRef.current();
    };

    const onData = (changed: DataKind[]) => {
      if (changed.some((k) => kinds.includes(k))) run();
    };
    const onEvent = (e: Event) => onData((e as CustomEvent<DataKind[]>).detail ?? ALL_KINDS);
    window.addEventListener(EVENT, onEvent);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (e) => onData(Array.isArray(e.data) ? e.data : ALL_KINDS);
    } catch {
      channel = null;
    }

    // Mobile browsers pause timers in the background, so the midnight timer
    // can't be trusted alone; foreground also reloads whenever the day moved.
    const onForeground = () => {
      if (!foreground || document.visibilityState !== "visible") return;
      const dayChanged = localDateKey(new Date()) !== lastLoad.current.day;
      const stale = Date.now() - lastLoad.current.at >= FOREGROUND_STALE_MS;
      if (dayChanged || stale) run();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // Restored from the back/forward cache — the page never re-mounted.
      if (e.persisted) onForeground();
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("pageshow", onPageShow);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const armMidnight = () => {
      timer = setTimeout(() => {
        run();
        armMidnight();
      }, msUntilNextLocalMidnight());
    };
    if (midnight) armMidnight();

    return () => {
      window.removeEventListener(EVENT, onEvent);
      channel?.close();
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("pageshow", onPageShow);
      if (timer) clearTimeout(timer);
    };
  }, [kindsKey, midnight, foreground]);
}
