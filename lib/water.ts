// ── Water ─────────────────────────────────────────────────────────────
//
// One tap per drink (12 / 20 / 30 oz, or any amount). The day's target
// moves with the day: half an ounce per pound of bodyweight as the base,
// about 16 oz per hour of running, 8 oz per lift, and more in the heat.
// A single reminder at 5pm fires only when the day is behind. Pure helpers;
// the database side is lib/waterStore.ts.

export const QUICK_OZ = [12, 20, 30] as const;

export interface WaterTargetInput {
  bodyweightLb: number;
  /** Minutes run today — logged, or planned if not yet run. */
  runMinutes: number;
  liftSessions: number;
  /** Hottest run temperature today, °F, when known. */
  maxTempF: number | null;
}

export interface WaterTarget {
  oz: number;
  parts: { label: string; oz: number }[];
}

const round4 = (n: number) => Math.round(n / 4) * 4;

export function waterTarget(i: WaterTargetInput): WaterTarget {
  const parts: { label: string; oz: number }[] = [];
  parts.push({ label: `Base (${Math.round(i.bodyweightLb)} lb)`, oz: Math.round(i.bodyweightLb * 0.5) });
  if (i.runMinutes > 0) parts.push({ label: `Running (${Math.round(i.runMinutes)} min)`, oz: Math.round(i.runMinutes * (16 / 60)) });
  if (i.liftSessions > 0) parts.push({ label: i.liftSessions === 1 ? "Lift" : `Lifts (${i.liftSessions})`, oz: 8 * i.liftSessions });
  if (i.maxTempF != null && i.maxTempF >= 80) parts.push({ label: `Heat (${Math.round(i.maxTempF)}°F)`, oz: i.maxTempF >= 90 ? 24 : 16 });
  return { oz: round4(parts.reduce((s, p) => s + p.oz, 0)), parts };
}

/**
 * Behind at 5pm: under 60% of the day's target. Most of a day's drinking
 * is done by then (about two-thirds of waking hours), with some slack.
 */
export const REMINDER_SHARE = 0.6;
export function behindAt5pm(totalOz: number, targetOz: number): boolean {
  return targetOz > 0 && totalOz < targetOz * REMINDER_SHARE;
}

/** A typed amount: whole or half ounces, 1–200. */
export function parseOz(text: string): number | null {
  const n = Number(text.trim());
  if (!Number.isFinite(n) || n <= 0 || n > 200) return null;
  return Math.round(n * 2) / 2;
}
