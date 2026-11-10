"use client";

import { useEffect, useState } from "react";
import { discardOutboxItem, flushOutbox, onOutboxChange, readOutbox, type OutboxItem } from "@/lib/outbox";

/**
 * Says when the phone is offline and what's waiting to sync, and sends it
 * when the connection comes back (on reconnect, on returning to the app,
 * and every 30 s while anything waits).
 */
export default function OfflineBar() {
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const read = () => setItems(readOutbox());
    const sync = async () => {
      if (!readOutbox().some((i) => !i.failed)) return;
      setSyncing(true);
      await flushOutbox().catch(() => 0);
      setSyncing(false);
    };
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    const visible = () => document.visibilityState === "visible" && void sync();

    setOnline(navigator.onLine);
    read();
    void sync();
    const off = onOutboxChange(read);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", visible);
    const t = setInterval(() => void sync(), 30_000);
    return () => {
      off();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(t);
    };
  }, []);

  const waiting = items.filter((i) => !i.failed);
  const failed = items.filter((i) => i.failed);
  if (online && items.length === 0) return null;

  return (
    <div className="sticky top-0 z-40 space-y-1 border-b border-base-700 bg-base-950/95 px-4 py-2 backdrop-blur" role="status">
      {(!online || waiting.length > 0) && (
        <div className="flex min-h-[32px] items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 text-ink">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-accent" : "bg-fuel"}`} />
            {!online ? "Offline — logs save on this phone" : syncing ? "Syncing…" : "Back online"}
            {waiting.length > 0 && <span className="text-muted">· {waiting.length} waiting</span>}
          </span>
          {online && waiting.length > 0 && !syncing && (
            <button type="button" className="min-h-[44px] text-sm font-semibold text-accent" onClick={() => void flushOutbox()}>
              Sync now
            </button>
          )}
        </div>
      )}
      {failed.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-3 text-xs">
          <span className="text-danger">
            {i.label} couldn&apos;t be saved: {i.failed}
          </span>
          <button type="button" className="min-h-[44px] shrink-0 text-faint" onClick={() => discardOutboxItem(i.id)}>
            Discard
          </button>
        </div>
      ))}
    </div>
  );
}
