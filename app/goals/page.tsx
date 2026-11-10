"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Spinner from "@/components/Spinner";
import UndoToast from "@/components/UndoToast";
import { daysBetweenKeys, localDateKey } from "@/lib/format";
import { digitsToClock, parseClock, secondsToDigits } from "@/lib/clock";
import { notifyDataChanged } from "@/lib/refresh";
import type { FocusType, Goal, GoalPriority } from "@/lib/goals";
import type { PaceZones } from "@/lib/paceZones";
import PaceZonesCard from "@/components/PaceZonesCard";

interface GoalsResponse {
  goals: Goal[];
  nextRace: Goal | null;
  block: { kind: string; summary: string; goalId: string | null };
  zones?: PaceZones;
}

const DISTANCES: { label: string; miles: number }[] = [
  { label: "5K", miles: 3.1 },
  { label: "10K", miles: 6.2 },
  { label: "Half", miles: 13.1 },
  { label: "Marathon", miles: 26.2 },
];

const PRIORITY: Record<GoalPriority, { label: string; hint: string }> = {
  A: { label: "Main", hint: "Gets a full training block" },
  B: { label: "Secondary", hint: "Gets a block when no main race overlaps" },
  C: { label: "For fun", hint: "No block; the week around it eases off" },
};

const FOCUS: { value: FocusType; label: string }[] = [
  { value: "athleticism", label: "Muscle & athleticism" },
  { value: "hypertrophy", label: "Build muscle" },
  { value: "strength", label: "Get stronger" },
  { value: "endurance", label: "Endurance" },
  { value: "general", label: "General fitness" },
];

/** Plan_keys with a hand-built race page. */
const RACE_PAGES: Record<string, string> = { "dallas-2026": "/marathon" };

const fmtClock = (s: number) => digitsToClock(secondsToDigits(s));
const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function distanceLabel(mi: number | null | undefined): string {
  if (!mi) return "";
  return DISTANCES.find((d) => Math.abs(d.miles - mi) < 0.05)?.label ?? `${mi} mi`;
}

