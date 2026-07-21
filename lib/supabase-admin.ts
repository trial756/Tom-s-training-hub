import { createClient } from "@supabase/supabase-js";

// Server-only client using the service role key. Never import this from a
// client component — it bypasses row level security entirely.
// Typed `any` for the schema generic: this project has no generated
// Database types (see supabase/schema.sql for the source of truth), so we
// don't ask supabase-js to type-check table/column names against a schema
// it doesn't know.
let cachedClient: ReturnType<typeof createClient<any, "public", any>> | null = null;

export function supabaseAdmin() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  cachedClient = createClient<any, "public", any>(url, serviceKey, {
    auth: { persistSession: false },
  });

  return cachedClient;
}
