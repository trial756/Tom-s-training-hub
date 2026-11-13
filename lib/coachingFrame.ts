import { localDateKey, startOfWeekSunday } from "@/lib/format";
import { blockForWeek, goalPaceSeconds, nextRace, type Goal } from "@/lib/goals";

// ── What the coaching is for, from the goals ─────────────────────────
//
// Run coaching and the periodic review used to say "3:30 marathon, 8:01/mi"
// in the prompt itself, so the day after Dallas every easy run would still
// have been judged against marathon pace. The frame now comes from the goal
// behind the current week (lib/goals.ts), like the planner's.

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

export interface CoachingFrame {
  /** Who the coach is and what the athlete is training for — the opening of a system prompt. */
  intro: string;
  /** How to judge a run's pace this week. */
  pace: string;
  /** Seconds per mile, only while a race with a goal time is being trained for. */
  goalPace: number | null;
}

export function coachingFrameFor(goals: Goal[], today: Date = new Date()): CoachingFrame {
  const todayKey = localDateKey(today);
  const block = blockForWeek(goals, localDateKey(startOfWeekSunday(today)), todayKey);
  const g = block.goal;
  const next = nextRace(goals, todayKey);
  const alsoRacing =
    next && next.id !== g?.id ? ` They are also entered in ${next.title} on ${next.date}${next.priority === "C" ? ", for fun" : ""}.` : "";

  if (block.kind === "race" && g) {
    const pace = goalPaceSeconds(g);
    const goal = g.target_seconds && pace ? ` in ${clock(g.target_seconds)} (goal pace ${clock(pace)}/mi)` : "";
    return {
      intro: `You are a running coach. The athlete is training for ${g.title} (${g.distance_mi ?? "?"} mi, ${g.date})${goal}; this is ${block.summary}.`,
      pace: pace
        ? `Judge pace against the ${clock(pace)}/mi goal pace as suits the run type: easy and long runs are meant to be slower than goal pace, and quality runs are judged against their own target zones.`
        : "No goal time is set: judge pace against the run's purpose and the athlete's own recent runs.",
      goalPace: pace,
    };
  }
  if (block.kind === "recovery" && g) {
    return {
      intro: `You are a running coach. The athlete raced ${g.title} on ${g.date} and is recovering: easy running only for now.${alsoRacing}`,
      pace: "There is no pace target during recovery. An easy, relaxed run is exactly right; never compare it with race or goal pace, and say so if it was run too hard.",
      goalPace: null,
    };
  }
  return {
    intro:
      `You are a strength and conditioning coach. The athlete's current goal is "${g?.title ?? "Muscle & athleticism"}"` +
      `${g?.notes ? ` (${g.notes})` : ""}: lifting leads and running is conditioning.${alsoRacing}`,
    pace: "There is no race goal pace right now. Judge a run by its purpose (easy aerobic work, intervals, the long run) and against the athlete's own recent runs, never against an old marathon pace.",
    goalPace: null,
  };
}

/** A finished race's result from the runs logged on race day: the run covering at least 80% of the distance. */
export function raceResult(
  goal: Goal,
  runs: { logged_at: string; distance_miles: number | null; duration_seconds: number | null }[]
): { seconds: number | null; note: string } | null {
  if (goal.kind !== "race" || !goal.distance_mi) return null;
  const run = runs
    .filter((r) => localDateKey(new Date(r.logged_at)) === goal.date && (Number(r.distance_miles) || 0) >= goal.distance_mi! * 0.8)
    .sort((a, b) => (Number(b.distance_miles) || 0) - (Number(a.distance_miles) || 0))[0];
  if (!run) return null;
  const seconds = run.duration_seconds ? Number(run.duration_seconds) : null;
  const pace = seconds ? Math.round(seconds / Number(run.distance_miles)) : null;
  return { seconds, note: seconds ? `Result: ${clock(seconds)} (${clock(pace!)}/mi).` : "Result: finished." };
}
