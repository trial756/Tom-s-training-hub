"use client";

import Link from "next/link";
import { MUSCLE_LABELS, type MuscleRegion } from "@/lib/muscles";
import type { PlanDay, PlanSession, WeekPlan } from "@/lib/planner/types";

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

/** Turns a session into text the Log tab can start from. */
function prefillFor(session: PlanSession): string {
  if (session.exercises.length === 0) return session.title;
  const lines = session.exercises.map((e) => {
    const load = e.target ? ` @ ${e.target}` : "";
    return `${e.name} ${e.sets}x${e.reps}${load}`;
  });
  return `${session.title}: ${lines.join(", ")}`;
}

export default function TodayPlan({
  plan,
  milesThisWeek,
  weeklyMileage,
  onRegenerate,
  regenerating,
  selectedDate,
  onSelectDate,
  mileageNote,
}: {
  plan: WeekPlan;
  milesThisWeek: number;
  weeklyMileage: number | null;
  mileageNote?: string | null;
  onRegenerate: () => void;
  regenerating: boolean;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const byId = new Map(plan.sessions.map((s) => [s.id, s]));
  const selected = plan.days.find((d) => d.date === selectedDate) ?? plan.days[0];
  const session = selected?.sessionId ? byId.get(selected.sessionId) : undefined;
  const isToday = plan.days.find((d) => d.status === "today")?.date === selected?.date;

  return (
    <div className="px-4">
      {/* Marathon position */}
      {plan.planWeek != null && (
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-muted">
            Week {plan.planWeek} · {plan.phase}
          </span>
          {weeklyMileage != null && (
            <span className="text-muted">
              {milesThisWeek} / {weeklyMileage} mi
            </span>
          )}
        </div>
      )}

      {plan.headline && <p className="mb-2 text-sm font-semibold text-ink">{plan.headline}</p>}

      {mileageNote && (
        <p className="mb-3 rounded-lg border border-run/25 bg-run/10 p-2 text-xs leading-snug text-gray-300">
          {mileageNote}
        </p>
      )}

      {/* Week strip */}
      <div className="mb-4 flex gap-1.5">
        {plan.days.map((day) => {
          const d = new Date(`${day.date}T00:00:00`);
          const active = day.date === selected?.date;
          return (
            <button
              key={day.date}
              onClick={() => onSelectDate(day.date)}
              className={`flex-1 rounded-xl border py-2 text-center transition-colors ${
                STATUS_STYLE[day.status] ?? STATUS_STYLE.upcoming
              } ${active ? "ring-2 ring-accent/60" : ""}`}
            >
              <span className="block text-[10px] font-medium opacity-70">{DOW[d.getDay()]}</span>
              <span className="block text-sm font-bold">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Selected day */}
      <div className="card">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-faint">
              {isToday ? "Today" : dayName(selected?.date ?? "")}
            </p>
            <h2 className="text-lg font-bold text-ink">{session?.title ?? "Nothing planned"}</h2>
            {session?.addedByReconciler && (
              <span className="text-[11px] font-medium text-run">added to close the week&apos;s mileage</span>
            )}
          </div>
          {session && <span className="pill shrink-0 bg-base-800 text-muted">{KIND_LABEL[session.kind]}</span>}
        </div>

        {selected?.status === "off_script" && (
          <p className="mb-2 rounded-lg bg-fuel/10 p-2 text-xs text-fuel">
            You trained something else — this moved to a later day.
          </p>
        )}
        {selected?.status === "missed" && (
          <p className="mb-2 rounded-lg bg-base-800 p-2 text-xs text-faint">Missed — picked up later in the week.</p>
        )}
        {selected?.loggedSummary && (
          <p className="mb-2 text-xs text-muted">Logged: {selected.loggedSummary}</p>
        )}

        {session?.rationale && <p className="mb-3 text-sm leading-snug text-muted">{session.rationale}</p>}

        {session && session.regions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {session.regions.map((r) => (
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

        <div className="mt-3 flex gap-2">
          {session && session.kind !== "rest" && selected?.status !== "done" && (
            <Link
              href={
                session.kind === "run"
                  ? "/runs"
                  : `/log?prefill=${encodeURIComponent(prefillFor(session))}&date=${selected?.date ?? ""}`
              }
              className="btn-primary flex-1 text-center text-sm"
            >
              Log this
            </Link>
          )}
          <button onClick={onRegenerate} disabled={regenerating} className="btn-secondary text-sm disabled:opacity-40">
            {regenerating ? "Replanning…" : "Replan week"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { PlanDay };
