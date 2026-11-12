import { NextRequest, NextResponse } from "next/server";
import { localDateKey } from "@/lib/format";
import { loadCalorieDay, saveBodyGoal } from "@/lib/caloriesStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's calorie target and what's been eaten (or ?day=). */
export async function GET(req: NextRequest) {
  const day = req.nextUrl.searchParams.get("day") ?? localDateKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "bad day" }, { status: 400 });
  return NextResponse.json(await loadCalorieDay(day));
}

/** Sets the goal weight. */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { goal_lb?: unknown } | null;
  const goal = Number(body?.goal_lb);
  if (!Number.isFinite(goal) || goal < 80 || goal > 400) return NextResponse.json({ error: "goal_lb must be 80–400" }, { status: 400 });
  await saveBodyGoal(Math.round(goal * 2) / 2);
  return NextResponse.json({ ok: true });
}
