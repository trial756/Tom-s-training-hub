import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { flushOutbox, postOrQueue, readOutbox } from "../lib/outbox";

// A minimal browser for lib/outbox.ts: localStorage, window events, navigator.onLine, fetch.
const store = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const win = new EventTarget();
g.window = Object.assign(win, { addEventListener: win.addEventListener.bind(win), removeEventListener: win.removeEventListener.bind(win), dispatchEvent: win.dispatchEvent.bind(win) });
const nav = { onLine: true };
Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
let respond: (c: Call) => Response | Promise<Response> = () => new Response("{}", { status: 201 });
g.fetch = async (url: string, init: { body: string }) => {
  const c = { url, body: JSON.parse(init.body) };
  calls.push(c);
  return respond(c);
};


beforeEach(() => {
  store.clear();
  calls = [];
  nav.onLine = true;
  respond = () => new Response(JSON.stringify({ ok: 1 }), { status: 201 });
});

test("online: posts straight through with a client id", async () => {
  const r = await postOrQueue("/api/meals", { text: "eggs" }, { kind: "meal", label: "Meal" });
  assert.equal(r.queued, false);
  assert.equal(calls.length, 1);
  assert.match(String(calls[0].body.client_id), /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(readOutbox().length, 0);
});

test("offline: kept on the phone with its original timestamp, then synced in order", async () => {
  nav.onLine = false;
  const a = await postOrQueue("/api/runs", { distance_miles: 4, logged_at: "2026-11-10T13:00:00.000Z" }, { kind: "run", label: "Run" });
  const b = await postOrQueue("/api/meals", { text: "oats" }, { kind: "meal", label: "Meal" });
  assert.equal(a.queued, true);
  assert.equal(b.queued, true);
  assert.equal(calls.length, 0);
  assert.equal(readOutbox().length, 2);

  nav.onLine = true;
  assert.equal(await flushOutbox(), 2);
  assert.deepEqual(calls.map((c) => c.url), ["/api/runs", "/api/meals"]);
  assert.equal(calls[0].body.logged_at, "2026-11-10T13:00:00.000Z");
  assert.equal(readOutbox().length, 0);
});

test("a dropped connection mid-request queues the entry; the retry reuses its id", async () => {
  respond = () => {
    throw new TypeError("Failed to fetch");
  };
  const r = await postOrQueue("/api/workouts", { text: "squat 185x5" }, { kind: "workout", label: "Workout" });
  assert.equal(r.queued, true);
  const firstId = calls[0].body.client_id;
  respond = () => new Response("{}", { status: 200 });
  await flushOutbox();
  assert.equal(calls[1].body.client_id, firstId);
  assert.equal(readOutbox().length, 0);
});

test("a rejected entry is marked failed and doesn't block the rest; a server error retries later", async () => {
  nav.onLine = false;
  await postOrQueue("/api/weight", { weight_lb: 5 }, { kind: "weight", label: "Weigh-in" });
  await postOrQueue("/api/meals", { text: "rice" }, { kind: "meal", label: "Meal" });
  await postOrQueue("/api/runs", { distance_miles: 3 }, { kind: "run", label: "Run" });
  nav.onLine = true;
  respond = (c) =>
    c.url === "/api/weight"
      ? new Response(JSON.stringify({ error: "weight must be 60–500 lb" }), { status: 400 })
      : c.url === "/api/meals"
        ? new Response("{}", { status: 500 })
        : new Response("{}", { status: 201 });
  assert.equal(await flushOutbox(), 1);
  const left = readOutbox();
  assert.equal(left.length, 2);
  assert.equal(left.find((i) => i.url === "/api/weight")?.failed, "weight must be 60–500 lb");
  assert.equal(left.find((i) => i.url === "/api/meals")?.failed, undefined);
  assert.equal(left.find((i) => i.url === "/api/meals")?.attempts, 1);
});
