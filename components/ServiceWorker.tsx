"use client";

import { useEffect } from "react";

/** Registers the offline shell (public/sw.js). Production only: in dev it would cache stale bundles. */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
