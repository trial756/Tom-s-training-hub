// ── Trusted devices ──────────────────────────────────────────────────
//
// The app is one person's, so there are no accounts: a passcode
// (APP_PASSCODE, set in Vercel) signs a device in once, and a signed cookie
// keeps it signed in for about a year, renewed as it's used. Every device is
// a row in trusted_devices, so one can be signed out from the Devices page
// without touching the others.
//
// Runs in middleware (Edge), so only Web Crypto and fetch — no Node APIs and
// no supabase-js. The signing key is derived from the service-role key, a
// secret the deployment already has, so the only new setting is the passcode.

export const COOKIE = "tth_device";
/** Browsers cap cookies at about 400 days. */
export const TRUSTED_DAYS = 400;
/** A trusted cookie is re-signed once it has less than this left, so daily use never expires. */
export const RENEW_BELOW_DAYS = 330;
/** "Just this once": a session cookie, and the token itself lapses after this. */
export const SESSION_HOURS = 12;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let keyPromise: Promise<CryptoKey> | null = null;
async function signingKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!secret) throw new Error("No secret available to sign device cookies.");
    keyPromise = crypto.subtle
      .digest("SHA-256", enc.encode(`tth-device-v1:${secret}`))
      .then((raw) => crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
  }
  return keyPromise;
}

export interface DeviceToken {
  deviceId: string;
  /** Epoch seconds. */
  exp: number;
  trusted: boolean;
}

export async function signToken(t: DeviceToken): Promise<string> {
  const body = `${t.deviceId}.${t.exp}.${t.trusted ? 1 : 0}`;
  const sig = await crypto.subtle.sign("HMAC", await signingKey(), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyToken(token: string | undefined, now = Date.now() / 1000): Promise<DeviceToken | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [deviceId, expRaw, trustedRaw, sig] = parts;
  if (!/^[0-9a-f-]{36}$/.test(deviceId) || !/^\d+$/.test(expRaw)) return null;
  const expected = await signToken({ deviceId, exp: Number(expRaw), trusted: trustedRaw === "1" });
  // Compare the whole token; both sides are our own fixed-format output.
  if (!timingSafeEqual(expected, `${deviceId}.${expRaw}.${trustedRaw}.${sig}`)) return null;
  const exp = Number(expRaw);
  if (exp <= now) return null;
  return { deviceId, exp, trusted: trustedRaw === "1" };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function newExpiry(trusted: boolean, now = Date.now() / 1000): number {
  return Math.floor(now + (trusted ? TRUSTED_DAYS * 86400 : SESSION_HOURS * 3600));
}

export function cookieOptions(trusted: boolean) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    ...(trusted ? { maxAge: TRUSTED_DAYS * 86400 } : {}),
  };
}

/** Sign-in is enforced once a passcode is set; until then the app stays as it was. */
export function authEnabled(): boolean {
  return !!process.env.APP_PASSCODE;
}

/** "iPhone · Safari" from a user agent, good enough to tell devices apart in a list. */
export function deviceName(ua: string | null): string {
  const s = ua ?? "";
  const device = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Macintosh/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows PC" : /Linux/.test(s) ? "Linux" : "Device";
  const browser = /Edg\//.test(s) ? "Edge" : /CriOS|Chrome\//.test(s) ? "Chrome" : /FxiOS|Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "Browser";
  return `${device} · ${browser}`;
}
