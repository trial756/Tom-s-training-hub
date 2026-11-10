"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadActiveWorkout, type ActiveWorkout } from "@/lib/workoutSession";

/** A way back into a workout in progress from anywhere in the app. */
export default function ActiveWorkoutPill() {
  const pathname = usePathname();
  const [w, setW] = useState<ActiveWorkout | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const read = () => setW(loadActiveWorkout());
    read();
    window.addEventListener("tth-active-workout", read);
    window.addEventListener("storage", read);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener("tth-active-workout", read);
      window.removeEventListener("storage", read);
      clearInterval(t);
    };
  }, [pathname]);

  if (!w || pathname === "/workout" || pathname === "/login") return null;
  const done = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const total = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const mins = Math.floor((now - w.startedAt) / 60000);
  const rest = w.restEndsAt ? Math.ceil((w.restEndsAt - now) / 1000) : 0;

  return (
    <Link
      href="/workout"
      className="fixed inset-x-0 bottom-[80px] z-40 mx-auto flex max-w-lg px-4"
      aria-label="Resume workout in progress"
    >
      <span className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-full border border-accent/50 bg-base-900 px-4 text-sm shadow-lg">
        <span className="flex items-center gap-2 text-ink">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          {w.title} · {mins} min · {done}/{total}
        </span>
        <span className="font-semibold text-accent">{rest > 0 ? `Rest ${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}` : "Resume →"}</span>
      </span>
    </Link>
  );
}
