import { NextResponse } from "next/server";
import { GarminError, garminGet } from "@/lib/garmin";
import { localDateKey } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Which Garmin Connect data the personal key can read, beyond activities.
 * Reports reachability and field names only — never values — so the answer
 * is safe to look at or paste anywhere.
 */
function shape(body: unknown): string[] {
  const first = Array.isArray(body) ? body[0] : body;
  if (first && typeof first === "object") return Object.keys(first as object).slice(0, 25);
  return [];
}

export async function GET() {
  const today = new Date();
  const d = localDateKey(new Date(today.getTime() - 86400000)); // yesterday: a complete day
  const weekAgo = localDateKey(new Date(today.getTime() - 7 * 86400000));

  let displayName: string | null = null;
  try {
    const profile = (await garminGet("/userprofile-service/socialProfile")) as { displayName?: string } | null;
    displayName = profile?.displayName ?? null;
  } catch {
    /* some endpoints need it; they'll report their own failure */
  }
  const who = displayName ?? "_";

  const probes: Record<string, string> = {
    profile: "/userprofile-service/socialProfile",
    dailySummary: `/usersummary-service/usersummary/daily/${who}?calendarDate=${d}`,
    restingHeartRate: `/userstats-service/wellness/daily/${who}?fromDate=${weekAgo}&untilDate=${d}&metricId=60`,
    heartRateDay: `/wellness-service/wellness/dailyHeartRate/${who}?date=${d}`,
    sleep: `/wellness-service/wellness/dailySleepData/${who}?date=${d}&nonSleepBufferMinutes=60`,
    hrv: `/hrv-service/hrv/${d}`,
    stress: `/wellness-service/wellness/dailyStress/${d}`,
    bodyBattery: `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${weekAgo}&endDate=${d}`,
    vo2max: `/metrics-service/metrics/maxmet/daily/${weekAgo}/${d}`,
    trainingStatus: `/metrics-service/metrics/trainingstatus/aggregated/${d}`,
    trainingReadiness: `/metrics-service/metrics/trainingreadiness/${d}`,
    racePredictions: `/metrics-service/metrics/racepredictions/latest/${who}`,
    enduranceScore: `/metrics-service/metrics/endurancescore?calendarDate=${d}`,
    weight: `/weight-service/weight/dateRange?startDate=${weekAgo}&endDate=${d}`,
    personalRecords: `/personalrecord-service/personalrecord/prs/${who}`,
    lactateThreshold: `/biometric-service/biometric/latestLactateThreshold`,
  };

  const results: Record<string, { ok: boolean; status: number | null; fields?: string[]; empty?: boolean }> = {};
  await Promise.all(
    Object.entries(probes).map(async ([name, path]) => {
      try {
        const body = await garminGet(path);
        const fields = shape(body);
        results[name] = { ok: true, status: 200, fields, empty: body == null || (Array.isArray(body) && body.length === 0) };
      } catch (err) {
        results[name] = { ok: false, status: err instanceof GarminError ? err.status ?? null : null };
      }
    })
  );

  return NextResponse.json({ checkedDay: d, hasDisplayName: !!displayName, results });
}
