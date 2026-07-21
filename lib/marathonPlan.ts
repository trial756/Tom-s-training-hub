// Static 27-week marathon training plan.
// Race day: Saturday, December 13, 2026 · Goal: 3:30:00 · Goal pace: 8:01 /mi

export const RACE_DATE = "2026-12-13";
export const GOAL_TIME = "3:30:00";
export const GOAL_PACE_SECONDS_PER_MILE = 8 * 60 + 1; // 8:01/mi

export type PlanPhase = "Base" | "Build" | "Peak" | "Taper" | "Race Week";

export interface PlanWeek {
  weekNumber: number; // 1-27
  phase: PlanPhase;
  startDate: string; // ISO date, Monday
  endDate: string; // ISO date, Sunday
  weeklyMileage: number;
  longRunMiles: number;
  keyWorkout: string;
  isRecoveryWeek: boolean;
  notes: string;
}

// [weeklyMileage, longRunMiles, isRecoveryWeek]
const WEEK_TARGETS: [number, number, boolean][] = [
  [20, 8, false], // 1
  [22, 9, false], // 2
  [24, 10, false], // 3
  [20, 8, true], // 4 recovery
  [26, 11, false], // 5
  [28, 12, false], // 6
  [30, 13, false], // 7
  [24, 10, true], // 8 recovery
  [32, 14, false], // 9
  [34, 15, false], // 10
  [36, 16, false], // 11
  [28, 12, true], // 12 recovery
  [38, 17, false], // 13
  [40, 18, false], // 14
  [42, 19, false], // 15
  [32, 14, true], // 16 recovery
  [44, 20, false], // 17
  [46, 20, false], // 18
  [48, 21, false], // 19
  [36, 14, true], // 20 recovery
  [48, 22, false], // 21 peak long run
  [44, 18, false], // 22
  [46, 20, false], // 23
  [34, 14, false], // 24 taper begins
  [26, 10, false], // 25
  [18, 8, false], // 26
  [12, 3, false], // 27 race week
];

function phaseFor(week: number, isRecovery: boolean): PlanPhase {
  if (week === 27) return "Race Week";
  if (week >= 24) return "Taper";
  if (week >= 15) return "Peak";
  if (week >= 7) return "Build";
  return "Base";
}

function keyWorkoutFor(week: number, phase: PlanPhase, longRun: number, isRecovery: boolean): string {
  if (phase === "Race Week") return "Two short shakeout runs (2-3mi easy), then race day — 26.2mi at 8:01/mi goal pace.";
  if (isRecovery) return `Cut-back week — easy mileage only, ${longRun}mi long run at conversational pace to absorb prior loading.`;
  if (phase === "Base") return `${longRun}mi long run easy + 4-6 strides; 2 easy runs, 1 rest or cross-train day.`;
  if (phase === "Build") return `${longRun}mi long run with last 2-3mi at marathon pace; midweek tempo run (3-5mi @ ~7:40-7:50/mi) or hill repeats.`;
  if (phase === "Peak") return `${longRun}mi long run with 8-14mi at marathon pace (8:01/mi); one workout day (MP intervals or tempo).`;
  return `${longRun}mi long run, easy effort, volume tapering down.`;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildMarathonPlan(): PlanWeek[] {
  const race = new Date(`${RACE_DATE}T00:00:00`);

  // Race week (week 27) ends on race day. Walk backward 27 weeks in 7-day blocks.
  const raceWeekEnd = race;
  const weeks: PlanWeek[] = [];

  for (let i = 0; i < 27; i++) {
    const weekNumber = i + 1;
    const weeksFromEnd = 27 - weekNumber; // 26 .. 0
    const endDate = new Date(raceWeekEnd);
    endDate.setDate(endDate.getDate() - weeksFromEnd * 7);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);

    const [weeklyMileage, longRunMiles, isRecoveryWeek] = WEEK_TARGETS[i];
    const phase = phaseFor(weekNumber, isRecoveryWeek);

    weeks.push({
      weekNumber,
      phase,
      startDate: fmtDate(startDate),
      endDate: fmtDate(endDate),
      weeklyMileage,
      longRunMiles,
      keyWorkout: keyWorkoutFor(weekNumber, phase, longRunMiles, isRecoveryWeek),
      isRecoveryWeek,
      notes:
        phase === "Race Week"
          ? "Race day! Trust the training, stick to goal pace through 20mi, then hold on."
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
}

export function phaseSummaries(weeks: PlanWeek[]): PlanPhaseSummary[] {
  const order: PlanPhase[] = ["Base", "Build", "Peak", "Taper", "Race Week"];
  const focus: Record<PlanPhase, string> = {
    Base: "Build aerobic base and weekly running consistency. Mostly easy miles + strides.",
    Build: "Introduce tempo runs, hill repeats, and marathon-pace segments inside the long run.",
    Peak: "Highest weekly mileage. Long runs include 8-14mi at goal marathon pace (8:01/mi).",
    Taper: "Cut volume 20-40% while keeping some intensity — arrive at the start line fresh.",
    "Race Week": "Shakeouts only, carb-load, then race: 26.2mi at 8:01/mi for a 3:30 finish.",
  };

  return order.map((phase) => {
    const inPhase = weeks.filter((w) => w.phase === phase);
    const miles = inPhase.map((w) => w.weeklyMileage);
    return {
      phase,
      weekRange: `Week ${inPhase[0]?.weekNumber} – ${inPhase[inPhase.length - 1]?.weekNumber}`,
      weekCount: inPhase.length,
      focus: focus[phase],
      mileageRange: miles.length ? `${Math.min(...miles)}-${Math.max(...miles)} mi/wk` : "",
    };
  });
}

export function currentWeek(weeks: PlanWeek[]): PlanWeek | null {
  const today = fmtDate(new Date());
  return weeks.find((w) => today >= w.startDate && today <= w.endDate) ?? null;
}
