import assert from "node:assert/strict";
import test from "node:test";

import {
  checkRateLimit,
  resetRateLimitStateForTest,
} from "@/lib/rate-limit";

const ORIGINAL_DATE_NOW = Date.now;
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function restoreEnvironment() {
  Date.now = ORIGINAL_DATE_NOW;
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SUPABASE_SERVICE_ROLE_KEY;
  resetRateLimitStateForTest();
}

test("checkRateLimit enforces the in-memory limit when Supabase is unavailable", async () => {
  restoreEnvironment();

  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const first = await checkRateLimit({
      key: "test:memory-limit",
      limit: 2,
      windowMs: 60_000,
    });
    const second = await checkRateLimit({
      key: "test:memory-limit",
      limit: 2,
      windowMs: 60_000,
    });
    const third = await checkRateLimit({
      key: "test:memory-limit",
      limit: 2,
      windowMs: 60_000,
    });

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
    assert.equal(third.remaining, 0);
  } finally {
    restoreEnvironment();
  }
});

test("checkRateLimit resets the in-memory bucket after the window expires", async () => {
  restoreEnvironment();

  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const baseNow = 1_710_000_000_000;
    Date.now = () => baseNow;

    const first = await checkRateLimit({
      key: "test:memory-expiry",
      limit: 1,
      windowMs: 30_000,
    });

    Date.now = () => baseNow + 31_000;

    const second = await checkRateLimit({
      key: "test:memory-expiry",
      limit: 1,
      windowMs: 30_000,
    });

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(second.remaining, 0);
  } finally {
    restoreEnvironment();
  }
});
