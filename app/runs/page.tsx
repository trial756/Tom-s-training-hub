"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import CoachingNote from "@/components/CoachingNote";
import Spinner from "@/components/Spinner";
import UndoToast from "@/components/UndoToast";
import { garminLine, plannedLine, type PendingItem } from "@/components/PendingRunReview";
import type { IntervalSet, Run, RunIntervals } from "@/lib/types";
import { FEEL_CHIPS, RUN_TYPES } from "@/lib/types";
import { formatDuration, formatLoggedAt, formatPace, localDateKey, loggedAtFor } from "@/lib/format";
import { notifyDataChanged } from "@/lib/refresh";
import { GOAL_PACE_SECONDS_PER_MILE } from "@/lib/marathonPlan";
import { digitsToClock, parseClock, secondsToDigits } from "@/lib/clock";
import type { WeekPlan } from "@/lib/planner/types";
import { formatPaceRange, plannedRunFor, runPrefillQuery, type PlannedRun } from "@/lib/planner/runPlan";
import {
  describeIntervals,
  emptyIntervalSet,
  emptyIntervals,
  hasIntervalData,
  setRepPaceSeconds,
} from "@/lib/intervals";

const RUN_TYPE_COLORS: Record<string, string> = {
  Easy: "bg-run/20 text-run",
  Tempo: "bg-fuel/20 text-fuel",
  Long: "bg-accent/20 text-accent",
  "Marathon Pace": "bg-pink-500/20 text-pink-300",
  Interval: "bg-purple-500/20 text-purple-300",
  Race: "bg-red-500/20 text-red-300",
  Other: "bg-gray-500/20 text-gray-300",
};



// Goal marathon pace is 8:01/mi (481s). Green = at or ahead of goal, amber =
// within 60s of it, red = more than 60s slower. Applied uniformly regardless
// of run type, matching the reference artifact's simple at-a-glance coding.
function paceColorClass(paceSecondsPerMile: number | null | undefined): string {
  if (!paceSecondsPerMile) return "text-gray-300";
  const diff = paceSecondsPerMile - GOAL_PACE_SECONDS_PER_MILE;
  if (diff <= 0) return "text-accent";
  if (diff <= 60) return "text-fuel";
  return "text-danger";
}

function todayISO(): string {
  return localDateKey(new Date());
}

interface FormState {
  distance: string;
  duration: string; // raw digits, e.g. "10517" for 1:05:17 — see digitsToClock
  pace: string; // raw digits, e.g. "844" for 8:44
  avgHr: string;
  maxHr: string;
  cadence: string;
  elevGain: string;
  elevLoss: string;
  calories: string;
  temp: string;
  humidity: string;
  surface: string;
  shoes: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  distance: "",
  duration: "",
  pace: "",
  avgHr: "",
  maxHr: "",
  cadence: "",
  elevGain: "",
  elevLoss: "",
  calories: "",
  temp: "",
  humidity: "",
  surface: "",
  shoes: "",
  notes: "",
};

/** A saved run back into the form, for editing. */
function runToForm(r: Run): FormState {
  const str = (v: number | string | null | undefined) => (v == null ? "" : String(v));
  return {
    distance: str(r.distance_miles),
    duration: secondsToDigits(r.duration_seconds),
    pace: secondsToDigits(r.pace_seconds_per_mile),
    avgHr: str(r.avg_hr),
    maxHr: str(r.max_hr),
    cadence: str(r.cadence_spm),
    elevGain: str(r.elev_gain_ft),
    elevLoss: str(r.elev_loss_ft),
    calories: str(r.calories),
    temp: str(r.temp_f),
    humidity: str(r.humidity_pct),
    surface: r.surface ?? "",
    shoes: r.shoes ?? "",
    notes: r.notes ?? "",
  };
}

