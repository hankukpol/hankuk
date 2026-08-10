import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { request as playwrightRequest } from "playwright";

type TenantType = "police" | "fire";

const appDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const composeFile = resolve(appDir, "docker-compose.local.yml");
const envFile = resolve(appDir, ".env.docker.local");
const previewContainer = process.env.ACCOUNT_RECOVERY_PREVIEW_CONTAINER?.trim();
const baseDatabaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54332/postgres";
const sharedIdentity = "010-9000-0000";
const registrationPhone = "010-9888-0001";
const registrationEmail = "fire-new-recovery@local.invalid";
const localTransportOrigin = "http://127.0.0.1:3200";
const configs = {
  police: {
    origin: process.env.SCORE_PREDICT_POLICE_ORIGIN ?? "http://police.localhost:3200",
    host: "police.localhost:3200",
    email: "police-user-0@local.invalid",
    originalPassword: "PoliceLocal!123",
    resetPassword: "PoliceReset!456",
    adminResetPassword: "PoliceAdminReset!789",
    accountPassword: "PoliceAccount!890",
  },
  fire: {
    origin: process.env.SCORE_PREDICT_FIRE_ORIGIN ?? "http://fire.localhost:3200",
    host: "fire.localhost:3200",
    email: "fire-user-0@local.invalid",
    originalPassword: "FireLocal!123",
    resetPassword: "FireReset!456",
  },
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function databaseUrlForTenant(tenantType: TenantType) {
  const url = new URL(baseDatabaseUrl);
  assert(["127.0.0.1", "localhost"].includes(url.hostname), "Account recovery E2E requires a local database.");
  assert(url.port === "54332", "Account recovery E2E requires the local Supabase database port.");
  url.searchParams.set("schema", `score_predict_${tenantType}`);
  return url.toString();
}

function createDb(tenantType: TenantType) {
  return new PrismaClient({ datasources: { db: { url: databaseUrlForTenant(tenantType) } } });
}

async function jsonRequest(tenantType: TenantType, pathname: string, body: Record<string, unknown>) {
  const response = await fetch(`${localTransportOrigin}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: configs[tenantType].host,
      "x-forwarded-host": configs[tenantType].host,
      "x-forwarded-proto": "http",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { response, data };
}

function readPreviewCode(previewFile: string) {
  assert(/^\.mail-preview[\\/]password-reset-code-[A-Za-z0-9.-]+\.txt$/.test(previewFile), "Unexpected mail preview path.");
  const normalizedPath = previewFile.replaceAll("\\", "/");
  const contents = previewContainer
    ? execFileSync(
        "docker",
        ["exec", previewContainer, "sh", "-lc", `cat '${normalizedPath}'`],
        { cwd: appDir, encoding: "utf8" }
      )
    : execFileSync(
        "docker",
        ["compose", "--env-file", envFile, "-f", composeFile, "exec", "-T", "web", "sh", "-lc", `cat '${normalizedPath}'`],
        { cwd: appDir, encoding: "utf8" }
      );
  const match = contents.match(/인증코드:\s*([A-Z0-9-]+)/);
  assert(match?.[1], "Reset code was not found in the local mail preview.");
  return match[1];
}

async function requestAndConfirmEmailReset(tenantType: TenantType, nextPassword: string) {
  const config = configs[tenantType];
  const requestResult = await jsonRequest(tenantType, "/api/auth/password-reset/request", {
    identity: sharedIdentity,
    email: config.email,
  });
  assert(requestResult.response.status === 200, `${tenantType}: reset request returned ${requestResult.response.status}.`);
  const previewFile = String(requestResult.data.previewFile ?? "");
  assert(previewFile, `${tenantType}: local preview file was not returned.`);
  const code = readPreviewCode(previewFile);

  const confirmationBody = {
    identity: sharedIdentity,
    email: config.email,
    resetCode: code,
    password: nextPassword,
    recoveryChannel: "EMAIL",
  };
  const concurrentResults = await Promise.all([
    jsonRequest(tenantType, "/api/auth/password-reset/confirm", confirmationBody),
    jsonRequest(tenantType, "/api/auth/password-reset/confirm", confirmationBody),
  ]);
  const statuses = concurrentResults.map((result) => result.response.status).sort();
  assert(
    statuses[0] === 200 && statuses[1] === 400,
    `${tenantType}: concurrent reset-code consumption was not atomic (${statuses.join(",")}).`
  );
}

async function login(tenantType: TenantType, identity: string, password: string, adminOnly = false) {
  const context = await playwrightRequest.newContext({
    baseURL: localTransportOrigin,
    extraHTTPHeaders: {
      host: configs[tenantType].host,
      "x-forwarded-host": configs[tenantType].host,
      "x-forwarded-proto": "http",
    },
  });
  const csrfResponse = await context.get("/api/auth/csrf");
  const csrf = (await csrfResponse.json()) as { csrfToken?: string };
  assert(csrf.csrfToken, `${tenantType}: CSRF token missing.`);
  const response = await context.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      callbackUrl: configs[tenantType].origin,
      json: "true",
      ...(tenantType === "police" ? { username: identity } : { phone: identity }),
      password,
      adminOnly: adminOnly ? "true" : "false",
    },
  });
  const sessionResponse = await context.get("/api/auth/session");
  const session = (await sessionResponse.json()) as { user?: { id?: string; tenantType?: string; role?: string } };
  assert(response.ok(), `${tenantType}: credential callback failed with ${response.status()}.`);
  assert(session.user?.tenantType === tenantType, `${tenantType}: login did not create the expected tenant session.`);
  return { context, session };
}

async function issuePoliceAdminCode() {
  const admin = await login("police", "010-0000-0000", "PoliceAdmin!123", true);
  try {
    const listResponse = await admin.context.get(`/api/admin/users?search=${encodeURIComponent(sharedIdentity)}`);
    const list = (await listResponse.json()) as { users?: Array<{ id?: number; phone?: string }> };
    const user = list.users?.find((item) => item.phone === sharedIdentity);
    assert(user?.id, "Police admin could not locate the local test user.");
    const issueResponse = await admin.context.put(`/api/admin/users?id=${user.id}`, {
      data: { resetPassword: true },
    });
    const issued = (await issueResponse.json()) as { resetCode?: string; deliveryPhone?: string };
    assert(issueResponse.status() === 200 && issued.resetCode, "Police admin reset code was not issued.");
    assert(issued.deliveryPhone === "010-8000-1000", "Police admin reset used an unexpected contact phone.");
    return issued.resetCode;
  } finally {
    await admin.context.dispose();
  }
}

async function verifyAccountEmailFlow() {
  const signedIn = await login("fire", sharedIdentity, configs.fire.resetPassword);
  try {
    const requestResponse = await signedIn.context.post("/api/account/security/email/request", {
      data: { email: configs.fire.email, currentPassword: configs.fire.resetPassword },
    });
    const requested = (await requestResponse.json()) as { previewFile?: string; error?: string };
    assert(requestResponse.status() === 200 && requested.previewFile, `Fire account email request failed: ${requested.error ?? requestResponse.status()}`);
    const code = readPreviewCode(requested.previewFile);
    const confirmResponse = await signedIn.context.post("/api/account/security/email/confirm", {
      data: { email: configs.fire.email, code },
    });
    assert(confirmResponse.status() === 200, "Fire account email verification failed.");
    const invalidatedSession = await signedIn.context.get("/api/account/security");
    assert(invalidatedSession.status() === 401, "Email change did not invalidate the previous session.");
  } finally {
    await signedIn.context.dispose();
  }
  const relogin = await login("fire", sharedIdentity, configs.fire.resetPassword);
  await relogin.context.dispose();
}

async function verifyAccountPasswordChange() {
  const signedIn = await login("police", sharedIdentity, configs.police.adminResetPassword);
  try {
    const response = await signedIn.context.put("/api/account/security", {
      data: {
        currentPassword: configs.police.adminResetPassword,
        newPassword: configs.police.accountPassword,
      },
    });
    assert(response.status() === 200, "Authenticated police password change failed.");
    const invalidatedSession = await signedIn.context.get("/api/account/security");
    assert(invalidatedSession.status() === 401, "Password change did not invalidate the previous session.");
  } finally {
    await signedIn.context.dispose();
  }
  const relogin = await login("police", sharedIdentity, configs.police.accountPassword);
  await relogin.context.dispose();
}

async function verifyFireRegistrationEmailRequirement() {
  const withoutEmail = await jsonRequest("fire", "/api/auth/register", {
    name: "테스트회원",
    phone: registrationPhone,
    password: "RegisterLocal!123",
    agreedToTerms: true,
    agreedToPrivacy: true,
  });
  assert(withoutEmail.response.status === 400, "Fire registration accepted a missing recovery email.");

  const withEmail = await jsonRequest("fire", "/api/auth/register", {
    name: "테스트회원",
    phone: registrationPhone,
    email: registrationEmail,
    password: "RegisterLocal!123",
    agreedToTerms: true,
    agreedToPrivacy: true,
  });
  assert(withEmail.response.status === 201, "Fire registration with an email failed.");
  assert(!Array.isArray(withEmail.data.recoveryCodes), "New fire registration still issued tenant-specific recovery codes.");
  const loginResult = await login("fire", registrationPhone, "RegisterLocal!123");
  await loginResult.context.dispose();
}

async function restoreSeedState() {
  for (const tenantType of ["police", "fire"] as const) {
    const db = createDb(tenantType);
    try {
      await db.user.update({
        where: { phone: sharedIdentity },
        data: {
          password: await bcrypt.hash(configs[tenantType].originalPassword, 10),
          credentialVersion: 1,
          emailVerifiedAt: null,
        },
      });
      await db.passwordResetToken.deleteMany({ where: { user: { phone: sharedIdentity } } });
      await db.authRateLimitBucket.deleteMany();
      if (tenantType === "fire") {
        await db.user.deleteMany({ where: { phone: registrationPhone } });
      }
    } finally {
      await db.$disconnect();
    }
  }
}

async function main() {
  await restoreSeedState();
  const policeDb = createDb("police");
  const fireDb = createDb("fire");
  try {
    await verifyFireRegistrationEmailRequirement();
    await requestAndConfirmEmailReset("police", configs.police.resetPassword);
    const [policeAfterReset, fireUnchanged] = await Promise.all([
      policeDb.user.findUnique({ where: { phone: sharedIdentity } }),
      fireDb.user.findUnique({ where: { phone: sharedIdentity } }),
    ]);
    assert(policeAfterReset && (await bcrypt.compare(configs.police.resetPassword, policeAfterReset.password)), "Police password was not changed.");
    assert(policeAfterReset.emailVerifiedAt, "Police recovery email was not marked verified.");
    assert(policeAfterReset.credentialVersion === 2, "Police credential version was not incremented.");
    assert(fireUnchanged && (await bcrypt.compare(configs.fire.originalPassword, fireUnchanged.password)), "Police reset changed the fire password.");
    const policeLogin = await login("police", sharedIdentity, configs.police.resetPassword);
    await policeLogin.context.dispose();

    await requestAndConfirmEmailReset("fire", configs.fire.resetPassword);
    const [policeStillReset, fireAfterReset] = await Promise.all([
      policeDb.user.findUnique({ where: { phone: sharedIdentity } }),
      fireDb.user.findUnique({ where: { phone: sharedIdentity } }),
    ]);
    assert(policeStillReset && (await bcrypt.compare(configs.police.resetPassword, policeStillReset.password)), "Fire reset changed the police password.");
    assert(fireAfterReset && (await bcrypt.compare(configs.fire.resetPassword, fireAfterReset.password)), "Fire password was not changed.");
    assert(fireAfterReset.emailVerifiedAt, "Fire recovery email was not marked verified.");
    const fireLogin = await login("fire", sharedIdentity, configs.fire.resetPassword);
    await fireLogin.context.dispose();
    await verifyAccountEmailFlow();

    const adminCode = await issuePoliceAdminCode();
    const adminConfirm = await jsonRequest("police", "/api/auth/password-reset/confirm", {
      identity: sharedIdentity,
      resetCode: adminCode,
      password: configs.police.adminResetPassword,
      recoveryChannel: "ADMIN_MANUAL_SMS",
    });
    assert(adminConfirm.response.status === 200, "Police admin-assisted reset failed.");
    const adminResetLogin = await login("police", sharedIdentity, configs.police.adminResetPassword);
    await adminResetLogin.context.dispose();
    await verifyAccountPasswordChange();

    const missingAccount = await jsonRequest("fire", "/api/auth/password-reset/request", {
      identity: "010-9999-9999",
      email: "missing@local.invalid",
    });
    assert(missingAccount.response.status === 200, "Unknown-account request did not return the generic response.");
    assert(!missingAccount.data.previewFile, "Unknown-account response exposed a preview file.");

    console.log(JSON.stringify({
      result: "passed",
      checks: [
        "police email reset and login",
        "fire email reset and login",
        "fire registration recovery-email requirement",
        "single-use reset codes",
        "police/fire password isolation",
        "administrator one-time manual-SMS code",
        "account email verification and session invalidation",
        "authenticated password change and session invalidation",
        "unknown-account generic response",
      ],
    }, null, 2));
  } finally {
    await Promise.all([policeDb.$disconnect(), fireDb.$disconnect()]);
    await restoreSeedState();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
