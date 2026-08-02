"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StatTile from "@/components/StatTile";
import Spinner from "@/components/Spinner";
import CoachingNote from "@/components/CoachingNote";
import { formatDuration, formatPace, formatDateTime } from "@/lib/format";
import { RACE_DATE, GOAL_TIME } from "@/lib/marathonPlan";
import type { Run, Workout } from "@/lib/types";

interface StatsResponse {
  week: { workoutCount: number; runCount: number; mileage: number; runSeconds: number };
  today: { calories: number; protein_g: number; carbs_g: number; fat_g: number; mealCount: number };
  recentWorkouts: Workout[];
  recentRuns: Run[];
  weeklyMileageTrend: { week: string; miles: number }[];
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setStats(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const raceDate = new Date(`${RACE_DATE}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToRace = Math.max(0, Math.round((raceDate.getTime() - today.getTime()) / 86400000));

  return (
    <div>
      <PageHeader title="Tom's Training Hub" subtitle="Your week at a glance." />

      <div className="px-4">
        <Link href="/marathon" className="card flex items-center justify-between bg-gradient-to-r from-accent/20 to-transparent">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Marathon countdown</p>
            <p className="text-lg font-bold text-white">{daysToRace} days to go</p>
          </div>
          <p className="text-sm font-semibold text-accent">Goal {GOAL_TIME} →</p>
        </Link>
      </div>

      {loading && <Spinner label="Loading stats…" />}
      {error && <p className="px-4 text-sm text-red-400">{error}</p>}

      {stats && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 px-4">
            <StatTile label="Weekly Mileage" value={stats.week.mileage} unit="mi" accentColor="#2ec4b6" />
            <StatTile label="Runs This Week" value={stats.week.runCount} accentColor="#2ec4b6" />
            <StatTile label="Workouts This Week" value={stats.week.workoutCount} accentColor="#ff5b2e" />
            <StatTile label="Run Time" value={formatDuration(stats.week.runSeconds)} accentColor="#ff5b2e" />
          </div>

          <div className="mt-4 px-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Today's Fuel</h2>
            <div className="card">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-white">{stats.today.calories}</p>
                  <p className="text-[10px] text-gray-500">cal</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{stats.today.protein_g}g</p>
                  <p className="text-[10px] text-gray-500">protein</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{stats.today.carbs_g}g</p>
                  <p className="text-[10px] text-gray-500">carbs</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{stats.today.fat_g}g</p>
                  <p className="text-[10px] text-gray-500">fat</p>
                </div>
              </div>
            </div>
          </div>

          {stats.weeklyMileageTrend.length > 0 && (
            <div className="mt-4 px-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">8-Week Mileage Trend</h2>
              <div className="card">
                <div className="flex h-24 items-end gap-2">
                  {stats.weeklyMileageTrend.map((w) => {
                    const max = Math.max(...stats.weeklyMileageTrend.map((x) => x.miles), 1);
                    const height = Math.max(4, (w.miles / max) * 100);
                    return (
                      <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                        <div className="flex w-full flex-1 items-end">
                          <div className="w-full rounded-t bg-run" style={{ height: `${height}%` }} />
                        </div>
                        <span className="text-[9px] text-gray-500">{w.miles}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {(stats.recentRuns.length > 0 || stats.recentWorkouts.length > 0) && (
            <div className="mt-4 px-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Latest Coaching Feedback</h2>
              <div className="space-y-2">
                {stats.recentRuns[0] && (
                  <div className="card">
                    <p className="text-xs text-gray-500">
                      Run · {formatDateTime(stats.recentRuns[0].logged_at)} · {stats.recentRuns[0].distance_miles ?? "?"}mi
                      {" @ "}
                      {formatPace(stats.recentRuns[0].pace_seconds_per_mile)}
                    </p>
                    <CoachingNote
                      feedback={stats.recentRuns[0].coaching_feedback}
                      vsLastTime={stats.recentRuns[0].vs_last_time}
                      adjustments={stats.recentRuns[0].adjustments}
                    />
                  </div>
                )}
                {stats.recentWorkouts[0] && (
                  <div className="card">
                    <p className="text-xs text-gray-500">Workout · {formatDateTime(stats.recentWorkouts[0].logged_at)}</p>
                    <CoachingNote
                      feedback={stats.recentWorkouts[0].coaching_feedback}
                      vsLastTime={stats.recentWorkouts[0].vs_last_time}
                      adjustments={stats.recentWorkouts[0].adjustments}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3 px-4">
        <Link href="/log" className="btn-secondary text-sm">
          + Workout
        </Link>
        <Link href="/runs" className="btn-secondary text-sm">
          + Run
        </Link>
        <Link href="/fuel" className="btn-secondary text-sm">
          + Meal
        </Link>
      </div>
    </div>
  );
}
