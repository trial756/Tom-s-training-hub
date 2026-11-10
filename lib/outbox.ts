"use client";

import { notifyDataChanged, type DataKind } from "@/lib/refresh";

// ── Offline logging ───────────────────────────────────────────────────
//
// Every log entry (workout, run, meal, weigh-in, finished workout) goes
// through `postOrQueue`. With signal it's an ordinary POST. Without — or if
// the signal drops mid-request — the entry is kept on the phone and sent
// later, in order, when the app is back online. Each entry carries a
// `client_id` from the moment it's made, so a request that did reach the
// server but lost its answer is matched on retry instead of saved twice
// (lib/clientId.ts). The timestamp is fixed when it's logged, not when it
// syncs, so a run logged at 7am offline still lands at 7am.

export interface OutboxItem {
  id: string;
  url: string;
  body: Record<string, unknown>;
  kind: DataKind;
  /** What the entry is, for the banner: "Run · 4.0 mi". */
  label: string;
  createdAt: number;
  attempts: number;
  /** Set when the server rejected it outright (bad data) — it won't retry on its own. */
  failed?: string | null;
}

const KEY = "tth-outbox";
const EVENT = "tth-outbox";

export function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function readOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeOutbox(list: OutboxItem[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function onOutboxChange(fn: () => void): () => void {
  const storage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", storage);
  };
}

export function discardOutboxItem(id: string) {
  writeOutbox(readOutbox().filter((i) => i.id !== id));
}

/** A failure that means "no connection", as opposed to the server saying no. */
function isNetworkError(err: unknown) {
  return err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError");
}

export type PostResult<T> = { queued: false; ok: true; data: T } | { queued: false; ok: false; error: string } | { queued: true };

/**
 * POSTs a log entry, or keeps it on the phone to send later when there's no
 * connection. `queued: true` means it's safe on the phone and will sync.
 */
export async function postOrQueue<T = Record<string, unknown>>(
  url: string,
  body: Record<string, unknown>,
  opts: { kind: DataKind; label: string }
): Promise<PostResult<T>> {
  const id = newClientId();
  const item: OutboxItem = { id, url, body: { ...body, client_id: id }, kind: opts.kind, label: opts.label, createdAt: Date.now(), attempts: 0 };

  const queue = (): PostResult<T> => {
    try {
      writeOutbox([...readOutbox(), item]);
      return { queued: true };
    } catch {
      return { queued: false, ok: false, error: "No connection, and the phone has no room to keep this entry. Try again with signal." };
    }
  };

  if (typeof navigator !== "undefined" && navigator.onLine === false) return queue();
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { queued: false, ok: false, error: (json as { error?: string }).error ?? "Couldn't save." };
    return { queued: false, ok: true, data: json as T };
  } catch (err) {
    if (isNetworkError(err)) return queue();
    return { queued: false, ok: false, error: err instanceof Error ? err.message : "Couldn't save." };
  }
}

let flushing: Promise<number> | null = null;

/**
 * Sends what's waiting, oldest first. Stops at the first connection failure
 * (still offline); a server error (AI hiccup) is retried next time; a
 * rejection (400) is marked failed so it doesn't block the rest. Returns how
 * many synced.
 */
export function flushOutbox(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let synced = 0;
    for (const item of readOutbox()) {
      if (item.failed) continue;
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      try {
        const res = await fetch(item.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
        if (res.ok) {
          writeOutbox(readOutbox().filter((i) => i.id !== item.id));
          notifyDataChanged(item.kind);
          synced++;
          continue;
        }
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        const bump = (patch: Partial<OutboxItem>) =>
          writeOutbox(readOutbox().map((i) => (i.id === item.id ? { ...i, attempts: i.attempts + 1, ...patch } : i)));
        if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429) {
          bump({ failed: json.error ?? `Rejected (${res.status})` });
        } else {
          bump({});
          if (res.status === 401) break; // signed out: AuthGuard sends the phone to /login
        }
      } catch {
        break; // still no connection
      }
    }
    return synced;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
