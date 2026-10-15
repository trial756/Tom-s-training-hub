"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { MUSCLE_LABELS, type MuscleRegion } from "@/lib/muscles";
import type { PlanDay, PlanSession, WeekPlan } from "@/lib/planner/types";
import {
  formatPaceRange,
  liftPrefill,
  liftRegionsFor,
  plannedRunFor,
  runPrefillQuery,
} from "@/lib/planner/runPlan";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

const STATUS_STYLE: Record<string, string> = {
  done: "bg-accent text-base-950 border-accent",
  today: "bg-base-800 text-ink border-accent",
  off_script: "bg-fuel/20 text-fuel border-fuel/40",
  missed: "bg-base-900 text-faint border-base-700",
  upcoming: "bg-base-800 text-muted border-base-700",
};

const KIND_LABEL: Record<PlanSession["kind"], string> = {
  lift: "Lift",
  run: "Run",
  lift_and_run: "Lift + Run",
  active_recovery: "Active recovery",
  rest: "Rest",
};

function dayName(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function TodayPlan({
  plan,
  milesThisWeek,
  weeklyMileage,
  onRegenerate,
  regenerating,
  planningWeek,
  selectedDate,
  onSelectDate,
  mileageNote,
}: {
  plan: WeekPlan;
  milesThisWeek: number;
  weeklyMileage: number | null;
  mileageNote?: string | null;
  onRegenerate: (weekStart: string) => void;
  regenerating: boolean;
  /** A future week currently being planned, if any. */
  planningWeek?: string | null;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const byId = new Map(plan.sessions.map((s) => [s.id, s]));
  const selected = plan.days.find((d) => d.date === selectedDate) ?? plan.days[0];
  const session = selected?.sessionId ? byId.get(selected.sessionId) : undefined;
  // From the plan, not a day's status: once today is logged its status is "done".
  const todayKey = plan.today ?? plan.days.find((d) => d.status === "today")?.date ?? null;
  const isToday = todayKey === selected?.date;

  // The header follows whichever training week the selected day sits in.
  const weeks = plan.weeks ?? [];
  const selectedWeekStart = selected?.weekStart ?? plan.weekStart;
  const week = weeks.find((w) => w.weekStart === selectedWeekStart);
  const isCurrentWeek = selectedWeekStart === plan.weekStart;
  const isPastWeek = selectedWeekStart < plan.weekStart;
  const planWeek = week?.planWeek ?? plan.planWeek;
  const phase = week?.phase ?? plan.phase;
  const headline = isCurrentWeek ? plan.headline : week?.headline ?? "";
  const pending = !!week?.pending;
  const isFuture = todayKey != null && (selected?.date ?? "") > todayKey;
  const run = session ? plannedRunFor(session) : null;
  const liftRegions = session ? liftRegionsFor(session) : [];
  // Not tied to the day reading "done": a run + mobility day is done once the
  // run is in, but the mobility half must stay loggable. Each button shows a
  // ✓ for its own half instead.
  const canLog = !!session && session.kind !== "rest" && !isFuture;

  // Strip grouped by training week, so the Sunday boundary is visible.
  const groups = weeks
    .map((w) => ({ week: w, days: plan.days.filter((d) => d.weekStart === w.weekStart) }))
    .filter((g) => g.days.length > 0);
  if (groups.length === 0) groups.push({ week: undefined as never, days: plan.days });

  // Centre today in the strip — on first render and when the day rolls over,
  // not on every quiet reload, so a strip the user has scrolled stays put.
  const stripRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  const firstDay = plan.days[0]?.date;
  useEffect(() => {
    const strip = stripRef.current;
    const btn = todayRef.current;
    if (!strip || !btn) return;
    strip.scrollLeft = btn.offsetLeft - strip.clientWidth / 2 + btn.clientWidth / 2;
  }, [firstDay]);

  return (
    <div className="px-4">
      {/* Marathon position for the selected day's week */}
      {planWeek != null && (
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-muted">
            Week {planWeek} · {phase}
            {!isCurrentWeek && <span className="text-faint">{isPastWeek ? " · last week" : " · next week"}</span>}
          </span>
          {isCurrentWeek && weeklyMileage != null && (
            <span className="text-muted">
              {milesThisWeek} / {weeklyMileage} mi
            </span>
          )}
          {!isCurrentWeek && week?.weeklyMileage != null && <span className="text-muted">{week.weeklyMileage} mi target</span>}
        </div>
      )}

      {headline && <p className="mb-2 text-sm font-semibold text-ink">{headline}</p>}

      {isCurrentWeek && mileageNote && (
        <p className="mb-3 rounded-lg border border-run/25 bg-run/10 p-2 text-xs leading-snug text-gray-300">
          {mileageNote}
        </p>
      )}

      {/* 11-day strip, today in the middle. Scrolls sideways — eleven 44px
          targets don't fit a phone, and shrinking them below that costs taps. */}
      <div
        ref={stripRef}
        className="-mx-4 mb-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {groups.map(({ week: w, days }) => (
          <div key={w?.weekStart ?? "all"} className="shrink-0">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">
              {w?.planWeek != null ? `Wk ${w.planWeek}` : "\u00a0"}
            </p>
            <div className="flex gap-1.5">
              {days.map((day) => {
                const d = new Date(`${day.date}T00:00:00`);
                const active = day.date === selected?.date;
                const isTodayBtn = day.date === todayKey;
                return (
                  <button
                    key={day.date}
                    ref={isTodayBtn ? todayRef : undefined}
                    onClick={() => onSelectDate(day.date)}
                    className={`w-11 shrink-0 snap-center rounded-xl border py-2 text-center transition-colors ${
                      STATUS_STYLE[day.status] ?? STATUS_STYLE.upcoming
                    } ${active ? "ring-2 ring-accent/60" : ""}`}
                  >
                    <span className="block text-[10px] font-medium opacity-70">{DOW[d.getDay()]}</span>
                    <span className="block text-sm font-bold">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Selected day */}
      <div className="card">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-faint">
              {isToday ? "Today" : dayName(selected?.date ?? "")}
            </p>
            <h2 className="text-lg font-bold text-ink">
              {session?.title ??
                (pending
                  ? planningWeek === selectedWeekStart
                    ? `Planning week ${planWeek ?? ""}…`
                    : "Next week's plan is on its way"
                  : "Nothing planned")}
            </h2>
            {session?.addedByReconciler && (
              <span className="text-[11px] font-medium text-run">added to close the week&apos;s mileage</span>
            )}
          </div>
          {session && (
            <span className="pill shrink-0 bg-base-800 text-muted">
              {session.kind === "run" && session.exercises.length > 0 ? "Run + mobility" : KIND_LABEL[session.kind]}
            </span>
          )}
        </div>

        {selected?.status === "off_script" && (
          <p className="mb-2 rounded-lg bg-fuel/10 p-2 text-xs text-fuel">
            You trained something else — this moved to a later day.
          </p>
        )}
        {selected?.status === "missed" && session && (
          <p className="mb-2 rounded-lg bg-base-800 p-2 text-xs text-faint">Missed — picked up later in the week.</p>
        )}
        {selected?.loggedSummary && (
          <p className="mb-2 text-xs text-muted">Logged: {selected.loggedSummary}</p>
        )}

        {session?.rationale && <p className="mb-3 text-sm leading-snug text-muted">{session.rationale}</p>}

        {run && (
          <div className="mb-3 rounded-lg border border-run/30 bg-run/5 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                {run.miles ? `${run.miles} mi · ` : ""}
                {run.type}
              </span>
              {run.pace && (
                <span className="shrink-0 text-sm font-semibold text-run">
                  {formatPaceRange(run.pace)}
                  <span className="text-xs font-normal text-muted">/mi</span>
                </span>
              )}
            </div>
            {run.structure && <p className="mt-1 text-xs leading-snug text-muted">{run.structure}</p>}
            {run.easyPace && (
              <p className="mt-1 text-[11px] text-faint">
                Warm-up, cool-down and recoveries at {formatPaceRange(run.easyPace)}/mi
              </p>
            )}
          </div>
        )}

        {session && liftRegions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {liftRegions.map((r) => (
              <span key={r} className="pill bg-accent/15 text-accent">
                {MUSCLE_LABELS[r as MuscleRegion] ?? r}
              </span>
            ))}
          </div>
        )}

        {session && session.exercises.length > 0 && (
          <ul className="space-y-2">
            {session.exercises.map((ex, i) => (
              <li key={i} className="rounded-lg bg-base-800 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {ex.name}
                    {ex.isNew && <span className="ml-1.5 text-[10px] font-normal text-accent">new</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {ex.sets}×{ex.reps}
                    {ex.target ? ` · ${ex.target}` : ""}
                  </span>
                </div>
                {ex.cue && <p className="mt-1 text-[11px] leading-snug text-faint">{ex.cue}</p>}
              </li>
            ))}
          </ul>
        )}

        {canLog && (run || session.exercises.length > 0) && (
          <div className="mt-3 flex gap-2">
            {run && (
              <LogButton
                href={`/runs?${runPrefillQuery(session, selected?.date ?? null)}`}
                done={!!selected?.loggedRun}
                label="Log run"
                primary
              />
            )}
            {session.exercises.length > 0 && (
              <LogButton
                href={`/log?prefill=${encodeURIComponent(liftPrefill(session))}&date=${selected?.date ?? ""}`}
                done={!!selected?.loggedLift}
                label={!run ? "Log this" : session.kind === "lift_and_run" ? "Log lift" : "Log mobility"}
                primary={!run || session.kind === "lift_and_run"}
              />
            )}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          {/* The past is fixed; a future week can be replanned like this one. */}
          {!isPastWeek && !pending && (
            <button
              onClick={() => onRegenerate(selectedWeekStart)}
              disabled={regenerating}
              className="btn-secondary text-sm disabled:opacity-40"
            >
              {regenerating ? "Replanning…" : isCurrentWeek ? "Replan week" : `Replan week ${planWeek ?? ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export type { PlanDay };

/** One half of a day's session — a ✓ once that half is logged, so the other stays reachable. */
function LogButton({ href, done, label, primary }: { href: string; done: boolean; label: string; primary: boolean }) {
  if (done) {
    return (
      <span className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-accent/40 text-sm font-medium text-accent">
        ✓ {label.replace(/^Log /, "")} logged
      </span>
    );
  }
  return (
    <Link href={href} className={`${primary ? "btn-primary" : "btn-secondary"} flex-1 text-center text-sm`}>
      {label}
    </Link>
  );
}
