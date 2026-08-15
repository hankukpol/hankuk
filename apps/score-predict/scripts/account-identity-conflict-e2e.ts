import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { request as playwrightRequest } from "playwright";

const baseDatabaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54332/postgres";
const origin = "http://127.0.0.1:3200";
const host = "police.localhost:3200";
const previewContainer =
  process.env.ACCOUNT_RECOVERY_PREVIEW_CONTAINER?.trim() || "score-predict-local-web-1";
const normalizedAlias = "caselegacy815";
const aliases = ["CaseLegacy815", "caselegacy815"] as const;
const sharedContact = "01096660001";
const alphaPassword = "IdentityAlpha!123";
const betaPassword = "IdentityBeta!123";
const betaResetPassword = "IdentityBetaReset!456";
const keepFixtures = process.argv.includes("--keep-fixtures");
const cleanupOnly = process.argv.includes("--cleanup-only");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function policeDatabaseUrl() {
  const url = new URL(baseDatabaseUrl);
  assert(
    ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "54332",
    "Account identity E2E requires the local Supabase database."
  );
  url.searchParams.set("schema", "score_predict_police");
  return url.toString();
}

function headers() {
  return {
    "Content-Type": "application/json",
    host,
    "x-forwarded-host": host,
    "x-forwarded-proto": "http",
  };
}

async function jsonRequest(pathname: string, body: Record<string, unknown>) {
  const response = await fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { response, data };
}

async function jsonGet(pathname: string) {
  const response = await fetch(`${origin}${pathname}`, { headers: headers() });
  const data = (await response.json()) as Record<string, unknown>;
  return { response, data };
}

async function login(identity: string, password: string) {
  const context = await playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: {
      host,
      "x-forwarded-host": host,
      "x-forwarded-proto": "http",
    },
  });
  const csrfResponse = await context.get("/api/auth/csrf");
  const csrf = (await csrfResponse.json()) as { csrfToken?: string };
  assert(csrf.csrfToken, "CSRF token missing.");
  const response = await context.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      callbackUrl: `http://${host}`,
      json: "true",
      username: identity,
      password,
      adminOnly: "false",
    },
  });
  const sessionResponse = await context.get("/api/auth/session");
  const session = (await sessionResponse.json()) as {
    user?: { id?: string; username?: string; tenantType?: string };
  };
  await context.dispose();
  assert(response.ok(), `Credential callback failed with ${response.status()}.`);
  return session;
}

