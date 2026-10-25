// Garmin Connect Personal API — the athlete's own data, read-only.
//
// The personal key (GARMIN_PERSONAL_API_KEY, created in Garmin Connect →
// Settings → Personal API Key) is exchanged for a short-lived bearer token;
// there is no refresh token, so a new one is minted when it lapses.
// Endpoints per Garmin's public client and community probes (Oct 2026).

export const GARMIN_HOST = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";

export interface GarminToken {
  accessToken: string;
  /** Epoch seconds, from the JWT's exp claim when present. */
  expiresAt: number | null;
}

function jwtExp(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

/** Pulls the token out of whatever shape the endpoint answers with: JSON or the raw token. */
function readToken(body: string): string | null {
  const text = body.trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text);
      const t = json.access_token ?? json.accessToken ?? json.token ?? json.jwt;
      return typeof t === "string" ? t : null;
    } catch {
      return null;
    }
  }
  return text.replace(/^"|"$/g, "");
}

let cached: GarminToken | null = null;

export async function garminToken(force = false): Promise<GarminToken> {
  const key = process.env.GARMIN_PERSONAL_API_KEY?.trim();
  if (!key) throw new GarminError("GARMIN_PERSONAL_API_KEY is not set in this deployment's environment.", "no_key");
  const now = Date.now() / 1000;
  if (!force && cached && (cached.expiresAt == null || cached.expiresAt - now > 3600)) return cached;

  const res = await fetch(`${GARMIN_HOST}${TOKEN_PATH}`, {
    method: "POST",
    headers: { Authorization: `ApiKey ${key}`, Accept: "application/json, text/plain, */*" },
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) {
    // Never let an error body that echoes the key reach a response.
    throw new GarminError(`Token exchange failed (${res.status}).`, "token_failed", res.status, body.split(key).join("***").slice(0, 300));
  }
  const accessToken = readToken(body);
  if (!accessToken) throw new GarminError("Token exchange returned no token.", "token_empty", res.status, body.slice(0, 120));
  cached = { accessToken, expiresAt: jwtExp(accessToken) };
  return cached;
}

export class GarminError extends Error {
  constructor(message: string, public code: string, public status?: number, public detail?: string) {
    super(message);
  }
}

/** GET against the Personal API with a bearer token, re-minting once on a 401. */
export async function garminGet(path: string, params?: Record<string, string | number | undefined>): Promise<unknown> {
  const url = new URL(path, GARMIN_HOST);
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 2; attempt++) {
    const { accessToken } = await garminToken(attempt > 0);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) continue;
    const body = await res.text();
    if (!res.ok) throw new GarminError(`${path} failed (${res.status}).`, "request_failed", res.status, body.slice(0, 300));
    return body ? JSON.parse(body) : null;
  }
  throw new GarminError(`${path} kept returning 401.`, "unauthorized", 401);
}

export function searchActivities(opts: { start?: number; limit?: number; startDate?: string; endDate?: string }) {
  return garminGet("/activitylist-service/activities/search/activities", {
    start: opts.start ?? 0,
    limit: opts.limit ?? 20,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
}

export function getActivity(id: string | number) {
  return garminGet(`/activity-service/activity/${id}`);
}
