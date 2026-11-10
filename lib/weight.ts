// ── Bodyweight trend ──────────────────────────────────────────────────
//
// Daily weight swings a few pounds with water and food, so a single
// weigh-in says little. The trend is a time-aware moving average (each day
// moves it 10% of the way toward the scale), and the rate is the slope of
// that trend over the last four weeks. Pure and client-safe.

export interface WeighIn {
  date: string; // YYYY-MM-DD
  weight_lb: number;
  note: string | null;
}

export interface WeightPoint extends WeighIn {
  /** Smoothed weight on this date. */
  trend: number;
}

export interface WeightSummary {
  points: WeightPoint[];
  latest: WeightPoint | null;
  first: WeightPoint | null;
  /** Latest scale weight minus the first logged. */
  changeSinceStart: number | null;
  /** lb per week over the last 28 days of trend; null without two weigh-ins at least a week apart there. */
  ratePerWeek: number | null;
}

const DAY_MS = 86_400_000;
const dayNumber = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / DAY_MS);
const SMOOTHING = 0.9;

export function weightSummary(entries: WeighIn[]): WeightSummary {
  const sorted = entries
    .filter((e) => Number.isFinite(e.weight_lb))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const points: WeightPoint[] = [];
  for (const e of sorted) {
    const prev = points[points.length - 1];
    if (!prev) {
      points.push({ ...e, trend: e.weight_lb });
      continue;
    }
    const gap = Math.max(1, dayNumber(e.date) - dayNumber(prev.date));
    const pull = 1 - Math.pow(SMOOTHING, gap);
    points.push({ ...e, trend: prev.trend + pull * (e.weight_lb - prev.trend) });
  }
  const latest = points[points.length - 1] ?? null;
  const first = points[0] ?? null;

  let ratePerWeek: number | null = null;
  if (latest) {
    const recent = points.filter((p) => dayNumber(latest.date) - dayNumber(p.date) <= 28);
    const span = recent.length ? dayNumber(latest.date) - dayNumber(recent[0].date) : 0;
    if (recent.length >= 2 && span >= 7) {
      // Least-squares slope of the scale weights against day number.
      const xs = recent.map((p) => dayNumber(p.date));
      const ys = recent.map((p) => p.weight_lb);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
      const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
      ratePerWeek = sxx > 0 ? (sxy / sxx) * 7 : null;
    }
  }

  return {
    points,
    latest,
    first,
    changeSinceStart: latest && first && latest !== first ? latest.weight_lb - first.weight_lb : null,
    ratePerWeek,
  };
}

/** Parses typed weight ("158", "158.4", "1584" is not guessed). Null if outside 60–500 lb. */
export function parseWeight(text: string): number | null {
  const n = Number(text.trim());
  if (!Number.isFinite(n) || n < 60 || n > 500) return null;
  return Math.round(n * 10) / 10;
}
