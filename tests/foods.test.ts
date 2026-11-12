import { test } from "node:test";
import assert from "node:assert/strict";
import { changedItems, correctionLines, foodFromItem, foodKey, foodLines, totalsOf } from "../lib/foods";
import type { MealItem } from "../lib/types";

const item = (name: string, cal: number, p = 0, c = 0, f = 0): MealItem => ({ name, calories_est: cal, protein_g: p, carbs_g: c, fat_g: f });

test("one key per food, whatever the portion note or punctuation", () => {
  assert.equal(foodKey("Dave's Killer Bread Cinnamon Raisin Remix bagel"), "daves killer bread cinnamon raisin remix bagel");
  assert.equal(foodKey("Honey butter (~1.5 tbsp)"), foodKey("honey butter"));
  assert.equal(foodKey("Chick-fil-A Chicken Biscuit (half)"), "chick fil a chicken biscuit");
});

// Nov 12 2026: a sliced bagel logged as two donuts.
test("only what was corrected is learned, not the AI's untouched guesses", () => {
  const before = [item("Glazed Crumb Donut (x2)", 680, 8, 96, 28), item("Coffee with creamer (1 cup)", 40, 0.5, 6, 1.5)];
  const after = [
    item("Dave's Killer Bread Cinnamon Raisin Remix bagel", 260, 11, 51, 3),
    item("Honey butter (~1.5 tbsp)", 135, 0, 9, 12),
    item("Coffee with creamer (1 cup)", 40, 0.5, 6, 1.5),
  ];
  const learned = changedItems(before, after).map((i) => i.name);
  assert.deepEqual(learned, ["Dave's Killer Bread Cinnamon Raisin Remix bagel", "Honey butter (~1.5 tbsp)"]);
  // A changed number on the same food counts as a correction.
  assert.equal(changedItems([item("Coffee with creamer", 40)], [item("Coffee with creamer", 70)]).length, 1);
});

test("library entries count corrections, and read cleanly for the parser", () => {
  const food = foodFromItem(item("Honey butter (~1.5 tbsp)", 135, 0, 9, 12), { key: "honey butter", name: "Honey butter", calories: 100, protein_g: 0, carbs_g: 7, fat_g: 9, source: "seed", times_corrected: 1 });
  assert.equal(food.key, "honey butter");
  assert.equal(food.times_corrected, 2);
  assert.deepEqual(foodLines([food]), ["- Honey butter (~1.5 tbsp): 135 cal, 0g protein, 9g carbs, 12g fat"]);
  const lines = correctionLines([
    { before: { summary: "2 glazed crumb donuts" }, after: { summary: "One sliced bagel with honey butter", items: [{ name: "Bagel", calories_est: 260 }] } },
  ]);
  assert.equal(lines[0], '- Logged as "2 glazed crumb donuts" → actually "One sliced bagel with honey butter" (Bagel 260 cal)');
});

test("an edited meal's totals are its items added up", () => {
  assert.deepEqual(totalsOf([item("Bagel", 260, 11, 51, 3), item("Honey", 64, 0, 17, 0), { name: "Water", calories_est: null, protein_g: null, carbs_g: null, fat_g: null }]), {
    calories: 324,
    protein_g: 11,
    carbs_g: 68,
    fat_g: 3,
  });
});
