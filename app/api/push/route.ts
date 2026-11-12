import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { vapidKeys } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The public key a phone needs to subscribe. */
export async function GET() {
  const { publicKey } = await vapidKeys();
  return NextResponse.json({ publicKey });
}

/** Saves this phone's subscription. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof body?.endpoint === "string" && body.endpoint.startsWith("https://") ? body.endpoint : null;
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : null;
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : null;
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  const { error } = await supabaseAdmin().from("push_subscriptions").upsert({ endpoint, p256dh, auth }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Turns reminders off for this phone. */
export async function DELETE(req: NextRequest) {
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
  await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
