// Static 27-week marathon training plan.
// Race day: Sunday, December 13, 2026 · Goal: 3:30:00 · Goal pace: 8:01 /mi

export const RACE_DATE = "2026-12-13";
export const GOAL_TIME = "3:30:00";
export const GOAL_PACE_SECONDS_PER_MILE = 8 * 60 + 1; // 8:01/mi
export const BODYWEIGHT_LB = 160;

export type PlanPhase = "Base Building" | "Stamina" | "Peak" | "Taper";

export interface PlanWeek {
  weekNumber: number; // 1-27
  phase: PlanPhase;
  startDate: string; // ISO date, Sunday
  endDate: string; // ISO date, Saturday
  weeklyMileage: number;
  longRunMiles: number;
  keyWorkout: string; // this week's focus sentence
  isRecoveryWeek: boolean;
  isRaceWeek: boolean;
  notes: string;
}

// [weeklyMileage, longRunMiles, isRecoveryWeek] — ranges follow the spec's
// phase table (Base Building 25-35, Stamina 35-45, Peak 45-50, Taper 20-30
// mi/wk); recovery/transition weeks intentionally dip below the phase range,
// which is normal cut-back design, not a data error.
const WEEK_TARGETS: [number, number, boolean][] = [
  [25, 8, false], // 1
  [27, 9, false], // 2
  [29, 10, false], // 3
  [24, 8, true], // 4 recovery
  [31, 11, false], // 5
  [33, 12, false], // 6
  [35, 13, false], // 7
  [28, 10, true], // 8 recovery
  [37, 14, false], // 9
  [39, 15, false], // 10
  [41, 16, false], // 11
  [32, 12, true], // 12 recovery
  [43, 17, false], // 13
  [45, 18, false], // 14
  [45, 19, false], // 15
  [36, 14, true], // 16 recovery
  [47, 20, false], // 17
  [48, 20, false], // 18
  [50, 21, false], // 19
  [38, 15, true], // 20 recovery
  [50, 22, false], // 21 peak long run
  [46, 18, false], // 22
  [38, 16, false], // 23 taper begins
  [30, 13, false], // 24
  [24, 10, false], // 25
  [18, 8, false], // 26
  [12, 3, false], // 27 race week
];

function phaseFor(week: number): PlanPhase {
  if (week >= 23) return "Taper";
  if (week >= 17) return "Peak";
  if (week >= 9) return "Stamina";
  return "Base Building";
}

function keyWorkoutFor(week: number, phase: PlanPhase, longRun: number, isRecovery: boolean, isRaceWeek: boolean): string {
  if (isRaceWeek) return "Two short shakeout runs (2-3mi easy), then race day — 26.2mi at 8:01/mi goal pace.";
  if (isRecovery) return `Cut-back week — easy mileage only, ${longRun}mi long run at conversational pace to absorb prior loading.`;
  if (phase === "Base Building") return `${longRun}mi long run easy + 4-6 strides; 2 easy runs, 1 rest or cross-train day.`;
  if (phase === "Stamina") return `${longRun}mi long run with last 2-3mi at marathon pace; midweek tempo run (3-5mi @ ~7:20-7:40/mi) or hill repeats.`;
  if (phase === "Peak") return `${longRun}mi long run with 8-14mi at marathon pace (8:01/mi); one workout day (MP intervals or tempo).`;
  return `${longRun}mi long run, easy effort, volume tapering down.`;
}

