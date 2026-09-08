import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTargetPath } from "../../lib/safe-redirect";
import { loadWithMocks } from "../helpers/module-mocks";
import { getRequestIp, assertRateLimit, recordRateLimitFailure, clearRateLimit } from "../../lib/rate-limit";

test("portal redirect rejects browser-normalized external destinations", () => {
  const origin = "https://study.example";
  for (const value of ["//evil.example", "/\\evil.example", "/\n/evil.example", "/\t/evil.example", "https://evil.example"]) {
    assert.equal(new URL(normalizeTargetPath(value, "/police/admin"), origin).origin, origin, JSON.stringify(value));
  }
  assert.equal(normalizeTargetPath("/police/admin?tab=1#top", "/login"), "/police/admin?tab=1#top");
  assert.equal(normalizeTargetPath(null, "/login"), "/login");
});

test("untrusted forwarding headers cannot choose a new login throttle bucket", () => {
  const vercel = process.env.VERCEL;
  const trusted = process.env.TRUST_X_FORWARDED_FOR;
  delete process.env.VERCEL;
  delete process.env.TRUST_X_FORWARDED_FOR;
  try {
    for (const header of ["x-vercel-forwarded-for", "x-real-ip", "cf-connecting-ip", "fastly-client-ip", "x-forwarded-for"]) {
      assert.equal(getRequestIp(new Headers({ [header]: "198.51.100.1" })), "unknown", header);
    }
    process.env.VERCEL = "1";
    assert.equal(getRequestIp(new Headers({ "x-vercel-forwarded-for": "198.51.100.2" })), "198.51.100.2");
    assert.equal(getRequestIp(new Headers({ "x-vercel-forwarded-for": "invalid", "x-real-ip": "198.51.100.3" })), "unknown");
    delete process.env.VERCEL;
    process.env.TRUST_X_FORWARDED_FOR = "true";
    assert.equal(getRequestIp(new Headers({ "x-forwarded-for": "2001:db8::1, 192.0.2.1" })), "2001:db8::1");
    assert.equal(getRequestIp(new Headers({ "x-forwarded-for": "not-an-ip" })), "unknown");
  } finally {
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
    if (trusted === undefined) delete process.env.TRUST_X_FORWARDED_FOR; else process.env.TRUST_X_FORWARDED_FOR = trusted;
  }
});

test("login throttling preserves separate buckets, expiration and successful reset", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const options = { bucket: "security-test", maxAttempts: 2, windowMs: 1000 };
  recordRateLimitFailure("192.0.2.1", options);
  assert.throws(() => recordRateLimitFailure("192.0.2.1", options), { status: 429 });
  assert.throws(() => assertRateLimit("192.0.2.1", options), { status: 429 });
  assert.doesNotThrow(() => assertRateLimit("192.0.2.1", { ...options, bucket: "other" }));
  t.mock.timers.tick(1000);
  assert.doesNotThrow(() => assertRateLimit("192.0.2.1", options));
  recordRateLimitFailure("192.0.2.1", options);
  clearRateLimit("192.0.2.1", options.bucket);
  assert.doesNotThrow(() => assertRateLimit("192.0.2.1", options));
});

test("background cleanup keeps long-window failures until their actual expiry", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  let prune = () => {};
  const timer = t.mock.method(globalThis, "setInterval", (callback: () => void) => { prune = callback; return { unref() {} }; });
  const loaded = loadWithMocks<typeof import("../../lib/rate-limit")>("../../lib/rate-limit", {});
  t.after(loaded.restore);
  timer.mock.restore();
  const options = { bucket: "long-window", maxAttempts: 2, windowMs: 20 * 60000 };
  loaded.module.recordRateLimitFailure("192.0.2.2", options);
  assert.throws(() => loaded.module.recordRateLimitFailure("192.0.2.2", options));
  t.mock.timers.tick(11 * 60000);
  prune();
  assert.throws(() => loaded.module.assertRateLimit("192.0.2.2", options), { status: 429 });
  t.mock.timers.tick(9 * 60000);
  prune();
  assert.doesNotThrow(() => loaded.module.assertRateLimit("192.0.2.2", options));
});
