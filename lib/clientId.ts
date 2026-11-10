import { supabaseAdmin } from "@/lib/supabase-admin";

// ── Offline retries without duplicates ────────────────────────────────
//
// The phone gives every log entry an id before sending it (lib/outbox.ts).
// If a save reached the server but the answer was lost — signal dropped
// mid-request — the retry carries the same id and gets the row that was
// already saved instead of a second copy (and a second AI call).

export function readClientId(body: unknown): string | null {
  const id = (body as { client_id?: unknown } | null)?.client_id;
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null;
}

export async function existingByClientId(table: "workouts" | "runs" | "meals", clientId: string | null) {
  if (!clientId) return null;
  const { data } = await supabaseAdmin().from(table).select("*").eq("client_id", clientId).maybeSingle();
  return data ?? null;
}

/** Postgres unique violation — the same id saved by a request that finished first. */
export const isDuplicate = (error: { code?: string } | null) => error?.code === "23505";
