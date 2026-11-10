"use client";

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import GoalCountdown from "@/components/GoalCountdown";
import TodayPlan from "@/components/TodayPlan";
import BodyMap, { type BodyRegionData } from "@/components/BodyMap";
import { localDateKey } from "@/lib/format";
import type { WeekPlan } from "@/lib/planner/types";
import { useRefreshOn } from "@/lib/refresh";
import ReadinessCard from "@/components/ReadinessCard";
import { plannedRunFor } from "@/lib/planner/runPlan";

const KEY_RUNS = new Set(["Long", "Tempo", "Marathon Pace", "Interval", "Race"]);

export default function TodayPage() {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [planContext, setPlanContext] = useState<{ milesThisWeek: number; marathon: { weeklyMileage: number } | null } | null>(null);
  const [mileageNote, setMileageNote] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [bodyRegions, setBodyRegions] = useState<BodyRegionData[] | null>(null);
  const [bodyWindow, setBodyWindow] = useState<"7d" | "all">("7d");

  // Per-section request counters: a reload that lands after a newer one
  // (say, a range toggle mid-refresh) is dropped rather than overwriting it.
  const planReq = useRef(0);
  const bodyReq = useRef(0);
  // Last payload per section, so a reload that brings back identical data
  // skips the state update and the section doesn't re-render at all. One key
  // per section, not per range — the cache must match what's on screen.
  const lastJson = useRef<Record<string, string>>({});
  const changed = (key: string, value: unknown) => {
    const json = JSON.stringify(value);
    if (lastJson.current[key] === json) return false;
    lastJson.current[key] = json;
    return true;
  };

  useEffect(() => {
    loadPlan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadBody(bodyWindow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyWindow]);

  // What each section reloads on.
  useRefreshOn(() => loadPlan(false, true), { kinds: ["workout", "run"] });
  useRefreshOn(() => loadBody(bodyWindow), { kinds: ["workout", "run"] });

  function loadBody(win: "7d" | "all") {
    const req = ++bodyReq.current;
    fetch(`/api/muscle-map?window=${win}`)
      .then((res) => res.json())
      .then((json) => {
        if (req !== bodyReq.current || json.error) return;
        if (changed("body", json.regions)) setBodyRegions(json.regions);
      })
      // A failed background reload keeps the map that's already showing.
      .catch(() => {});
  }


  // The day the plan was last loaded for, so a reload after midnight can
  // tell whether the selected day was "today" and should follow it forward.
  const planDay = useRef(localDateKey(new Date()));
  const ensuring = useRef(new Set<string>());
  const [planningWeek, setPlanningWeek] = useState<string | null>(null);

  /**
   * `quiet` is a background reload: the current plan stays on screen, a
   * failure keeps it rather than showing an error, and the selected day is
   * left alone unless it was today and the day has since rolled over.
   */
  async function loadPlan(force: boolean, quiet = false, week?: string) {
    const req = ++planReq.current;
    if (force) setRegenerating(true);
    else if (!quiet || !plan) setPlanLoading(true);
    if (!quiet) setPlanError(null);
    try {
      const res = await fetch(
        force && week ? `/api/plan?week=${week}` : "/api/plan",
        force ? { method: "POST" } : undefined
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Could not build this week's plan.");
      if (req !== planReq.current) return;
      // generatedAt is stamped per request, so it's left out of the comparison.
      const { generatedAt: _stamp, ...planBody } = json.plan ?? {};
      if (changed("plan", { planBody, context: json.context, mileage: json.mileage })) {
        setPlan(json.plan);
        setPlanContext(json.context ?? null);
        setMileageNote(json.mileage?.note ?? null);
      }
      const todayKey = localDateKey(new Date());
      const hasToday = json.plan?.days?.some((d: { date: string }) => d.date === todayKey);
      const previousDay = planDay.current;
      planDay.current = todayKey;
      setSelectedDate((current) => {
        if (!quiet) return hasToday ? todayKey : current;
        const followsToday = current === previousDay && previousDay !== todayKey;
        const stillInPlan = json.plan?.days?.some((d: { date: string }) => d.date === current);
        if ((followsToday || !stillInPlan) && hasToday) return todayKey;
        return current;
      });
      setPlanError(null);
      const pending = (json.plan?.weeks ?? []).find((w: { pending: boolean }) => w.pending);
      if (pending) void ensureWeek(pending.weekStart);
    } catch (err) {
      if (req !== planReq.current) return;
      if (!quiet || !plan) setPlanError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (req === planReq.current) {
        setPlanLoading(false);
        setRegenerating(false);
      }
    }
  }

  /**
   * Next week reaches the strip before it starts, and gets planned in its own
   * request so no single request waits on two AI calls. Once it lands, a
   * quiet reload picks it up from storage. One attempt per week per visit;
   * a failure clears the flag so the next refresh signal retries.
   */
  async function ensureWeek(week: string) {
    if (ensuring.current.has(week)) return;
    ensuring.current.add(week);
    setPlanningWeek(week);
    try {
      const res = await fetch(`/api/plan?week=${week}&ensure=1`, { method: "POST" });
      if (!res.ok) throw new Error();
      await loadPlan(false, true);
    } catch {
      ensuring.current.delete(week);
    } finally {
      setPlanningWeek((cur) => (cur === week ? null : cur));
    }
  }

  // Today's hard session, if any, so the readiness card can speak to it.
  const hardToday = (() => {
    const day = plan?.days.find((d) => d.date === plan.today);
    const session = day?.sessionId ? plan?.sessions.find((s) => s.id === day.sessionId) : undefined;
    if (!session || day?.status === "done") return null;
    const run = plannedRunFor(session, plan?.zones);
    if (run && KEY_RUNS.has(run.type)) return session.title;
    return session.taxesLegs ? session.title : null;
  })();

  return (
    <div>
      <PageHeader title="Today" subtitle="Your plan for the week." />

      <div className="mb-4 px-4">
        <ReadinessCard hardToday={hardToday} />
      </div>

      {planLoading ? (
        <Spinner label="Building this week's plan…" />
      ) : planError ? (
        <div className="px-4">
          <div className="card">
            <p className="text-sm text-danger">{planError}</p>
            <button onClick={() => loadPlan(false)} className="btn-secondary mt-3 w-full text-sm">
              Try again
            </button>
          </div>
        </div>
      ) : plan ? (
        <TodayPlan
          plan={plan}
          milesThisWeek={planContext?.milesThisWeek ?? 0}
          weeklyMileage={planContext?.marathon?.weeklyMileage ?? null}
          onRegenerate={(week) => loadPlan(true, false, week)}
          planningWeek={planningWeek}
          regenerating={regenerating}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          mileageNote={mileageNote}
        />
      ) : null}

      {bodyRegions && (
        <div className="mt-4 px-4">
          <BodyMap regions={bodyRegions} window={bodyWindow} onWindowChange={setBodyWindow} />
        </div>
      )}

      <div className="mt-5 px-4">
        <GoalCountdown />
      </div>

    </div>
  );
}