function whenLabel(date: string, today: string, kind: Goal["kind"]): string {
  const days = daysBetweenKeys(today, date);
  if (kind === "focus") return days > 0 ? `starts in ${days} day${days === 1 ? "" : "s"}` : "current";
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${-days} day${days === -1 ? "" : "s"} ago`;
}

type Draft = {
  kind: Goal["kind"];
  title: string;
  date: string;
  priority: GoalPriority;
  distance_mi: number | null;
  timeDigits: string;
  focus: FocusType | null;
  notes: string;
};

const draftFrom = (g: Goal): Draft => ({
  kind: g.kind,
  title: g.title,
  date: g.date,
  priority: g.priority,
  distance_mi: g.distance_mi ?? null,
  timeDigits: secondsToDigits(g.target_seconds ?? null),
  focus: g.focus ?? null,
  notes: g.notes ?? "",
});

export default function GoalsPage() {
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // goal id, or "new"
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Goal | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/goals?zones=1", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load goals.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load goals.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = localDateKey(new Date());

  function startNew(kind: Goal["kind"]) {
    setEditing("new");
    setDraft({
      kind,
      title: kind === "race" ? "" : "",
      date: today,
      priority: kind === "race" ? "B" : "A",
      distance_mi: kind === "race" ? 13.1 : null,
      timeDigits: "",
      focus: kind === "focus" ? "athleticism" : null,
      notes: "",
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const body = {
      kind: draft.kind,
      title: draft.title,
      date: draft.date,
      priority: draft.priority,
      distance_mi: draft.kind === "race" ? draft.distance_mi : null,
      target_seconds: draft.kind === "race" ? parseClock(digitsToClock(draft.timeDigits)) : null,
      focus: draft.kind === "focus" ? draft.focus : null,
      notes: draft.notes,
    };
    try {
      const res = await fetch(editing === "new" ? "/api/goals" : `/api/goals/${editing}`, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save the goal.");
      setEditing(null);
      setDraft(null);
      await load();
      notifyDataChanged(); // the week plan reads goals
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the goal.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(goal: Goal, status: NonNullable<Goal["status"]>) {
    await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
    notifyDataChanged();
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Goals" subtitle="What your training is for." />
        {error ? <p className="px-4 text-sm text-danger">{error}</p> : <Spinner label="Loading goals…" />}
      </div>
    );
  }

  const visible = data.goals.filter((g) => g.id !== pendingDelete?.id);
  const isActive = (g: Goal) => (g.status ?? "active") === "active";
  const races = visible.filter((g) => isActive(g) && g.kind === "race" && g.date >= today);
  const focuses = visible.filter((g) => isActive(g) && g.kind === "focus");
  const past = visible.filter((g) => !isActive(g) || (g.kind === "race" && g.date < today));

  const card = (g: Goal) => {
    if (editing === g.id && draft) return <div key={g.id}>{renderEditor()}</div>;
    const current = data.block.goalId === g.id;
    const pace = g.kind === "race" && g.distance_mi && g.target_seconds ? g.target_seconds / g.distance_mi : null;
    return (
      <div key={g.id} className={`card ${current ? "border-accent/40" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-ink">{g.title}</p>
            <p className="mt-0.5 text-xs text-muted">
              {fmtDate(g.date)} · {whenLabel(g.date, today, g.kind)}
            </p>
          </div>
          <span className={`pill shrink-0 ${g.priority === "A" ? "bg-accent/15 text-accent" : "bg-base-800 text-muted"}`}>
            {g.kind === "race" ? PRIORITY[g.priority].label : FOCUS.find((f) => f.value === g.focus)?.label ?? "Focus"}
          </span>
        </div>
        {g.kind === "race" && (
          <p className="mt-2 text-sm text-ink">
            {distanceLabel(g.distance_mi)}
            {g.target_seconds ? ` · goal ${fmtClock(g.target_seconds)}` : ""}
            {pace ? <span className="text-muted"> ({fmtPace(pace)}/mi)</span> : null}
          </p>
        )}
        {g.notes && <p className="mt-1 text-xs leading-snug text-muted">{g.notes}</p>}
        {current && <p className="mt-2 text-xs font-medium text-accent">This week: {data.block.summary}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary min-h-[44px] flex-1 text-sm"
            onClick={() => {
              setEditing(g.id);
              setDraft(draftFrom(g));
            }}
          >
            Edit
          </button>
          {g.plan_key && RACE_PAGES[g.plan_key] && (
            <Link href={RACE_PAGES[g.plan_key]} className="btn-secondary flex min-h-[44px] flex-1 items-center justify-center text-sm">
              Race plan →
            </Link>
          )}
          {isActive(g) && g.kind === "race" && g.date < today && (
            <button type="button" className="btn-secondary min-h-[44px] flex-1 text-sm" onClick={() => setStatus(g, "done")}>
              Mark done
            </button>
          )}
          {!isActive(g) && (
            <button type="button" className="btn-secondary min-h-[44px] flex-1 text-sm" onClick={() => setStatus(g, "active")}>
              Make active
            </button>
          )}
        </div>
      </div>
    );
  };

  // Called as a function, not mounted as <Editor />: a component defined
  // inside this one would remount on every keystroke and drop the focus.
  function renderEditor() {
    if (!draft) return null;
    const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
    const chip = (active: boolean) =>
      `min-h-[40px] rounded-full border px-3.5 py-1.5 text-sm font-medium ${
        active ? "border-accent bg-accent text-base-950" : "border-base-600 bg-base-800 text-gray-300"
      }`;
    const label = "mb-1 mt-3 block text-xs font-semibold uppercase tracking-wide text-gray-500";
    const existing = editing !== "new" ? data!.goals.find((g) => g.id === editing) : null;
    return (
      <div className="card border-accent/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          {editing === "new" ? (draft.kind === "race" ? "New race" : "New focus") : "Edit goal"}
        </p>

        <label htmlFor="goal-title" className={label}>
          Name
        </label>
        <input
          id="goal-title"
          className="input-field"
          placeholder={draft.kind === "race" ? "e.g. Spring 10K" : "e.g. Build muscle"}
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
        />

        <label htmlFor="goal-date" className={label}>
          {draft.kind === "race" ? "Race day" : "Starts"}
        </label>
        <input id="goal-date" type="date" className="input-field" value={draft.date} onChange={(e) => set({ date: e.target.value })} />

        {draft.kind === "race" ? (
          <>
            <p className={label}>Distance</p>
            <div className="flex flex-wrap gap-2">
              {DISTANCES.map((d) => (
                <button key={d.label} type="button" className={chip(draft.distance_mi === d.miles)} onClick={() => set({ distance_mi: d.miles })}>
                  {d.label}
                </button>
              ))}
              <input
                aria-label="Other distance in miles"
                inputMode="decimal"
                className="input-field w-24"
                placeholder="mi"
                value={DISTANCES.some((d) => d.miles === draft.distance_mi) ? "" : draft.distance_mi ?? ""}
                onChange={(e) => set({ distance_mi: e.target.value ? Number(e.target.value) : null })}
              />
            </div>

            <label htmlFor="goal-time" className={label}>
              Goal time (optional)
            </label>
            <input
              id="goal-time"
              inputMode="numeric"
              className="input-field"
              placeholder="h:mm:ss"
              value={digitsToClock(draft.timeDigits)}
              onChange={(e) => set({ timeDigits: e.target.value.replace(/\D/g, "") })}
            />

            <p className={label}>Priority</p>
            <div className="flex flex-wrap gap-2">
              {(["A", "B", "C"] as GoalPriority[]).map((p) => (
                <button key={p} type="button" className={chip(draft.priority === p)} onClick={() => set({ priority: p })}>
                  {PRIORITY[p].label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-faint">{PRIORITY[draft.priority].hint}</p>
          </>
        ) : (
          <>
            <p className={label}>Focus</p>
            <div className="flex flex-wrap gap-2">
              {FOCUS.map((f) => (
                <button key={f.value} type="button" className={chip(draft.focus === f.value)} onClick={() => set({ focus: f.value })}>
                  {f.label}
                </button>
              ))}
            </div>
          </>
        )}

        <label htmlFor="goal-notes" className={label}>
          Notes (optional)
        </label>
        <textarea
          id="goal-notes"
          className="input-field min-h-[60px] resize-none"
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />

        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-primary flex-1" disabled={saving || !draft.title.trim()} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn-secondary min-h-[44px] flex-1"
            onClick={() => {
              setEditing(null);
              setDraft(null);
            }}
          >
            Cancel
          </button>
        </div>
        {existing && (
          <button
            type="button"
            className="mt-2 min-h-[44px] w-full text-sm text-gray-500 active:text-danger"
            onClick={() => {
              setPendingDelete(existing);
              setEditing(null);
              setDraft(null);
            }}
          >
            Delete goal
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Goals" subtitle="What your training is for. The weekly plan follows these." />
      <div className="space-y-6 px-4">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-gray-400">This week</p>
          <p className="text-base font-semibold text-ink">{data.block.summary}</p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Races</h2>
          {races.length === 0 && editing !== "new" && <p className="text-sm text-muted">No races ahead.</p>}
          {races.map(card)}
          {editing === "new" && draft?.kind === "race" ? (
            renderEditor()
          ) : (
            <button type="button" className="btn-secondary min-h-[44px] w-full text-sm" onClick={() => startNew("race")}>
              + Add a race
            </button>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Focus</h2>
          <p className="text-xs text-muted">What training is about between races. The latest one that has started applies.</p>
          {focuses.map(card)}
          {editing === "new" && draft?.kind === "focus" ? (
            renderEditor()
          ) : (
            <button type="button" className="btn-secondary min-h-[44px] w-full text-sm" onClick={() => startNew("focus")}>
              + Add a focus
            </button>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Running zones</h2>
          {data.zones && <PaceZonesCard zones={data.zones} />}
        </section>

        {past.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Past</h2>
            {past.map(card)}
          </section>
        )}
      </div>

      {pendingDelete && (
        <UndoToast
          label={`Deleted ${pendingDelete.title}`}
          onUndo={() => setPendingDelete(null)}
          onExpire={async () => {
            const g = pendingDelete;
            await fetch(`/api/goals/${g.id}`, { method: "DELETE" });
            setPendingDelete(null);
            await load();
            notifyDataChanged();
          }}
        />
      )}
    </div>
  );
}
