"use client";

import { useEffect } from "react";
import { notifyDataChanged } from "@/lib/refresh";

/**
 * Pulls new Garmin runs whenever the app opens or comes back to the
 * foreground. The server throttles to every 10 minutes, so this is cheap;
 * while the one-time backfill is unfinished it keeps going in chunks.
 */
export default function GarminSync() {
  useEffect(() => {
    let running = false;
    let cancelled = false;

    const sync = async () => {
      if (running) return;
      running = true;
      try {
        for (let i = 0; i < 40 && !cancelled; i++) {
          const res = await fetch("/api/garmin/sync", { method: "POST" });
          const json = await res.json().catch(() => null);
          if (!json?.ok) break;
          if (json.imported + json.merged + json.linked > 0) notifyDataChanged("run");
          if (json.backfillDone) break;
        }
      } catch {
        // Offline or Garmin down — the next open tries again.
      } finally {
        running = false;
      }
    };

    sync();
    const onVisible = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
