import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { COOKIE, cookieOptions, deviceName, newExpiry, signToken } from "@/lib/deviceAuth";

export const runtime = "nodejs";

// Five wrong passcodes in fifteen minutes locks sign-in for fifteen minutes.
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: NextRequest) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return NextResponse.json({ error: "Sign-in isn't set up yet." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: state } = await db.from("sync_state").select("value").eq("key", "auth_failures").maybeSingle();
  const now = Date.now();
  const fails = ((state?.value as { times?: number[] } | null)?.times ?? []).filter((t) => now - t < WINDOW_MS);
  if (fails.length >= MAX_FAILS) {
    const wait = Math.ceil((WINDOW_MS - (now - fails[0])) / 60000);
    return NextResponse.json({ error: `Too many tries. Try again in ${wait} min.` }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const given = typeof body.passcode === "string" ? body.passcode.trim() : "";
  const trusted = body.trust !== false;
  if (!given || !timingSafeEqual(digest(given), digest(passcode.trim()))) {
    await db.from("sync_state").upsert({ key: "auth_failures", value: { times: [...fails, now] }, updated_at: new Date().toISOString() });
    return NextResponse.json({ error: "That passcode didn't match." }, { status: 401 });
  }

  const { data: device, error } = await db
    .from("trusted_devices")
    .insert({ name: deviceName(req.headers.get("user-agent")), trusted })
    .select("id")
    .single();
  if (error || !device) return NextResponse.json({ error: error?.message ?? "Couldn't save this device." }, { status: 500 });
  if (fails.length) await db.from("sync_state").upsert({ key: "auth_failures", value: { times: [] }, updated_at: new Date().toISOString() });

  const token = await signToken({ deviceId: device.id, exp: newExpiry(trusted), trusted });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, cookieOptions(trusted));
  return res;
}
