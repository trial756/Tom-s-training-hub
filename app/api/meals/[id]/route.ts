import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { changedItems, foodFromItem, foodKey, totalsOf, type Food } from "@/lib/foods";
import type { MealItem } from "@/lib/types";

export const runtime = "nodejs";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

function readItems(raw: unknown): MealItem[] | null {
  if (!Array.isArray(raw) || raw.length > 30) return null;
  const num = (v: unknown) => {
    if (v === "" || v == null) return null;
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 && x < 10000 ? Math.round(x * 10) / 10 : null;
  };
  const out: MealItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const name = typeof r?.name === "string" ? r.name.trim().slice(0, 120) : "";
    if (!name) continue;
    out.push({ name, calories_est: num(r.calories_est), protein_g: num(r.protein_g), carbs_g: num(r.carbs_g), fat_g: num(r.fat_g) });
  }
  return out;
}

/**
 * Saves a meal exactly as edited — no AI call. Items Tom changed go into
 * his food library and the edit is kept as a correction, so the parser
 * reads those foods right next time (lib/foods.ts).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const items = readItems(body?.items);
  if (!items || !items.length) return NextResponse.json({ error: "A meal needs at least one item." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: before, error: readError } = await db.from("meals").select("*").eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Meal not found." }, { status: 404 });

  const changed = changedItems((before.items ?? []) as MealItem[], items);
  const summary = items.map((i) => i.name).join(", ");
  const update: Record<string, unknown> = { items, ...totalsOf(items), summary };
  if (typeof body?.meal_type === "string" && MEAL_TYPES.includes(body.meal_type)) update.meal_type = body.meal_type;
  if (typeof body?.logged_at === "string" && !Number.isNaN(Date.parse(body.logged_at))) update.logged_at = body.logged_at;
  if (typeof body?.notes === "string") update.notes = body.notes.trim().slice(0, 1000) || null;
  if (changed.length) {
    // The name follows the food, and coaching written about the old numbers no longer fits.
    update.raw_text = summary;
    update.coaching_feedback = null;
  }

  const { data, error } = await db.from("meals").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (changed.length) {
    // Learning is best-effort: a failure here never fails the edit itself.
    try {
      const keys = changed.map((i) => foodKey(i.name)).filter(Boolean);
      const { data: existing } = await db.from("foods").select("*").in("key", keys);
      const byKey = new Map(((existing ?? []) as Food[]).map((f) => [f.key, f]));
      const rows = changed
        .filter((i) => foodKey(i.name))
        .map((i) => ({ ...foodFromItem(i, byKey.get(foodKey(i.name))), updated_at: new Date().toISOString() }));
      if (rows.length) await db.from("foods").upsert(rows, { onConflict: "key" });
      await db.from("meal_corrections").insert({
        meal_id: id,
        before: { summary: before.summary ?? before.raw_text, items: before.items ?? [] },
        after: { summary, items },
      });
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ meal: data, learned: changed.map((i) => i.name) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin().from("meals").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
