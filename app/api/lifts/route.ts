import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { liftTrends } from "@/lib/planner/progression";
import { BODYWEIGHT_LB } from "@/lib/marathonPlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every lift with two or more loaded sessions: e1RM trend, status, best and last set. */
export async function GET() {
  const db = supabaseAdmin();
  const [workouts, weight] = await Promise.all([
    db.from("workouts").select("logged_at, exercises").order("logged_at"),
    db.from("weigh_ins").select("weight_lb").order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (workouts.error) return NextResponse.json({ error: workouts.error.message }, { status: 500 });
  const bodyweight = weight.data?.weight_lb != null ? Number(weight.data.weight_lb) : BODYWEIGHT_LB;

  const lifts = Array.from(liftTrends(workouts.data ?? []).values())
    .filter((t) => t.sessions.length >= 2 && t.pattern !== "mobility" && t.pattern !== "core")
    .sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? ""))
    .map((t) => ({
      name: t.name,
      pattern: t.pattern,
      status: t.status,
      sessions: t.sessions.length,
      best: t.best && { set: t.best.bestSet, e1rm: t.best.e1rm, date: t.best.date },
      last: t.last && { set: t.last.bestSet, e1rm: t.last.e1rm, date: t.last.date },
      points: t.sessions.map((s) => ({ date: s.date, e1rm: s.e1rm })),
    }));
  return NextResponse.json({ bodyweight, lifts });
}
