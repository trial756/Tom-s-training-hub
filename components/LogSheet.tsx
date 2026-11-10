"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIcon, FuelIcon, RunIcon } from "@/components/NavIcons";
import { localDateKey } from "@/lib/format";
import { parseWeight } from "@/lib/weight";
import { notifyDataChanged } from "@/lib/refresh";

/**
 * One place to log anything. Runs, lifts and meals open their forms; a
 * weigh-in is one number, so it's logged right here.
 */
export default function LogSheet({ onClose }: { onClose: () => void }) {
  const [weightOpen, setWeightOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveWeight() {
    const weight = parseWeight(text);
    if (weight == null) {
      setMessage("Enter pounds, e.g. 158.4");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: localDateKey(new Date()), weight_lb: weight }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save.");
      notifyDataChanged("weight");
      setMessage(`Logged ${weight} lb`);
      setText("");
      setTimeout(onClose, 900);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const row = "flex min-h-[56px] items-center gap-3 rounded-xl border border-base-700 bg-base-900 px-4 text-left active:bg-base-800";

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Log something">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-2xl border-t border-base-700 bg-base-950 px-4 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Log</p>
        <div className="space-y-2">
          <Link href="/runs" className={row}>
            <RunIcon active />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-ink">Run</span>
              <span className="block text-xs text-muted">Distance, time, feel — or confirm a Garmin run</span>
            </span>
          </Link>
          <Link href="/log" className={row}>
            <LogIcon active />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-ink">Lift or mobility</span>
              <span className="block text-xs text-muted">Type it the way you'd text it</span>
            </span>
          </Link>
          <Link href="/fuel" className={row}>
            <FuelIcon active />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-ink">Meal</span>
              <span className="block text-xs text-muted">Favorites one tap away</span>
            </span>
          </Link>
          {weightOpen ? (
            <div className="rounded-xl border border-base-700 bg-base-900 p-3">
              <div className="flex gap-2">
                <input
                  autoFocus
                  className="input-field min-h-[44px] flex-1"
                  inputMode="decimal"
                  placeholder="Weight (lb)"
                  value={text}
                  onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && saveWeight()}
                />
                <button type="button" className="btn-primary min-h-[44px] px-5 text-sm" disabled={saving || !text} onClick={saveWeight}>
                  {saving ? "…" : "Save"}
                </button>
              </div>
              {message && <p className="mt-2 text-xs text-muted">{message}</p>}
            </div>
          ) : (
            <button type="button" className={`${row} w-full`} onClick={() => setWeightOpen(true)}>
              <ScaleIcon />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">Weigh-in</span>
                <span className="block text-xs text-muted">Today's weight, right here</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ScaleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00e676" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M8 9a4 4 0 0 1 8 0" />
      <path d="m12 9 1.5-1.5" />
    </svg>
  );
}
