"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { daysBetweenKeys, localDateKey } from "@/lib/format";
import { digitsToClock, secondsToDigits } from "@/lib/clock";
import { useRefreshOn } from "@/lib/refresh";
import type { Goal } from "@/lib/goals";

/**
 * The next race and the days to it, or the current focus when no race is
 * ahead. Reads the goals, so it moves on by itself after race day.
 */
export default function GoalCountdown() {
  const [state, setState] = useState<{ nextRace: Goal | null; block: { summary: string; kind: string } } | null>(null);

  const load = useCallback(() => {
    fetch("/api/goals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setState({ nextRace: j.nextRace, block: j.block }))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  // A goal edit announces a change to every kind; midnight moves the count.
  useRefreshOn(load, { kinds: ["run"] });

  if (!state) return null;
  const today = localDateKey(new Date());
  // A for-fun race never takes the headline from the goal the week is for.
  const fun = state.nextRace?.priority === "C" ? state.nextRace : null;
  const race = fun ? null : state.nextRace;
  return (
    <Link href="/goals" className="card flex items-center justify-between gap-3 bg-gradient-to-r from-accent/20 to-transparent">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-gray-400">{race ? race.title : "Current goal"}</p>
        <p className="text-lg font-bold text-white">
          {race ? `${Math.max(0, daysBetweenKeys(today, race.date))} days to go` : state.block.summary}
        </p>
        {fun && (
          <p className="text-xs text-muted">
            {fun.title} in {Math.max(0, daysBetweenKeys(today, fun.date))} days, for fun
          </p>
        )}
      </div>
      <p className="shrink-0 text-sm font-semibold text-accent">
        {race?.target_seconds ? `Goal ${digitsToClock(secondsToDigits(race.target_seconds))} →` : "Goals →"}
      </p>
    </Link>
  );
}
