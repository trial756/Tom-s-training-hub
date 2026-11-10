"use client";

/**
 * If the app's data comes back "sign in" (a 401 from our own API), go to the
 * sign-in page. The middleware normally redirects page loads, but a page the
 * browser shows from its own cache (a restored tab, back/forward) never asks
 * the server, so without this it would sit there showing "Sign in to use the
 * app." with no way in.
 *
 * Installed when this module first loads in the browser — before any page's
 * effects run their first fetch — rather than in an effect, which would run
 * after the pages' own.
 */
function install() {
  const w = window as Window & { __authGuard?: boolean };
  if (w.__authGuard) return;
  w.__authGuard = true;
  const original = window.fetch.bind(window);
  let redirecting = false;
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await original(...args);
    if (res.status === 401 && !redirecting && window.location.pathname !== "/login") {
      const raw = args[0];
      const url = new URL(typeof raw === "string" ? raw : raw instanceof URL ? raw.href : raw.url, window.location.href);
      if (url.origin === window.location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/")) {
        redirecting = true;
        const next = window.location.pathname + window.location.search;
        window.location.replace(`/login${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
      }
    }
    return res;
  };
}

if (typeof window !== "undefined") install();

export default function AuthGuard() {
  return null;
}
