import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { COOKIE, authEnabled, verifyToken } from "@/lib/deviceAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed-in devices, newest activity first; `current` marks the one asking. */
export async function GET(req: NextRequest) {
  const token = await verifyToken(req.cookies.get(COOKIE)?.value);
  const { data, error } = await supabaseAdmin()
    .from("trusted_devices")
    .select("id, name, trusted, created_at, last_seen_at")
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    enabled: authEnabled(),
    devices: (data ?? []).map((d) => ({ ...d, current: d.id === token?.deviceId })),
  });
}

/** Signs another device out (`?id=`). It's locked out within a few minutes. */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which device?" }, { status: 400 });
  const { error } = await supabaseAdmin().from("trusted_devices").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
