import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_SESSION_TTL_SEC,
  createAdminSessionToken,
  isAdminSetupAuthorized,
  verifyAdminSessionToken,
} from "@/lib/admin-session-token";

const ORIGINAL_ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const ORIGINAL_ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY;
const ORIGINAL_DATE_NOW = Date.now;

function restoreGlobals() {
  Date.now = ORIGINAL_DATE_NOW;
  process.env.ADMIN_SESSION_SECRET = ORIGINAL_ADMIN_SESSION_SECRET;
  process.env.ADMIN_SETUP_KEY = ORIGINAL_ADMIN_SETUP_KEY;
}

test("createAdminSessionToken creates a verifiable signed session", () => {
  restoreGlobals();

  try {
    process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";

    const token = createAdminSessionToken({
      id: "admin-1",
      loginId: "supervisor",
      displayName: "Supervisor",
      role: "super_admin",
    });

    const payload = verifyAdminSessionToken(token);

    assert.ok(payload);
    assert.equal(payload?.adminId, "admin-1");
    assert.equal(payload?.loginId, "supervisor");
    assert.equal(payload?.role, "super_admin");
  } finally {
    restoreGlobals();
  }
});

test("verifyAdminSessionToken rejects expired tokens", () => {
  restoreGlobals();

  try {
    process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";

    const issuedAtMs = 1_710_000_000_000;
    Date.now = () => issuedAtMs;

    const token = createAdminSessionToken({
      id: "admin-2",
      loginId: "manager",
      displayName: "Manager",
      role: "admin",
    });

    Date.now = () => issuedAtMs + (ADMIN_SESSION_TTL_SEC + 5) * 1000;

    assert.equal(verifyAdminSessionToken(token), null);
  } finally {
    restoreGlobals();
  }
});

test("isAdminSetupAuthorized compares configured setup keys safely", () => {
  restoreGlobals();

  try {
    process.env.ADMIN_SETUP_KEY = "bootstrap-secret";

    assert.equal(isAdminSetupAuthorized("bootstrap-secret"), true);
    assert.equal(isAdminSetupAuthorized(" bootstrap-secret "), true);
    assert.equal(isAdminSetupAuthorized("wrong-secret"), false);
  } finally {
    restoreGlobals();
  }
});
