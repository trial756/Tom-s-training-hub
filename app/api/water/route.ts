import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { localDateKey } from "@/lib/format";
import { loadWaterDay, loadWaterHistory } from "@/lib/waterStore";
import { parseOz } from "@/lib/water";
import { readClientId } from "@/lib/clientId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's water (or ?day=), with the target; ?history=1 adds the last 14 days. */
export async function GET(req: NextRequest) {
  const today = localDateKey(new Date());
  const day = req.nextUrl.searchParams.get("day") ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "bad day" }, { status: 400 });
  const [water, history] = await Promise.all([
    loadWaterDay(day),
    req.nextUrl.searchParams.get("history") === "1" ? loadWaterHistory(today) : null,
  ]);
  return NextResponse.json({ ...water, ...(history ? { history } : {}) });
}

/** One drink. A retried offline log with the same client_id isn't counted twice. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const oz = parseOz(String(body?.oz ?? ""));
  if (oz == null) return NextResponse.json({ error: "oz must be 1–200" }, { status: 400 });
  const clientId = readClientId(body);
  const loggedAt = typeof body?.logged_at === "string" && !Number.isNaN(Date.parse(body.logged_at)) ? body.logged_at : new Date().toISOString();
  const db = supabaseAdmin();
  if (clientId) {
    const { data: already } = await db.from("water_logs").select("*").eq("client_id", clientId).maybeSingle();
    if (already) return NextResponse.json({ entry: already });
  }
  const { data, error } = await db.from("water_logs").insert({ oz, logged_at: loggedAt, client_id: clientId }).select().single();
  if (error?.code === "23505") return NextResponse.json({ ok: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data }, { status: 201 });
}
