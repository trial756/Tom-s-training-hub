import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ── Push notifications ────────────────────────────────────────────────
//
// Standard Web Push. The VAPID key pair is made on first use and kept in
// sync_state (server-only, RLS with no public policies), so there's no
// key to paste into Vercel. Each phone that allows notifications is a
// push_subscriptions row; one that's gone (404/410) is removed on send.

type Vapid = { publicKey: string; privateKey: string };

let cached: Vapid | null = null;

export async function vapidKeys(): Promise<Vapid> {
  if (cached) return cached;
  const db = supabaseAdmin();
  const { data } = await db.from("sync_state").select("value").eq("key", "vapid").maybeSingle();
  const stored = data?.value as Vapid | undefined;
  if (stored?.publicKey && stored?.privateKey) return (cached = stored);
  const fresh = webpush.generateVAPIDKeys();
  // ignoreDuplicates: if two requests race, the first saved pair wins and is re-read.
  await db.from("sync_state").upsert({ key: "vapid", value: fresh, updated_at: new Date().toISOString() }, { onConflict: "key", ignoreDuplicates: true });
  const { data: again } = await db.from("sync_state").select("value").eq("key", "vapid").maybeSingle();
  return (cached = (again?.value as Vapid) ?? fresh);
}

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Sends to every subscribed phone. Returns how many it reached. */
export async function pushToAll(msg: PushMessage): Promise<number> {
  const keys = await vapidKeys();
  const subject = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "mailto:noreply@example.com";
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  const db = supabaseAdmin();
  const { data } = await db.from("push_subscriptions").select("endpoint, p256dh, auth");
  let sent = 0;
  for (const s of data ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 3 });
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }
  return sent;
}
