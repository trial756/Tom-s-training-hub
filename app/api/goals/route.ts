import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { blockForWeek, nextRace } from "@/lib/goals";
import { loadGoals, sanitizeGoal } from "@/lib/goalsStore";
import { localDateKey, startOfWeekSunday } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every goal, plus what this week is for and the next race, for the Goals tab and the countdown. */
export async function GET() {
  const goals = await loadGoals({ all: true });
  const today = localDateKey(new Date());
  const block = blockForWeek(goals, localDateKey(startOfWeekSunday(new Date())), today);
  return NextResponse.json({
    goals,
    nextRace: nextRace(goals, today),
    block: { kind: block.kind, summary: block.summary, goalId: block.goal?.id ?? null, race: block.race },
  });
}

export async function POST(req: NextRequest) {
  const parsed = sanitizeGoal(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("goals").insert(parsed.goal).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goal: data }, { status: 201 });
}
