import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileItems } from "../lib/mealItems";
import type { ParsedMeal } from "../lib/anthropic";

const meal = (calories: number, items: ParsedMeal["items"]): ParsedMeal => ({
  meal_type: "snack", calories, protein_g: 6, carbs_g: 84, fat_g: 28, items, notes: "", coaching_feedback: "", summary: "4 cookies",
});

test("a per-unit item under a multi-unit total is scaled to the total", () => {
  const out = reconcileItems(meal(600, [{ name: "Cookie", calories_est: 150, protein_g: 1.5, carbs_g: 21, fat_g: 7 }]));
  assert.deepEqual(out.items[0], { name: "Cookie", calories_est: 600, protein_g: 6, carbs_g: 84, fat_g: 28 });
});

test("items that already add up are left alone", () => {
  const items = [
    { name: "Apple", calories_est: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3 },
    { name: "Coffee", calories_est: 50, protein_g: 0.5, carbs_g: 6, fat_g: 2.5 },
  ];
  assert.deepEqual(reconcileItems(meal(150, items)).items, items);
});
