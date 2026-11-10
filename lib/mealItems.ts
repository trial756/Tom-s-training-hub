import type { ParsedMeal } from "@/lib/anthropic";

/**
 * Items must add up to the meal. When they're off by more than 15% (a
 * per-cookie item under a four-cookie total), the items are scaled to the
 * totals so the breakdown and the meal agree.
 */
export function reconcileItems(p: ParsedMeal): ParsedMeal {
  const sum = (p.items ?? []).reduce((s, i) => s + (i.calories_est ?? 0), 0);
  if (!p.calories || !sum || Math.abs(sum - p.calories) / p.calories <= 0.15) return p;
  const k = p.calories / sum;
  const r = (v: number | null, d = 1) => (v == null ? null : Math.round(v * k * 10 ** d) / 10 ** d);
  return {
    ...p,
    items: p.items.map((i) => ({ ...i, calories_est: r(i.calories_est, 0), protein_g: r(i.protein_g), carbs_g: r(i.carbs_g), fat_g: r(i.fat_g) })),
  };
}