export default function RunsPage() {
  const [date, setDate] = useState(todayISO());
  const [runType, setRunType] = useState<string>("");
  const [feel, setFeel] = useState<string>("");
  const [intervals, setIntervals] = useState<RunIntervals>(emptyIntervals);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Run | null>(null);
  const [recent, setRecent] = useState<Run[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [shoeOptions, setShoeOptions] = useState<{ shoes: string; miles: number }[]>([]);
  const [addingShoe, setAddingShoe] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteSaved, setFavoriteSaved] = useState(false);
  const [search, setSearch] = useState("");
  // Editing an existing run: the same form, saved over the original.
  const [editing, setEditing] = useState<Run | null>(null);
  // A Garmin run awaiting confirmation, open in the form (editing is set too).
  const [reviewing, setReviewing] = useState<PendingItem | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Today's planned run, offered as a one-tap prefill.
  const [todayPlan, setTodayPlan] = useState<{ run: PlannedRun; query: string } | null>(null);
  // Set when the form was filled from the plan: the target, kept in view above the form.
  const [fromPlan, setFromPlan] = useState<{ target: string } | null>(null);

  useEffect(() => {
    loadRecent();
    // Read off location rather than useSearchParams so the page stays
    // statically rendered without a Suspense boundary.
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId) {
      fetch(`/api/runs/${editId}`)
        .then((res) => res.json())
        .then((json) => json.run && startEdit(json.run));
    } else if (params.get("plan")) {
      applyPlanParams(params);
    }
    loadTodayPlan();
    if (!editId && !params.get("plan")) loadPending(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTodayPlan() {
    try {
      const json: { plan?: WeekPlan } = await fetch("/api/plan").then((res) => res.json());
      const plan = json.plan;
      if (!plan) return;
      const day = plan.days?.find((d) => d.date === plan.today);
      const session = day?.sessionId ? plan.sessions.find((s) => s.id === day.sessionId) : undefined;
      const run = session ? plannedRunFor(session) : null;
      if (session && run && !day?.loggedRun) setTodayPlan({ run, query: runPrefillQuery(session, null) });
    } catch {
      // The banner is a convenience; the form works without it.
    }
  }

  /** Fills the form from a plan session's prefill query. Everything stays editable. */
  function applyPlanParams(params: URLSearchParams) {
    const type = params.get("runType");
    if (type && (RUN_TYPES as readonly string[]).includes(type)) setRunType(type);
    setForm((prev) => ({
      ...prev,
      distance: params.get("distance") ?? prev.distance,
      pace: params.get("pace") ?? prev.pace,
      notes: params.get("notes") ?? prev.notes,
    }));
    const planDate = params.get("date");
    if (planDate && /^\d{4}-\d{2}-\d{2}$/.test(planDate)) setDate(planDate);
    const target = (params.get("notes") ?? "").replace(/^Plan:\s*/, "");
    const paceDigits = params.get("pace");
    setFromPlan({
      target: [params.get("distance") ? `${params.get("distance")} mi` : "", type ?? "", target || (paceDigits ? `@ ${digitsToClock(paceDigits)}/mi` : "")]
        .filter(Boolean)
        .join(" · "),
    });
  }

  /** Runs awaiting confirmation; with `open`, the newest goes straight into the form. */
  async function loadPending(open: boolean) {
    try {
      const json = await fetch("/api/runs/pending").then((r) => r.json());
      const items = (json.pending ?? []) as PendingItem[];
      setPendingCount(items.length);
      if (open && items[0]) startReview(items[0]);
    } catch {
      // The form works without it.
    }
  }

  function startReview(item: PendingItem) {
    startEdit(item.run);
    setReviewing(item);
  }

  function startEdit(r: Run) {
    setEditing(r);
    setFromPlan(null);
    setLastSaved(null);
    setError(null);
    setRunType(r.run_type ?? "");
    setFeel(r.feel ?? "");
    setIntervals(r.intervals ?? emptyIntervals());
    setForm(runToForm(r));
    setDate(localDateKey(new Date(r.logged_at)));
    setAddingShoe(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setReviewing(null);
    setForm(EMPTY_FORM);
    setRunType("");
    setFeel("");
    setIntervals(emptyIntervals());
    setAddingShoe(false);
    setDate(todayISO());
    setEditing(null);
    setFromPlan(null);
  }

  async function loadRecent() {
    setLoadingRecent(true);
    try {
      const [runsJson, shoesJson] = await Promise.all([
        fetch("/api/runs?limit=8").then((res) => res.json()),
        fetch("/api/runs/shoes").then((res) => res.json()),
      ]);
      setRecent(runsJson.runs ?? []);
      setShoeOptions(shoesJson.shoes ?? []);
    } finally {
      setLoadingRecent(false);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFavoriteSaved(false);
    try {
      const payload: Record<string, unknown> = {
        run_type: runType || null,
        distance_miles: form.distance || null,
        duration_seconds: parseClock(digitsToClock(form.duration)),
        pace_seconds_per_mile: parseClock(digitsToClock(form.pace)),
        avg_hr: form.avgHr || null,
        max_hr: form.maxHr || null,
        cadence_spm: form.cadence || null,
        elev_gain_ft: form.elevGain || null,
        elev_loss_ft: form.elevLoss || null,
        calories: form.calories || null,
        temp_f: form.temp || null,
        humidity_pct: form.humidity || null,
        surface: form.surface || null,
        shoes: form.shoes || null,
        notes: form.notes || null,
        feel: feel || null,
        intervals: hasIntervalData(intervals) ? intervals : null,
      };
      // Distance, time and pace are tied together: on an edit, whichever of
      // them the user didn't touch is recomputed from the ones they did, so
      // correcting the distance doesn't leave the old pace behind.
      if (editing) {
        const before = runToForm(editing);
        const changed = (k: keyof FormState) => form[k].trim() !== before[k].trim();
        if ((changed("distance") || changed("duration")) && !changed("pace")) payload.pace_seconds_per_mile = null;
        else if (changed("pace") && !changed("distance") && !changed("duration")) payload.duration_seconds = null;
      }
      // An edit keeps its original time unless the date itself moved.
      if (!editing || date !== localDateKey(new Date(editing.logged_at))) payload.logged_at = loggedAtFor(date);

      const wasReviewing = !!reviewing;
      // Confirming writes the coaching, for the run type picked here.
      const res = await fetch(reviewing ? `/api/runs/${reviewing.run.id}/confirm` : editing ? `/api/runs/${editing.id}` : "/api/runs", {
        method: reviewing ? "POST" : editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? (editing ? "Failed to save changes." : "Failed to log run."));
      setLastSaved(json.run);
      notifyDataChanged("run");
      if (!editing) setTodayPlan(null);
      resetForm();
      loadRecent();
      // The next run waiting, if any, opens in turn.
      if (wasReviewing) loadPending(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function copyLastRun() {
    const last = recent[0];
    if (!last) return;
    setRunType(last.run_type ?? "");
    setForm((prev) => ({ ...prev, surface: last.surface ?? "", shoes: last.shoes ?? "" }));
  }

  // Nothing on this form is required — not even the run type. The only bar
  // for logging is that *something* was entered, so an accidental tap on an
  // empty form doesn't create a blank run.
  const hasAnyInput =
    Object.values(form).some((v) => v.trim() !== "") || !!runType || !!feel || hasIntervalData(intervals);

  function updateIntervals(patch: Partial<RunIntervals>) {
    setIntervals((prev) => ({ ...prev, ...patch }));
  }

  function updateSegment(which: "warmup" | "cooldown", patch: Partial<{ distance_miles: number | null; pace_seconds_per_mile: number | null }>) {
    setIntervals((prev) => ({
      ...prev,
      [which]: {
        distance_miles: prev[which]?.distance_miles ?? null,
        pace_seconds_per_mile: prev[which]?.pace_seconds_per_mile ?? null,
        ...patch,
      },
    }));
  }

  function updateSet(index: number, patch: Partial<IntervalSet>) {
    setIntervals((prev) => ({
      ...prev,
      sets: prev.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  function addSet() {
    setIntervals((prev) => ({ ...prev, sets: [...prev.sets, emptyIntervalSet()] }));
  }

  function removeSet(index: number) {
    setIntervals((prev) => ({
      ...prev,
      sets: prev.sets.length === 1 ? [emptyIntervalSet()] : prev.sets.filter((_, i) => i !== index),
    }));
  }

  const filteredRecent = recent.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.run_type, r.surface, r.shoes, r.notes, r.feel].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
  });

  async function saveFavorite() {
    if (!lastSaved) return;
    setSavingFavorite(true);
    try {
      const name = window.prompt(
        "Name this favorite:",
        `${lastSaved.distance_miles ?? "?"}mi ${lastSaved.run_type ?? "run"}`
      );
      if (!name) return;
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "run",
          name,
          raw_text: lastSaved.raw_text,
          data: {
            run_type: lastSaved.run_type,
            distance_miles: lastSaved.distance_miles,
            duration_seconds: lastSaved.duration_seconds,
            pace_seconds_per_mile: lastSaved.pace_seconds_per_mile,
            avg_hr: lastSaved.avg_hr,
            max_hr: lastSaved.max_hr,
            cadence_spm: lastSaved.cadence_spm,
            elev_gain_ft: lastSaved.elev_gain_ft,
            elev_loss_ft: lastSaved.elev_loss_ft,
            calories: lastSaved.calories,
            temp_f: lastSaved.temp_f,
            humidity_pct: lastSaved.humidity_pct,
            surface: lastSaved.surface,
            shoes: lastSaved.shoes,
            feel: lastSaved.feel,
            notes: lastSaved.notes,
            coaching_feedback: lastSaved.coaching_feedback,
          },
        }),
      });
      setFavoriteSaved(true);
    } finally {
      setSavingFavorite(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={reviewing ? "Confirm Garmin Run" : editing ? "Edit Run" : "Log a Run"}
        subtitle={
          reviewing
            ? "From your watch — add how it felt, fix anything, then confirm."
            : editing
            ? "Change anything, then save — the original entry is updated."
            : "Fill in whatever you've got — nothing is required."
        }
      />

      {reviewing ? (
        <div className="mx-4 mb-4 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
            Awaiting confirmation · {formatLoggedAt(reviewing.run.logged_at, reviewing.run.created_at)}
          </p>
          {plannedLine(reviewing.planned) && <p className="mt-0.5 text-sm text-ink">{plannedLine(reviewing.planned)}</p>}
          {garminLine(reviewing.run) && <p className="mt-0.5 text-[11px] text-faint">Garmin: {garminLine(reviewing.run)}</p>}
          {reviewing.planned?.run && runType && runType !== reviewing.planned.run.type && (
            <p className="mt-1 text-[11px] text-fuel">
              Different from the plan — coaching will follow {runType}, and the planned {reviewing.planned.run.type.toLowerCase()} moves later
              in the week.
            </p>
          )}
          <div className="mt-1 flex gap-4">
            <button
              type="button"
              onClick={() => {
                setDeletingId(reviewing.run.id);
                resetForm();
              }}
              className="min-h-[44px] text-xs font-semibold text-gray-500 active:text-danger"
            >
              Delete run
            </button>
            <button type="button" onClick={resetForm} className="min-h-[44px] text-xs font-semibold text-muted">
              Log a different run
            </button>
          </div>
        </div>
      ) : !editing && pendingCount > 0 ? (
        <button
          type="button"
          onClick={() => loadPending(true)}
          className="mx-4 mb-4 flex min-h-[44px] w-[calc(100%-2rem)] items-center justify-between rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-left"
        >
          <span className="text-sm text-ink">
            {pendingCount} Garmin run{pendingCount === 1 ? "" : "s"} awaiting confirmation
          </span>
          <span className="text-sm font-semibold text-accent">Review</span>
        </button>
      ) : editing ? (
        <div className="mx-4 mb-4 flex items-center justify-between gap-2 rounded-xl border border-fuel/40 bg-fuel/10 px-3 py-2">
          <span className="text-xs text-fuel">Editing {formatLoggedAt(editing.logged_at, editing.created_at)} run</span>
          <button type="button" onClick={resetForm} className="min-h-[44px] px-2 text-xs font-semibold text-fuel">
            Cancel
          </button>
        </div>
      ) : todayPlan && !fromPlan ? (
        <div className="mx-4 mb-4 flex items-center justify-between gap-2 rounded-xl border border-run/30 bg-run/5 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-faint">Today&apos;s plan</p>
            <p className="truncate text-sm text-ink">
              {todayPlan.run.miles ? `${todayPlan.run.miles} mi ` : ""}
              {todayPlan.run.type}
              {todayPlan.run.pace ? ` @ ${formatPaceRange(todayPlan.run.pace)}` : ""}
            </p>
            {todayPlan.run.structure && <p className="truncate text-xs text-muted">{todayPlan.run.structure}</p>}
          </div>
          <button
            type="button"
            onClick={() => applyPlanParams(new URLSearchParams(todayPlan.query))}
            className="min-h-[44px] shrink-0 rounded-xl bg-run/20 px-3 text-sm font-semibold text-run"
          >
            Use plan
          </button>
        </div>
      ) : fromPlan ? (
        <div className="mx-4 mb-4 rounded-xl border border-run/30 bg-run/5 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-faint">From today&apos;s plan</p>
          <p className="text-sm text-ink">{fromPlan.target}</p>
          <p className="mt-0.5 text-xs text-muted">Filled in below — change anything that went differently.</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="px-4">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Date</label>
            <input
              type="date"
              className="input-field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
            />
          </div>
          <button
            type="button"
            onClick={copyLastRun}
            disabled={submitting || recent.length === 0}
            className="whitespace-nowrap rounded-xl border border-base-600 bg-base-800 px-3 py-3 text-sm font-medium text-gray-300 active:border-accent active:text-accent disabled:opacity-40"
          >
            Copy last run
          </button>
        </div>

        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Run Type</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {RUN_TYPES.map((rt) => (
            <button
              key={rt}
              type="button"
              onClick={() => setRunType(rt)}
              disabled={submitting}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                runType === rt
                  ? "border-accent bg-accent text-white"
                  : "border-base-600 bg-base-800 text-gray-300 active:border-accent"
              }`}
            >
              {rt}
            </button>
          ))}
        </div>

        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Feel</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {FEEL_CHIPS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFeel((prev) => (prev === f.label ? "" : f.label))}
              disabled={submitting}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                feel === f.label
                  ? "border-accent bg-accent text-white"
                  : "border-base-600 bg-base-800 text-gray-300 active:border-accent"
              }`}
            >
              {f.emoji} {f.label}
            </button>
          ))}
        </div>

        {runType === "Interval" && (
          <IntervalEditor
            // Its fields seed from props on mount; a new key reseeds them for a different run.
            key={editing?.id ?? "new"}
            intervals={intervals}
            disabled={submitting}
            onModeChange={(mode) => updateIntervals({ mode })}
            onSegmentChange={updateSegment}
            onQuickPaceChange={(which, seconds) =>
              updateIntervals(
                which === "work" ? { work_pace_seconds_per_mile: seconds } : { recovery_pace_seconds_per_mile: seconds }
              )
            }
            onSetChange={updateSet}
            onAddSet={addSet}
            onRemoveSet={removeSet}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Distance (mi)" value={form.distance} onChange={(v) => updateField("distance", v)} placeholder="6.2" disabled={submitting} />
          <ClockField label="Duration (h:mm:ss)" digits={form.duration} onChange={(v) => updateField("duration", v)} placeholder="0:54:10" disabled={submitting} />
          <ClockField label="Avg Pace (mm:ss)" digits={form.pace} onChange={(v) => updateField("pace", v)} placeholder="8:44" disabled={submitting} />
          <Field label="Avg HR (bpm)" value={form.avgHr} onChange={(v) => updateField("avgHr", v)} placeholder="152" disabled={submitting} />
          <Field label="Max HR (bpm)" value={form.maxHr} onChange={(v) => updateField("maxHr", v)} placeholder="174" disabled={submitting} />
          <Field label="Cadence (spm)" value={form.cadence} onChange={(v) => updateField("cadence", v)} placeholder="172" disabled={submitting} />
          <Field label="Elev Gain (ft)" value={form.elevGain} onChange={(v) => updateField("elevGain", v)} placeholder="280" disabled={submitting} />
          <Field label="Elev Loss (ft)" value={form.elevLoss} onChange={(v) => updateField("elevLoss", v)} placeholder="265" disabled={submitting} />
          <Field label="Calories" value={form.calories} onChange={(v) => updateField("calories", v)} placeholder="620" disabled={submitting} />
          <Field label="Temp (°F)" value={form.temp} onChange={(v) => updateField("temp", v)} placeholder="72" disabled={submitting} />
          <Field label="Humidity (%)" value={form.humidity} onChange={(v) => updateField("humidity", v)} placeholder="55" disabled={submitting} />
          <Field label="Surface" value={form.surface} onChange={(v) => updateField("surface", v)} placeholder="road, trail…" disabled={submitting} type="text" />
          <ShoeField
            value={form.shoes}
            options={shoeOptions}
            addingNew={addingShoe}
            onSelect={(v) => {
              setAddingShoe(false);
              updateField("shoes", v);
            }}
            onAddNew={() => {
              setAddingShoe(true);
              updateField("shoes", "");
            }}
            onTypeNew={(v) => updateField("shoes", v)}
            disabled={submitting}
          />
        </div>

        <label className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notes (optional)</label>
        <textarea
          className="input-field min-h-[70px] resize-none"
          placeholder="Felt great, negative split the last 2 miles…"
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          disabled={submitting}
        />

        <button type="submit" className="btn-primary mt-4 w-full" disabled={submitting || !hasAnyInput}>
          {submitting
            ? editing && !reviewing
              ? "Saving…"
              : "Getting coaching feedback…"
            : reviewing
            ? "Confirm run"
            : editing
            ? "Save changes"
            : "Log Run"}
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </form>

      {submitting && (!editing || reviewing) && <Spinner label="Claude is reviewing your run…" />}
      {deletingId && (
        <UndoToast
          label="Run deleted"
          onUndo={() => {
            setDeletingId(null);
            loadPending(true);
          }}
          onExpire={async () => {
            const id = deletingId;
            setDeletingId(null);
            await fetch(`/api/runs/${id}`, { method: "DELETE" });
            notifyDataChanged("run");
            loadRecent();
            loadPending(false);
          }}
        />
      )}

      {lastSaved && !submitting && (
        <div className="mt-5 px-4">
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className={`pill ${RUN_TYPE_COLORS[lastSaved.run_type ?? "Other"] ?? RUN_TYPE_COLORS.Other}`}>
                {lastSaved.run_type ?? "run"}
              </span>
              <button
                onClick={saveFavorite}
                disabled={savingFavorite || favoriteSaved}
                className="text-xs font-medium text-gray-400 active:text-accent"
              >
                {favoriteSaved ? "★ Saved" : "☆ Save as favorite"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-white">{lastSaved.distance_miles ?? "—"}</p>
                <p className="text-[11px] text-gray-500">miles</p>
              </div>
              <div>
                <p className="text-lg font-bold text-white">{formatDuration(lastSaved.duration_seconds)}</p>
                <p className="text-[11px] text-gray-500">time</p>
              </div>
              <div>
                <p className={`text-lg font-bold ${paceColorClass(lastSaved.pace_seconds_per_mile)}`}>
                  {formatPace(lastSaved.pace_seconds_per_mile)}
                </p>
                <p className="text-[11px] text-gray-500">pace</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-gray-500">
              {lastSaved.avg_hr && <span>Avg HR {lastSaved.avg_hr}</span>}
              {lastSaved.max_hr && <span>Max HR {lastSaved.max_hr}</span>}
              {lastSaved.cadence_spm && <span>Cadence {lastSaved.cadence_spm} spm</span>}
              {(lastSaved.elev_gain_ft || lastSaved.elev_loss_ft) && (
                <span>
                  Elev +{lastSaved.elev_gain_ft ?? 0}/-{lastSaved.elev_loss_ft ?? 0} ft
                </span>
              )}
              {lastSaved.calories && <span>{lastSaved.calories} cal</span>}
              {lastSaved.surface && <span className="capitalize">{lastSaved.surface}</span>}
              {lastSaved.shoes && <span>{lastSaved.shoes}</span>}
              {lastSaved.feel && <span>{FEEL_CHIPS.find((f) => f.label === lastSaved.feel)?.emoji} {lastSaved.feel}</span>}
            </div>
            {lastSaved.intervals && (
              <p className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-2 text-xs text-gray-300">
                {describeIntervals(lastSaved.intervals)}
              </p>
            )}
            {lastSaved.pace_note && <p className="mt-2 text-center text-xs text-gray-500">{lastSaved.pace_note}</p>}
            <CoachingNote
              feedback={lastSaved.coaching_feedback}
              vsLastTime={lastSaved.vs_last_time}
              adjustments={lastSaved.adjustments}
            />
          </div>
        </div>
      )}

      <div className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Recent Runs</h2>
        <input
          type="text"
          className="input-field mb-3"
          placeholder="Search by type, surface, shoes, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {loadingRecent ? (
          <Spinner />
        ) : recent.length === 0 ? (
          <p className="text-sm text-gray-500">No runs logged yet.</p>
        ) : filteredRecent.length === 0 ? (
          <p className="text-sm text-gray-500">No runs match “{search}”.</p>
        ) : (
          <div className="space-y-2">
            {filteredRecent.map((r) => (
              <div key={r.id} className="card flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`pill ${RUN_TYPE_COLORS[r.run_type ?? "Other"] ?? RUN_TYPE_COLORS.Other}`}>
                      {r.run_type ?? "run"}
                    </span>
                    <span className="text-xs text-gray-500">{formatLoggedAt(r.logged_at, r.created_at)}</span>
                    {r.garmin_activity_id && <span className="text-[10px] font-medium uppercase tracking-wide text-faint">Garmin</span>}
                    {r.review_status === "pending" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">Awaiting confirmation</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-300">
                    {r.distance_miles ?? "?"} mi ·{" "}
                    <span className={paceColorClass(r.pace_seconds_per_mile)}>{formatPace(r.pace_seconds_per_mile)}</span> ·{" "}
                    {formatDuration(r.duration_seconds)}
                    {r.shoes ? ` · ${r.shoes}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => (r.review_status === "pending" ? loadPending(true) : startEdit(r))}
                  className="min-h-[44px] shrink-0 px-2 text-xs font-medium text-muted active:text-accent"
                >
                  {r.review_status === "pending" ? "Review" : "Edit"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  type = "number",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "number" | "text";
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      <input
        type={type === "number" ? "text" : "text"}
        inputMode={type === "number" ? "decimal" : "text"}
        className="input-field"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

// Type digits straight through and it auto-formats as a clock value
// (e.g. "10517" -> "1:05:17"). `digits` is the raw, unformatted state;
// the displayed value is always the formatted version.
function ClockField({
  label,
  digits,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  digits: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className="input-field"
        placeholder={placeholder}
        value={digitsToClock(digits)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        disabled={disabled}
      />
    </div>
  );
}

// ── Interval session editor ─────────────────────────────────────────────
// Shown only for Interval runs. Two modes, because an interval session is
// run at several different paces and how much detail you want to capture
// varies: "Quick" records one pace per effort type, "Detailed" records each
// repeat set so ladders and mixed sessions survive intact.

// Masked clock input that talks in seconds instead of raw digits. Internal
// digit state is seeded from the incoming value on mount, so switching run
// type away and back doesn't blank out what's already entered.
function SecondsClockField({
  label,
  seconds,
  onChange,
  placeholder,
  disabled,
  compact,
}: {
  label: string;
  seconds: number | null;
  onChange: (seconds: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [digits, setDigits] = useState(() => secondsToDigits(seconds));

  return (
    <div>
      <label className={`mb-1 block font-semibold uppercase tracking-wide text-gray-500 ${compact ? "text-[10px]" : "text-xs"}`}>
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        className="input-field"
        placeholder={placeholder}
        value={digitsToClock(digits)}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "");
          setDigits(next);
          onChange(parseClock(digitsToClock(next)));
        }}
        disabled={disabled}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  compact,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [text, setText] = useState(() => (value == null ? "" : String(value)));

  return (
    <div>
      <label className={`mb-1 block font-semibold uppercase tracking-wide text-gray-500 ${compact ? "text-[10px]" : "text-xs"}`}>
        {label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        className="input-field"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const n = Number(next);
          onChange(next.trim() === "" || !Number.isFinite(n) ? null : n);
        }}
        disabled={disabled}
      />
    </div>
  );
}

function IntervalEditor({
  intervals,
  disabled,
  onModeChange,
  onSegmentChange,
  onQuickPaceChange,
  onSetChange,
  onAddSet,
  onRemoveSet,
}: {
  intervals: RunIntervals;
  disabled?: boolean;
  onModeChange: (mode: RunIntervals["mode"]) => void;
  onSegmentChange: (
    which: "warmup" | "cooldown",
    patch: Partial<{ distance_miles: number | null; pace_seconds_per_mile: number | null }>
  ) => void;
  onQuickPaceChange: (which: "work" | "recovery", seconds: number | null) => void;
  onSetChange: (index: number, patch: Partial<IntervalSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (index: number) => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-purple-300">Intervals</span>
        <div className="flex gap-1 rounded-lg bg-base-800 p-0.5">
          {(["quick", "detailed"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              disabled={disabled}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                intervals.mode === m ? "bg-accent text-base-950" : "text-gray-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <NumField
          label="Warmup (mi)"
          compact
          value={intervals.warmup?.distance_miles ?? null}
          onChange={(v) => onSegmentChange("warmup", { distance_miles: v })}
          placeholder="1.5"
          disabled={disabled}
        />
        <SecondsClockField
          label="Warmup pace"
          compact
          seconds={intervals.warmup?.pace_seconds_per_mile ?? null}
          onChange={(v) => onSegmentChange("warmup", { pace_seconds_per_mile: v })}
          placeholder="9:40"
          disabled={disabled}
        />
      </div>

      {intervals.mode === "quick" ? (
        <div className="grid grid-cols-2 gap-2">
          <SecondsClockField
            label="Work pace"
            compact
            seconds={intervals.work_pace_seconds_per_mile}
            onChange={(v) => onQuickPaceChange("work", v)}
            placeholder="6:12"
            disabled={disabled}
          />
          <SecondsClockField
            label="Recovery pace"
            compact
            seconds={intervals.recovery_pace_seconds_per_mile}
            onChange={(v) => onQuickPaceChange("recovery", v)}
            placeholder="10:30"
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {intervals.sets.map((set, i) => {
            const pace = setRepPaceSeconds(set);
            return (
              <div key={i} className="rounded-xl border border-base-700 bg-base-900 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Set {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveSet(i)}
                    disabled={disabled}
                    className="text-xs text-gray-600 active:text-danger"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumField
                    label="Reps"
                    compact
                    value={set.reps}
                    onChange={(v) => onSetChange(i, { reps: v })}
                    placeholder="6"
                    disabled={disabled}
                  />
                  <NumField
                    label="Distance"
                    compact
                    value={set.distance_value}
                    onChange={(v) => onSetChange(i, { distance_value: v })}
                    placeholder="800"
                    disabled={disabled}
                  />
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Unit</label>
                    <div className="flex gap-1 rounded-xl bg-base-800 p-0.5">
                      {(["m", "mi"] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => onSetChange(i, { distance_unit: u })}
                          disabled={disabled}
                          className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                            set.distance_unit === u ? "bg-accent text-base-950" : "text-gray-400"
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <SecondsClockField
                    label="Time / rep"
                    compact
                    seconds={set.rep_seconds}
                    onChange={(v) => onSetChange(i, { rep_seconds: v })}
                    placeholder="3:05"
                    disabled={disabled}
                  />
                  <SecondsClockField
                    label="Recovery"
                    compact
                    seconds={set.recovery_seconds}
                    onChange={(v) => onSetChange(i, { recovery_seconds: v })}
                    placeholder="2:00"
                    disabled={disabled}
                  />
                </div>
                {pace && (
                  <p className={`mt-2 text-xs font-medium ${paceColorClass(pace)}`}>→ {formatPace(pace)} per rep</p>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={onAddSet}
            disabled={disabled}
            className="w-full rounded-xl border border-dashed border-base-600 py-2 text-xs font-medium text-gray-400 active:border-accent active:text-accent"
          >
            + Add set
          </button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumField
          label="Cooldown (mi)"
          compact
          value={intervals.cooldown?.distance_miles ?? null}
          onChange={(v) => onSegmentChange("cooldown", { distance_miles: v })}
          placeholder="1.0"
          disabled={disabled}
        />
        <SecondsClockField
          label="Cooldown pace"
          compact
          seconds={intervals.cooldown?.pace_seconds_per_mile ?? null}
          onChange={(v) => onSegmentChange("cooldown", { pace_seconds_per_mile: v })}
          placeholder="10:05"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// Picking a previously-used pair rather than retyping it is what keeps one
// pair from fragmenting into several spellings and splitting its mileage in
// the Marathon tab's shoe tracker. Mileage rides along in the option text so
// a pair nearing the ~350mi retirement mark is visible at the point of entry.
function ShoeField({
  value,
  options,
  addingNew,
  onSelect,
  onAddNew,
  onTypeNew,
  disabled,
}: {
  value: string;
  options: { shoes: string; miles: number }[];
  addingNew: boolean;
  onSelect: (value: string) => void;
  onAddNew: () => void;
  onTypeNew: (value: string) => void;
  disabled?: boolean;
}) {
  // An existing run being edited may carry a shoe that predates this list.
  const known = options.some((o) => o.shoes === value);
  const showNewInput = addingNew || (!!value && !known);

  return (
    // Full row — shoe names plus mileage don't fit a half-width field.
    <div className="col-span-2">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Shoes</label>
      {showNewInput ? (
        <div className="flex gap-1">
          <input
            type="text"
            className="input-field"
            placeholder="Brooks Ghost 15"
            value={value}
            onChange={(e) => onTypeNew(e.target.value)}
            disabled={disabled}
            autoFocus={addingNew}
          />
          {options.length > 0 && (
            <button
              type="button"
              onClick={() => onSelect("")}
              disabled={disabled}
              className="shrink-0 rounded-xl border border-base-600 bg-base-800 px-2 text-xs text-gray-400 active:text-accent"
              aria-label="Back to shoe list"
            >
              ↩
            </button>
          )}
        </div>
      ) : (
        <select
          className="input-field"
          value={value}
          onChange={(e) => (e.target.value === "__new__" ? onAddNew() : onSelect(e.target.value))}
          disabled={disabled}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.shoes} value={o.shoes}>
              {o.shoes}
              {o.miles > 0 ? ` · ${o.miles} mi` : ""}
            </option>
          ))}
          <option value="__new__">+ Add new shoe</option>
        </select>
      )}
    </div>
  );
}
