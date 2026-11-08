import { test } from "node:test";
import assert from "node:assert/strict";

import { signToken, verifyToken, newExpiry, deviceName } from "@/lib/deviceAuth";

// The signing key is read on first use, so setting it here is in time.
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";

const id = "3f2b6c1e-8a4d-4f7a-9b2c-1d2e3f4a5b6c";

test("a signed device token verifies", async () => {
  const token = await signToken({ deviceId: id, exp: newExpiry(true), trusted: true });
  const v = await verifyToken(token);
  assert.equal(v?.deviceId, id);
  assert.equal(v?.trusted, true);
});

test("a tampered token is rejected", async () => {
  const token = await signToken({ deviceId: id, exp: newExpiry(false), trusted: false });
  const [d, exp, , sig] = token.split(".");
  assert.equal(await verifyToken(`${d}.${exp}.1.${sig}`), null, "can't upgrade a session to trusted");
  assert.equal(await verifyToken(`${d}.${Number(exp) + 999999}.0.${sig}`), null, "can't extend the expiry");
  assert.equal(await verifyToken(token.slice(0, -2) + "xx"), null);
  assert.equal(await verifyToken("garbage"), null);
  assert.equal(await verifyToken(undefined), null);
});

test("an expired token is rejected", async () => {
  const token = await signToken({ deviceId: id, exp: 1000, trusted: true });
  assert.equal(await verifyToken(token), null);
});

test("devices get readable names", () => {
  assert.equal(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), "iPhone · Safari");
  assert.equal(deviceName("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"), "Android · Chrome");
});
