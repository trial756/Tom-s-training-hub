import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { localDateKey, shiftDays, startOfLocalDay } from "@/lib/format";
import { computeReadiness, type CheckIn, type GarminDay, type ReadinessLift, type ReadinessRun } from "@/lib/dailyReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HISTORY_DAYS = 7;

/** Today's readiness, the check-in behind it, and the last week of scores. */
export async function GET() {
  const db = supabaseAdmin();
  const today = startOfLocalDay(new Date());
  const todayKey = localDateKey(today);
  const from = shiftDays(today, -(28 + HISTORY_DAYS));
  const [runs, workouts, checkins, garmin] = await Promise.all([
    db.from("runs").select("logged_at, run_type, duration_seconds, feel, load:garmin_data->trainingLoad").gte("logged_at", from.toISOString()),
    db.from("workouts").select("logged_at, duration_minutes, intensity").gte("logged_at", from.toISOString()),
    db.from("readiness_checkins").select("day, sleep, energy, soreness, note").gte("day", localDateKey(shiftDays(today, -HISTORY_DAYS))),
    db.from("garmin_daily").select("day, bb_high, hrv_last_night, hrv_weekly_avg").gte("day", localDateKey(shiftDays(today, -HISTORY_DAYS))),
  ]);
  const err = runs.error || workouts.error || checkins.error || garmin.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const runRows: ReadinessRun[] = (runs.data ?? []).map((r) => ({
    date: localDateKey(new Date(r.logged_at)),
    type: r.run_type,
    minutes: r.duration_seconds ? r.duration_seconds / 60 : null,
    feel: r.feel,
    garminLoad: typeof r.load === "number" ? r.load : r.load != null ? Number(r.load) || null : null,
  }));
  const liftRows: ReadinessLift[] = (workouts.data ?? []).map((w) => ({
    date: localDateKey(new Date(w.logged_at)),
    minutes: w.duration_minutes,
    intensity: w.intensity,
  }));
  const checkinBy = new Map((checkins.data ?? []).map((c) => [String(c.day).slice(0, 10), c as CheckIn]));
  const garminBy = new Map(
    (garmin.data ?? []).map((g) => [
      String(g.day).slice(0, 10),
      { bbHigh: g.bb_high, hrvLastNight: g.hrv_last_night, hrvWeeklyAvg: g.hrv_weekly_avg } as GarminDay,
    ])
  );
  const forDay = (day: string) =>
    computeReadiness({ today: day, runs: runRows, lifts: liftRows, checkin: checkinBy.get(day) ?? null, garmin: garminBy.get(day) ?? null });

  const history = Array.from({ length: HISTORY_DAYS }, (_, i) => localDateKey(shiftDays(today, i - HISTORY_DAYS + 1))).map((day) => {
    const r = forDay(day);
    return { day, score: r.score, band: r.band, checkedIn: checkinBy.has(day) };
  });

  return NextResponse.json({ today: todayKey, readiness: forDay(todayKey), checkin: checkinBy.get(todayKey) ?? null, history });
}

/** Saves the morning check-in (today unless `day` is given); a second one that day replaces it. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
  const sleep = n(body?.sleep);
  const energy = n(body?.energy);
  const soreness = n(body?.soreness);
  if (sleep == null || energy == null || soreness == null) {
    return NextResponse.json({ error: "sleep, energy and soreness must each be 1–5" }, { status: 400 });
  }
  const day = typeof body?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : localDateKey(new Date());
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  const { error } = await supabaseAdmin()
    .from("readiness_checkins")
    .upsert({ day, sleep, energy, soreness, note, updated_at: new Date().toISOString() }, { onConflict: "day" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
