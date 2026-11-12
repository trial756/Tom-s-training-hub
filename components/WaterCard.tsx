"use client";

import { useCallback, useEffect, useState } from "react";
import UndoToast from "@/components/UndoToast";
import { postOrQueue } from "@/lib/outbox";
import { notifyDataChanged, useRefreshOn } from "@/lib/refresh";
import { QUICK_OZ, REMINDER_SHARE, parseOz, type WaterTarget } from "@/lib/water";

interface WaterDay {
  totalOz: number;
  target: WaterTarget;
  entries: { id: string; logged_at: string; oz: number }[];
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Water on Today: one tap per drink (12 / 20 / 30 oz, or any amount), the
 * day's progress against a target that moves with training and heat, and
 * the 5pm reminder switch.
 */
export default function WaterCard() {
  const [day, setDay] = useState<WaterDay | null>(null);
  const [other, setOther] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  // A drink just added (Undo takes it back) and a drink being removed (Undo keeps it).
  const [justLogged, setJustLogged] = useState<{ id: string; oz: number } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; oz: number } | null>(null);
  const [reminder, setReminder] = useState<"unsupported" | "off" | "on" | "blocked" | "working">("off");

  const load = useCallback(() => {
    fetch("/api/water", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setDay(j))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useRefreshOn(load, { kinds: ["water", "run", "workout", "weight"] });

  // Is this phone already set up for the reminder?
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setReminder("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setReminder("blocked");
      return;
    }
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setReminder(sub ? "on" : "off");
    });
  }, []);

  async function drink(oz: number) {
    setBusy(true);
    setNote(null);
    // Shown at once; the server's answer replaces it.
    setDay((d) => (d ? { ...d, totalOz: d.totalOz + oz } : d));
    const result = await postOrQueue<{ entry?: { id: string } }>("/api/water", { oz, logged_at: new Date().toISOString() }, { kind: "water", label: `Water · ${oz} oz` });
    setBusy(false);
    setOther(null);
    if (result.queued) {
      setNote(`${oz} oz saved on this phone — it'll sync when you're back online.`);
      return;
    }
    if (!result.ok) {
      setNote(result.error);
      load();
      return;
    }
    if (result.data.entry?.id) setJustLogged({ id: result.data.entry.id, oz });
    load();
    notifyDataChanged("water");
  }

  async function toggleReminder() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setNote("Reminders need the installed app — open it from your home screen and try again.");
        return;
      }
      setReminder("working");
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch(`/api/push?endpoint=${encodeURIComponent(existing.endpoint)}`, { method: "DELETE" });
        await existing.unsubscribe();
        setReminder("off");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setReminder(permission === "denied" ? "blocked" : "off");
        return;
      }
      const { publicKey } = await fetch("/api/push").then((r) => r.json());
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error();
      setReminder("on");
    } catch {
      setReminder("off");
      setNote("Couldn't turn on the reminder. Try again in a moment.");
    }
  }

  if (!day) return null;
  const visible = removing ? day.entries.filter((e) => e.id !== removing.id) : day.entries;
  const total = removing ? day.totalOz - removing.oz : day.totalOz;
  const pct = Math.min(100, (total / Math.max(1, day.target.oz)) * 100);
  const done = total >= day.target.oz;

  return (
    <div className="card space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <button type="button" className="text-left" onClick={() => setDetails((v) => !v)}>
          <p className="text-xs uppercase tracking-wide text-gray-400">Water</p>
          <p className="text-lg font-semibold tabular-nums text-ink">
            {Math.round(total)} <span className="text-sm font-normal text-muted">/ {day.target.oz} oz</span>
          </p>
        </button>
        <p className={`text-sm ${done ? "text-accent" : "text-muted"}`}>{done ? "Target hit ✓" : `${Math.round(day.target.oz - total)} oz to go`}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-base-800" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-run transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {QUICK_OZ.map((oz) => (
          <button
            key={oz}
            type="button"
            disabled={busy}
            onClick={() => drink(oz)}
            className="min-h-[48px] rounded-xl border border-run/40 bg-run/10 text-sm font-semibold text-ink active:bg-run/25"
          >
            {oz} oz
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => setOther((v) => (v == null ? "" : null))}
          className="min-h-[48px] rounded-xl border border-base-600 bg-base-800 text-sm text-muted"
        >
          Other
        </button>
      </div>
      {other != null && (
        <div className="flex gap-2">
          <input
            autoFocus
            className="input-field min-h-[44px] flex-1"
            inputMode="decimal"
            placeholder="oz"
            value={other}
            onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => {
              const oz = parseOz(other);
              if (e.key === "Enter" && oz) drink(oz);
            }}
          />
          <button type="button" className="btn-primary min-h-[44px] px-5 text-sm" disabled={!parseOz(other) || busy} onClick={() => drink(parseOz(other)!)}>
            Add
          </button>
        </div>
      )}

      {details && (
        <div className="space-y-2 rounded-lg bg-base-800 p-3 text-xs">
          <p className="text-muted">
            Today&apos;s target:{" "}
            {day.target.parts.map((p, i) => (
              <span key={p.label}>
                {i > 0 && " + "}
                {p.label} {p.oz}
              </span>
            ))}{" "}
            ≈ {day.target.oz} oz
          </p>
          {visible.length > 0 ? (
            <ul className="space-y-1">
              {visible
                .slice()
                .reverse()
                .map((e) => (
                  <li key={e.id} className="flex items-center justify-between">
                    <span className="text-gray-300">
                      {time(e.logged_at)} · {e.oz} oz
                    </span>
                    <button type="button" aria-label={`Remove ${e.oz} oz at ${time(e.logged_at)}`} className="min-h-[44px] min-w-[44px] text-faint" onClick={() => {
                        setJustLogged(null);
                        setRemoving({ id: e.id, oz: e.oz });
                      }}>
                      ✕
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-faint">Nothing logged yet today.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-base-700 pt-2">
        <p className="text-xs text-faint">
          {reminder === "on"
            ? `5pm reminder on — only if you're under ${Math.round(REMINDER_SHARE * 100)}% by then`
            : reminder === "blocked"
              ? "Notifications are blocked for this site in your browser settings"
              : reminder === "unsupported"
                ? "This browser can't show reminders"
                : "5pm reminder if you're behind"}
        </p>
        {(reminder === "on" || reminder === "off" || reminder === "working") && (
          <button type="button" className="min-h-[44px] shrink-0 px-2 text-sm font-semibold text-accent" disabled={reminder === "working"} onClick={toggleReminder}>
            {reminder === "on" ? "Turn off" : reminder === "working" ? "…" : "Turn on"}
          </button>
        )}
      </div>
      {note && <p className="text-xs text-fuel">{note}</p>}

      {justLogged && !removing && (
        <UndoToast
          key={justLogged.id}
          label={`Logged ${justLogged.oz} oz`}
          onUndo={async () => {
            const j = justLogged;
            setJustLogged(null);
            await fetch(`/api/water/${j.id}`, { method: "DELETE" });
            load();
            notifyDataChanged("water");
          }}
          onExpire={() => setJustLogged(null)}
        />
      )}
      {removing && (
        <UndoToast
          key={removing.id}
          label={`Removed ${removing.oz} oz`}
          onUndo={() => setRemoving(null)}
          onExpire={async () => {
            const r = removing;
            await fetch(`/api/water/${r.id}`, { method: "DELETE" });
            setRemoving(null);
            load();
            notifyDataChanged("water");
          }}
        />
      )}
    </div>
  );
}
