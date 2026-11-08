import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { COOKIE, verifyToken } from "@/lib/deviceAuth";

export const runtime = "nodejs";

/** Signs this device out: its row is revoked and its cookie cleared. */
export async function POST(req: NextRequest) {
  const token = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (token) {
    await supabaseAdmin().from("trusted_devices").update({ revoked_at: new Date().toISOString() }).eq("id", token.deviceId);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
