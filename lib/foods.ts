import type { MealItem } from "@/lib/types";

// ── Tom's food library ────────────────────────────────────────────────
//
// The model doesn't learn from corrections, so the app does. Every item
// Tom fixes when he edits a meal is saved here with the numbers for the
// amount he eats it in, and each edit is kept as a before/after
// correction. The meal parser is shown both on every log (lib/mealContext.ts)
// and told to use these numbers over its own guesses — so a bagel once
// mistaken for two donuts is read right the next time. Pure helpers here;
// the database writes are in the meal routes.

export interface Food {
  key: string;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  source: "edit" | "seed" | "manual";
  times_corrected: number;
  updated_at?: string;
}

export interface MealCorrection {
  before: { summary?: string | null; items?: Partial<MealItem>[] };
  after: { summary?: string | null; items?: Partial<MealItem>[] };
  created_at?: string;
}

/**
 * One key per food: lower case, no punctuation, and the portion notes
 * that vary meal to meal dropped — "(x2)", "(half)", "(~1.5 tbsp)" — so
 * "Honey butter (~1.5 tbsp)" and "honey butter" are the same food.
 */
export function foodKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const n = (v: number | null | undefined) => (v == null ? null : Math.round(Number(v) * 10) / 10);

/** An item changed if its name or any number moved — those are what Tom corrected. */
export function changedItems(before: MealItem[], after: MealItem[]): MealItem[] {
  const same = (a: MealItem, b: MealItem) =>
    foodKey(a.name) === foodKey(b.name) &&
    n(a.calories_est) === n(b.calories_est) &&
    n(a.protein_g) === n(b.protein_g) &&
    n(a.carbs_g) === n(b.carbs_g) &&
    n(a.fat_g) === n(b.fat_g);
  return after.filter((item) => item.name.trim() && !before.some((b) => same(b, item)));
}

export function foodFromItem(item: MealItem, existing?: Food | null): Food {
  return {
    key: foodKey(item.name),
    name: item.name.trim(),
    calories: n(item.calories_est),
    protein_g: n(item.protein_g),
    carbs_g: n(item.carbs_g),
    fat_g: n(item.fat_g),
    source: "edit",
    times_corrected: (existing?.times_corrected ?? 0) + 1,
  };
}

const macro = (v: number | null, unit = "") => (v == null ? "?" : `${Math.round(v * 10) / 10}${unit}`);

/** The library as the parser sees it, one food per line. */
export function foodLines(foods: Food[], limit = 80): string[] {
  return foods
    .slice(0, limit)
    .map((f) => `- ${f.name}: ${macro(f.calories)} cal, ${macro(f.protein_g, "g")} protein, ${macro(f.carbs_g, "g")} carbs, ${macro(f.fat_g, "g")} fat`);
}

/** Recent corrections, newest first: what was logged and what it really was. */
export function correctionLines(corrections: MealCorrection[], limit = 8): string[] {
  const list = (items?: Partial<MealItem>[]) =>
    (items ?? []).map((i) => `${i.name}${i.calories_est != null ? ` ${i.calories_est} cal` : ""}`).join(", ");
  return corrections.slice(0, limit).map((c) => {
    const was = c.before.summary || list(c.before.items);
    const is = c.after.summary || list(c.after.items);
    return `- Logged as "${was}" → actually "${is}"${c.after.items?.length ? ` (${list(c.after.items)})` : ""}`;
  });
}

/** Totals are the items added up, so an edit never leaves the meal and its breakdown disagreeing. */
export function totalsOf(items: MealItem[]) {
  const sum = (k: keyof Omit<MealItem, "name">) => {
    const vals = items.map((i) => i[k]).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10 : null;
  };
  const cal = sum("calories_est");
  return { calories: cal == null ? null : Math.round(cal), protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g") };
}