function readPreviewCode(previewFile: string) {
  assert(
    /^\.mail-preview[\\/]password-reset-code-[A-Za-z0-9.-]+\.txt$/.test(previewFile),
    "Unexpected mail preview path."
  );
  const normalizedPath = previewFile.replaceAll("\\", "/");
  const contents = execFileSync(
    "docker",
    ["exec", previewContainer, "sh", "-lc", `cat '${normalizedPath}'`],
    { encoding: "utf8" }
  );
  const match = contents.match(/인증코드:\s*([A-Z0-9-]+)/);
  assert(match?.[1], "Password reset code was not found in the local preview.");
  return match[1];
}

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: policeDatabaseUrl() } } });
  let fixtureUserIds: number[] = [];
  try {
    await db.authRateLimitBucket.deleteMany({
      where: {
        namespace: {
          in: [
            "auth-login-ip",
            "auth-login-username-failure",
            "auth-login-username-lock",
            "password-reset-request-ip",
            "password-reset-request-account",
            "password-reset-confirm-ip",
            "password-reset-confirm-account",
          ],
        },
      },
    });
    const staleAliases = await db.legacyAccountIdentity.findMany({
      where: { normalizedValue: normalizedAlias },
      select: { userId: true },
    });
    await db.user.deleteMany({
      where: {
        OR: [
          { id: { in: staleAliases.map((identity) => identity.userId) } },
          { phone: { in: ["identityalpha815", "identitybeta815"] } },
        ],
      },
    });
    if (cleanupOnly) {
      console.log(JSON.stringify({ cleanupOnly: true }, null, 2));
      return;
    }

    const alphaHash = await bcrypt.hash(alphaPassword.toLowerCase(), 10);
    const betaHash = await bcrypt.hash(betaPassword.toLowerCase(), 10);
    const fixtures = await db.$transaction(async (tx) => {
      const alpha = await tx.user.create({
        data: {
          name: "중복감사",
          email: "identity-alpha-815@local.invalid",
          phone: "identityalpha815",
          contactPhone: sharedContact,
          password: alphaHash,
        },
      });
      const beta = await tx.user.create({
        data: {
          name: "중복감사",
          email: "identity-beta-815@local.invalid",
          phone: "identitybeta815",
          contactPhone: "",
          password: betaHash,
        },
      });
      await tx.legacyAccountIdentity.createMany({
        data: [
          {
            userId: alpha.id,
            kind: "USERNAME",
            value: aliases[0],
            normalizedValue: normalizedAlias,
          },
          {
            userId: beta.id,
            kind: "USERNAME",
            value: aliases[1],
            normalizedValue: normalizedAlias,
          },
          {
            userId: alpha.id,
            kind: "CONTACT_PHONE",
            value: "010-9666-0001",
            normalizedValue: sharedContact,
          },
          {
            userId: beta.id,
            kind: "CONTACT_PHONE",
            value: sharedContact,
            normalizedValue: sharedContact,
          },
        ],
      });
      return { alpha, beta };
    });
    fixtureUserIds = [fixtures.alpha.id, fixtures.beta.id];

    const availability = await jsonGet(
      `/api/auth/username-availability?username=${encodeURIComponent("CASELEGACY815")}`
    );
    assert(availability.response.status === 200, "Username availability request failed.");
    assert(availability.data.available === false, "Legacy username alias was reported available.");

    const lookup = await jsonRequest("/api/auth/account-lookup/request", {
      name: "중복감사",
      contactPhone: "010-9666-0001",
    });
    assert(lookup.response.status === 200, "Duplicate-contact account lookup failed.");
    const foundUsernames = lookup.data.usernames as string[] | undefined;
    assert(
      foundUsernames?.length === 2 && aliases.every((alias) => foundUsernames.includes(alias)),
      "Account lookup did not return every preserved username."
    );

    const alphaSession = await login("CASELEGACY815", alphaPassword.toUpperCase());
    assert(
      alphaSession.user?.id === String(fixtures.alpha.id),
      "Alpha account login resolved to the wrong user."
    );
    const betaSession = await login("CaseLegacy815", betaPassword.toLowerCase());
    assert(
      betaSession.user?.id === String(fixtures.beta.id),
      "Beta account login resolved to the wrong user."
    );

    const sharedPasswordHash = await bcrypt.hash("SharedCollision!123".toLowerCase(), 10);
    await db.user.updateMany({
      where: { id: { in: fixtureUserIds } },
      data: { password: sharedPasswordHash },
    });
    const exactAlphaSession = await login(aliases[0], "SHAREDCOLLISION!123");
    const exactBetaSession = await login(aliases[1], "sharedcollision!123");
    assert(
      exactAlphaSession.user?.id === String(fixtures.alpha.id) &&
        exactBetaSession.user?.id === String(fixtures.beta.id),
      "Exact legacy casing did not disambiguate equal passwords."
    );
    await Promise.all([
      db.user.update({ where: { id: fixtures.alpha.id }, data: { password: alphaHash } }),
      db.user.update({ where: { id: fixtures.beta.id }, data: { password: betaHash } }),
    ]);

    const duplicateUsernameRegistration = await jsonRequest("/api/auth/register", {
      name: "신규차단",
      username: "CASELEGACY815",
      contactPhone: "010-9666-0099",
      email: "identity-new-815@local.invalid",
      password: "IdentityNew!123",
      agreeToTerms: true,
      agreeToPrivacy: true,
    });
    assert(
      duplicateUsernameRegistration.response.status === 409 &&
        duplicateUsernameRegistration.data.code === "USERNAME_EXISTS",
      "Registration accepted a preserved username alias."
    );

    const duplicateContactRegistration = await jsonRequest("/api/auth/register", {
      name: "신규차단",
      username: "identitynew815",
      contactPhone: "010-9666-0001",
      email: "identity-contact-new-815@local.invalid",
      password: "IdentityNew!123",
      agreeToTerms: true,
      agreeToPrivacy: true,
    });
    assert(
      duplicateContactRegistration.response.status === 409 &&
        duplicateContactRegistration.data.field === "contactPhone",
      "Registration accepted a preserved contact alias."
    );

    const resetRequest = await jsonRequest("/api/auth/password-reset/request", {
      identity: "CASELEGACY815",
      email: fixtures.beta.email,
    });
    assert(resetRequest.response.status === 200, "Alias password reset request failed.");
    assert(typeof resetRequest.data.previewFile === "string", "Local reset preview was not returned.");
    const resetCode = readPreviewCode(String(resetRequest.data.previewFile));
    const resetConfirm = await jsonRequest("/api/auth/password-reset/confirm", {
      identity: "caselegacy815",
      email: fixtures.beta.email,
      resetCode,
      password: betaResetPassword,
      recoveryChannel: "EMAIL",
    });
    assert(resetConfirm.response.status === 200, "Alias password reset confirmation failed.");

    const [alphaAfter, betaAfter] = await Promise.all([
      db.user.findUnique({ where: { id: fixtures.alpha.id }, select: { password: true } }),
      db.user.findUnique({ where: { id: fixtures.beta.id }, select: { password: true } }),
    ]);
    assert(
      alphaAfter && (await bcrypt.compare(alphaPassword.toLowerCase(), alphaAfter.password)),
      "Resetting beta changed alpha's password."
    );
    assert(
      betaAfter && (await bcrypt.compare(betaResetPassword.toLowerCase(), betaAfter.password)),
      "Beta password was not reset."
    );
    const betaResetSession = await login("CASELEGACY815", betaResetPassword.toUpperCase());
    assert(
      betaResetSession.user?.id === String(fixtures.beta.id),
      "Reset password login resolved to the wrong account."
    );

    const preservedUsers = await db.user.count({ where: { id: { in: fixtureUserIds } } });
    const preservedAliases = await db.legacyAccountIdentity.count({
      where: { userId: { in: fixtureUserIds } },
    });
    assert(preservedUsers === 2 && preservedAliases === 4, "Fixture identities were not preserved.");

    console.log(
      JSON.stringify(
        {
          preservedUsers,
          preservedAliases,
          usernameAvailabilityBlocked: true,
          accountLookupReturnedAll: true,
          bothLegacyLoginsResolved: true,
          equalPasswordsResolvedByExactLegacyCase: true,
          duplicateRegistrationBlocked: true,
          passwordResetChangedOnlyTarget: true,
        },
        null,
        2
      )
    );
  } finally {
    if (!keepFixtures && fixtureUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: fixtureUserIds } } });
    }
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
