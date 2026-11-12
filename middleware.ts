import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { COOKIE, RENEW_BELOW_DAYS, authEnabled, cookieOptions, newExpiry, signToken, verifyToken } from "@/lib/deviceAuth";

// Every page and API route needs a signed-in device (lib/deviceAuth.ts),
// except the sign-in page itself and the daily Garmin cron.

const PUBLIC = [/^\/login$/, /^\/api\/auth\/login$/, /^\/manifest\.json$/, /^\/icons\//, /^\/favicon/, /^\/sw\.js$/];

// Revocation: a device row is checked at most every few minutes per server
// instance, so "Sign out" on another device takes effect within minutes.
const CHECK_MS = 5 * 60 * 1000;
const seen = new Map<string, { at: number; active: boolean }>();

async function deviceActive(id: string, event: NextFetchEvent): Promise<boolean> {
  const hit = seen.get(id);
  if (hit && Date.now() - hit.at < CHECK_MS) return hit.active;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return true;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  try {
    const res = await fetch(`${url}/rest/v1/trusted_devices?id=eq.${id}&select=id,revoked_at`, { headers, cache: "no-store" });
    if (!res.ok) return hit?.active ?? true; // database hiccup: don't lock the owner out
    const rows = (await res.json()) as { revoked_at: string | null }[];
    const active = rows.length === 1 && !rows[0].revoked_at;
    seen.set(id, { at: Date.now(), active });
    if (active) {
      event.waitUntil(
        fetch(`${url}/rest/v1/trusted_devices?id=eq.${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
        }).catch(() => undefined)
      );
    }
    return active;
  } catch {
    return hit?.active ?? true;
  }
}

const CRON_PATHS = ["/api/garmin/sync", "/api/water/remind"];

function isCron(req: NextRequest): boolean {
  if (!CRON_PATHS.includes(req.nextUrl.pathname) || req.method !== "GET") return false;
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  // Without CRON_SECRET, Vercel's cron is recognised by its user agent. The
  // routes only pull Garmin data in or send the owner a water nudge, and
  // answer with counts, so a spoof gains nothing.
  return (req.headers.get("user-agent") ?? "").startsWith("vercel-cron/");
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!authEnabled()) return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((re) => re.test(path)) || isCron(req)) return NextResponse.next();

  const token = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (token && (await deviceActive(token.deviceId, event))) {
    const res = NextResponse.next();
    // Keep a trusted device signed in for as long as it's used.
    if (token.trusted && token.exp - Date.now() / 1000 < RENEW_BELOW_DAYS * 86400) {
      const renewed = await signToken({ ...token, exp: newExpiry(true) });
      res.cookies.set(COOKIE, renewed, cookieOptions(true));
    }
    return res;
  }

  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in to use the app." }, { status: 401 });
  const login = new URL("/login", req.url);
  if (path !== "/") login.searchParams.set("next", path + req.nextUrl.search);
  const res = NextResponse.redirect(login);
  if (token) res.cookies.delete(COOKIE); // signed out elsewhere
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
