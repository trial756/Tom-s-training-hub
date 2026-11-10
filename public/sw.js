// Tom's Training Hub — offline shell (see lib/outbox.ts for offline logging).
//
// • Built assets (/_next/static, icons): cache-first; their names change
//   with every build, so a cached copy is never stale.
// • Pages: network-first, falling back to the last copy — the app opens
//   with no signal on any page visited before (and the main tabs, which are
//   warmed after install).
// • API reads: network-first, falling back to the last answer, so lists and
//   the plan show what they last showed. Writes (POST/PATCH/DELETE) are never
//   touched here; the outbox handles saving offline.

const VERSION = "v1";
const STATIC = `tth-static-${VERSION}`;
const PAGES = `tth-pages-${VERSION}`;
const API = `tth-api-${VERSION}`;
const WARM = ["/", "/progress", "/history", "/goals", "/log", "/runs", "/fuel", "/workout"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC, PAGES, API];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
      // Warm the main tabs so they open offline even if not visited yet.
      const cache = await caches.open(PAGES);
      await Promise.all(
        WARM.map(async (path) => {
          try {
            const res = await fetch(path, { credentials: "same-origin" });
            if (cacheable(res)) await cache.put(path, res);
          } catch {}
        })
      );
    })()
  );
});

/** Only real pages and answers: never a redirect to /login or an error. */
function cacheable(res) {
  return res && res.ok && !res.redirected && res.type === "basic";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/auth") || url.pathname === "/login" || url.pathname === "/sw.js") return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, PAGES, url.pathname));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req, API, url.pathname + url.search));
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, name, key) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (cacheable(res)) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    if (req.mode === "navigate") {
      return new Response(
        '<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#080808;color:#f5f5f5;font-family:system-ui;padding:24px"><h1>Offline</h1><p>This page hasn’t been opened on this phone yet. Open Today or the + button — logging works offline.</p><a style="color:#00e676" href="/">Go to Today</a>',
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
    throw err;
  }
}
