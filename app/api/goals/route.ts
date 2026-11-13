import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { blockForWeek, goalPaceSeconds, nextRace, type Goal } from "@/lib/goals";
import { raceResult } from "@/lib/coachingFrame";
import { loadGoals, sanitizeGoal } from "@/lib/goalsStore";
import { loadPaceZones } from "@/lib/paceZonesStore";
import { localDateKey, startOfWeekSunday } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every goal, plus what this week is for and the next race, for the Goals tab and the countdown. */
export async function GET(req: NextRequest) {
  // The Goals tab also wants today's pace zones; the countdown doesn't.
  const wantZones = req.nextUrl.searchParams.get("zones") === "1";
  const [loaded, zones] = await Promise.all([loadGoals({ all: true }), wantZones ? loadPaceZones() : null]);
  const today = localDateKey(new Date());
  const goals = await settleRaces(loaded, today);
  const block = blockForWeek(goals, localDateKey(startOfWeekSunday(new Date())), today);
  return NextResponse.json({
    goals,
    nextRace: nextRace(goals, today),
    block: { kind: block.kind, summary: block.summary, goalId: block.goal?.id ?? null, race: block.race },
    // Seconds per mile, only while a race with a goal time is being trained for.
    goalPace: block.kind === "race" && block.goal ? goalPaceSeconds(block.goal) : null,
    ...(zones ? { zones } : {}),
  });
}

/**
 * A race whose day has come and has a run logged on it covering the distance
 * is marked done, with the result in its notes — so Tom never has to close a
 * goal by hand. Recovery and the plan don't depend on this.
 */
async function settleRaces(goals: Goal[], today: string): Promise<Goal[]> {
  const due = goals.filter((g) => g.kind === "race" && (g.status ?? "active") === "active" && g.date <= today);
  if (!due.length) return goals;
  const db = supabaseAdmin();
  const out = [...goals];
  for (const g of due) {
    const from = new Date(`${g.date}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(`${g.date}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 2);
    const { data: runs } = await db
      .from("runs")
      .select("logged_at, distance_miles, duration_seconds")
      .gte("logged_at", from.toISOString())
      .lt("logged_at", to.toISOString());
    const result = raceResult(g, runs ?? []);
    if (!result) continue;
    const notes = [g.notes, result.note].filter(Boolean).join(" ");
    const { error } = await db.from("goals").update({ status: "done", notes }).eq("id", g.id);
    if (!error) out[out.indexOf(g)] = { ...g, status: "done", notes };
  }
  return out;
}

export async function POST(req: NextRequest) {
  const parsed = sanitizeGoal(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("goals").insert(parsed.goal).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goal: data }, { status: 201 });
}
