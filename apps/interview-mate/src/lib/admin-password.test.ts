import assert from "node:assert/strict";
import test from "node:test";

import { hashAdminPassword, verifyAdminPassword } from "@/lib/admin-password";

test("hashAdminPassword hashes and verifies an admin password", async () => {
  const password = "Sup3r-Strong-Password!";
  const passwordHash = await hashAdminPassword(password);

  assert.match(passwordHash, /^scrypt:/);
  assert.equal(await verifyAdminPassword(password, passwordHash), true);
  assert.equal(await verifyAdminPassword("wrong-password", passwordHash), false);
});

test("verifyAdminPassword rejects malformed hashes", async () => {
  assert.equal(await verifyAdminPassword("anything", "invalid"), false);
  assert.equal(await verifyAdminPassword("anything", "scrypt::"), false);
});
