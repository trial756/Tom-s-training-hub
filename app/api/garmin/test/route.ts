import { NextResponse } from "next/server";
import { GarminError, garminToken, getActivity, searchActivities } from "@/lib/garmin";
import { localDateKey, shiftDays } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Field names (and nested ones, one level down) — the shape, not the data. */
function shape(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = "object";
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        out[`${k}.${k2}`] = Array.isArray(v2) ? `array(${v2.length})` : typeof v2;
      }
    } else {
      out[k] = Array.isArray(v) ? `array(${v.length})` : typeof v;
    }
  }
  return out;
}

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (o[k] != null) return o[k];
  return null;
};

/**
 * Connection check for the Garmin Personal API. Reports whether the key works
 * and the shape of an activity (field names, no values). Never returns the
 * key, the token or any activity data.
 */
export async function GET() {
  const steps: Record<string, unknown> = {};
  try {
    const token = await garminToken(true);
    steps.token = {
      ok: true,
      isJwt: token.accessToken.split(".").length === 3,
      expiresAt: token.expiresAt ? new Date(token.expiresAt * 1000).toISOString() : null,
    };

    const list = await searchActivities({
      limit: 5,
      startDate: localDateKey(shiftDays(new Date(), -30)),
      endDate: localDateKey(new Date()),
    });
    const items = (Array.isArray(list) ? list : ((list as { activityList?: unknown[] })?.activityList ?? [])) as Record<string, unknown>[];
    steps.activities = {
      ok: true,
      responseType: Array.isArray(list) ? "array" : typeof list,
      responseKeys: Array.isArray(list) ? null : Object.keys((list as object) ?? {}),
      count: items.length,
      // Field names and types only — no values — so the page reveals nothing
      // about the athlete even though it is reachable without a login.
      fields: items[0] ? shape(items[0]) : null,
    };

    const id = items[0] ? pick(items[0], ["activityId", "id", "activityID"]) : null;
    if (id != null) {
      const detail = await getActivity(String(id));
      steps.detail = { ok: true, fields: shape(detail) };
    }
    return NextResponse.json({ ok: true, ...steps });
  } catch (err) {
    const e = err instanceof GarminError ? err : null;
    return NextResponse.json(
      {
        ok: false,
        ...steps,
        error: err instanceof Error ? err.message : String(err),
        code: e?.code ?? "unexpected",
        status: e?.status ?? null,
        detail: e?.detail ?? null,
      },
      { status: 200 }
    );
  }
}
