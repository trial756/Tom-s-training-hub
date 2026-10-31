"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { notifyDataChanged } from "@/lib/refresh";
import PendingRunReview, { type PendingItem } from "@/components/PendingRunReview";
import UndoToast from "@/components/UndoToast";

const DISMISSED_KEY = "garmin-review-dismissed";

/** Runs whose pop-up was closed with the X — they wait on the Runs tab instead. */
function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function addDismissed(id: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...readDismissed(), id].slice(-50)));
  } catch {
    // Private mode — the pop-up may show again next open, which is harmless.
  }
}

/**
 * Pulls new Garmin runs whenever the app opens or comes back to the
 * foreground (the server throttles to every 10 minutes; while the one-time
 * backfill is unfinished it keeps going in chunks), then pops up the newest
 * run awaiting confirmation unless it was already closed with the X.
 */
export default function GarminSync() {
  const router = useRouter();
  const pathname = usePathname();
  const [review, setReview] = useState<PendingItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const checkPending = useCallback(async () => {
    try {
      const json = await fetch("/api/runs/pending").then((r) => r.json());
      const dismissed = readDismissed();
      const next = ((json.pending ?? []) as PendingItem[]).find((p) => !dismissed.includes(p.run.id));
      setReview((cur) => cur ?? next ?? null);
    } catch {
      // The Runs tab still shows it.
    }
  }, []);

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
        if (!cancelled) checkPending();
      }
    };

    sync();
    const onVisible = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkPending]);

  return (
    <>
      {/* On the Runs tab the same run is already open in the form. */}
      {review && pathname !== "/runs" && (
        <PendingRunReview
          key={review.run.id}
          item={review}
          onClose={() => {
            const confirmed = review.run.review_status !== "pending";
            if (!confirmed) addDismissed(review.run.id);
            setReview(null);
            // Closed without confirming: it waits on the Runs tab, prefilled.
            if (!confirmed) router.push("/runs");
          }}
          onConfirmed={(run) => {
            setReview((cur) => (cur ? { ...cur, run } : cur));
            notifyDataChanged("run");
          }}
          onDelete={() => {
            setPendingDelete(review.run.id);
            setReview(null);
          }}
        />
      )}
      {pendingDelete && (
        <UndoToast
          label="Run deleted"
          onUndo={() => setPendingDelete(null)}
          onExpire={async () => {
            const id = pendingDelete;
            setPendingDelete(null);
            await fetch(`/api/runs/${id}`, { method: "DELETE" });
            notifyDataChanged("run");
          }}
        />
      )}
    </>
  );
}