// Local-date helper (not toISOString() slicing) so week boundaries follow
// the calendar day the plan was authored against, not a UTC rollover.
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeekSunday(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export function buildMarathonPlan(): PlanWeek[] {
  const race = new Date(`${RACE_DATE}T00:00:00`);

  // Training weeks run Sunday–Saturday. Week 27 is the final full Sun-Sat
  // week ending the day before race day; race day itself (whatever weekday
  // it falls on) is shown separately via the countdown and Race Day Game
  // Plan rather than forced into the grid.
  const dayBeforeRace = new Date(race);
  dayBeforeRace.setDate(dayBeforeRace.getDate() - 1);
  const week27Start = startOfWeekSunday(dayBeforeRace);

  const weeks: PlanWeek[] = [];

  for (let i = 0; i < 27; i++) {
    const weekNumber = i + 1;
    const weeksFromEnd = 26 - i; // 26 .. 0
    const startDate = new Date(week27Start);
    startDate.setDate(startDate.getDate() - weeksFromEnd * 7);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const [weeklyMileage, longRunMiles, isRecoveryWeek] = WEEK_TARGETS[i];
    const phase = phaseFor(weekNumber);
    const isRaceWeek = weekNumber === 27;

    weeks.push({
      weekNumber,
      phase,
      startDate: fmtDate(startDate),
      endDate: fmtDate(endDate),
      weeklyMileage,
      longRunMiles,
      keyWorkout: keyWorkoutFor(weekNumber, phase, longRunMiles, isRecoveryWeek, isRaceWeek),
      isRecoveryWeek,
      isRaceWeek,
      notes: isRaceWeek
        ? "Race day is the Sunday right after this week — trust the training, stick to goal pace through 20mi, then hold on."
        : isRecoveryWeek
        ? "Recovery week — this is when adaptation happens. Don't skip it."
        : "",
    });
  }

  return weeks;
}

export interface PlanPhaseSummary {
  phase: PlanPhase;
  weekRange: string;
  weekCount: number;
  focus: string;
  mileageRange: string;
  weeks: PlanWeek[];
}

const PHASE_FOCUS: Record<PlanPhase, string> = {
  "Base Building": "Easy aerobic running, zone 2 effort, establishing a consistent weekly routine.",
  Stamina: "Lactate threshold work, marathon-pace runs, and longer long runs.",
  Peak: "Race simulation, tune-up efforts, and the peak long runs of the block.",
  Taper: "Reduce volume while maintaining sharpness — arrive at the start line fresh.",
};

export function phaseSummaries(weeks: PlanWeek[]): PlanPhaseSummary[] {
  const order: PlanPhase[] = ["Base Building", "Stamina", "Peak", "Taper"];

  return order.map((phase) => {
    const inPhase = weeks.filter((w) => w.phase === phase);
    const miles = inPhase.map((w) => w.weeklyMileage);
    return {
      phase,
      weekRange: `Week ${inPhase[0]?.weekNumber} – ${inPhase[inPhase.length - 1]?.weekNumber}`,
      weekCount: inPhase.length,
      focus: PHASE_FOCUS[phase],
      mileageRange: miles.length ? `${Math.min(...miles)}-${Math.max(...miles)} mi/wk` : "",
      weeks: inPhase,
    };
  });
}

export function currentWeek(weeks: PlanWeek[]): PlanWeek | null {
  const today = fmtDate(new Date());
  return weeks.find((w) => today >= w.startDate && today <= w.endDate) ?? null;
}

// A short, contextual coaching tip for a given week, keyword-matched off its
// focus text — recovery weeks, 20-milers, tempo/marathon-pace work, taper,
// race day, and strides each get distinct guidance.
export function coachingTipFor(week: PlanWeek): string {
  const text = week.keyWorkout.toLowerCase();
  if (week.isRaceWeek) return "Race day. Trust the taper — you're ready. Stick to goal pace through mile 20, then hold on and dig in.";
  if (week.isRecoveryWeek) return "Recovery week — resist the urge to push. This is when your body actually adapts to the prior weeks' loading.";
  if (week.longRunMiles >= 20) return "20-miler territory — treat this as a dress rehearsal: practice your exact race-day fueling, gear, and pacing plan.";
  if (text.includes("marathon pace")) return "Marathon-pace segments — practice hitting 8:01/mi by feel, not just by watch, so it's automatic on race day.";
  if (text.includes("tempo")) return "Tempo work — hold a controlled-hard effort you could sustain for about an hour, not an all-out race pace.";
  if (week.phase === "Taper") return "Taper — less volume, same intensity. Trust the fitness you've already built; you can't gain more now, only lose freshness.";
  if (text.includes("stride")) return "Strides — short, relaxed accelerations to sharpen turnover and running economy, not sprints.";
  return "Steady build — consistency matters more than any single session this week.";
}

export interface PaceTarget {
  zone: string;
  pace: string;
  purpose: string;
}

export const PACE_TARGETS: PaceTarget[] = [
  { zone: "Easy / Recovery", pace: "9:30–10:30/mi", purpose: "~80% of runs" },
  { zone: "Long Run", pace: "9:00–9:30/mi", purpose: "Weekly long run" },
  { zone: "Marathon Pace", pace: "8:01/mi", purpose: "MP segments" },
  { zone: "Tempo / LT", pace: "7:20–7:40/mi", purpose: "Threshold work" },
  { zone: "Strides", pace: "6:30–7:00/mi", purpose: "2–3× weekly" },
];

export const RACE_DAY_PLAN: { segment: string; plan: string }[] = [
  { segment: "Mi 1–6", plan: "Conservative, 8:10–8:15/mi" },
  { segment: "Mi 7–13", plan: "Settle into 8:01 goal pace" },
  { segment: "Mi 14–18", plan: "Discipline — check in every 2mi, fuel every 45min" },
  { segment: "Mi 19–22", plan: "“The race begins” — shorten stride if things get tight" },
  { segment: "Mi 23–26.2", plan: "Dig in, pick it up if possible" },
];

export const FUELING_STRATEGY: { when: string; plan: string }[] = [
  { when: "Pre-race (2hr out)", plan: "200–300 cal of familiar food" },
  { when: "Mi 6–22", plan: "Gel/chew every ~45min, ~60g carbs/hr" },
  { when: "Mi 22–finish", plan: "Sip sports drink, trust glycogen stores" },
  { when: "Post-race", plan: "Chocolate milk + banana within 30min, 20–30g protein within 2hr" },
];
