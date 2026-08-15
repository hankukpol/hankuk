import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium, request as playwrightRequest } from "playwright";

type TenantType = "police" | "fire";

const appDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const composeFile = resolve(appDir, "docker-compose.local.yml");
const envFile = resolve(appDir, ".env.docker.local");
const previewContainer = process.env.ACCOUNT_RECOVERY_PREVIEW_CONTAINER?.trim();
const baseDatabaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54332/postgres";
const sharedIdentity = "010-9000-0000";
const registrationPhone = "010-9888-0001";
const registrationEmail = "fire-new-recovery@local.invalid";
const policeRegistrationUsername = "CaseAudit815";
const normalizedPoliceRegistrationUsername = policeRegistrationUsername.toLowerCase();
const policeRegistrationPhone = "010-9888-0002";
const policeRegistrationEmail = "police-case-audit@local.invalid";
const policeRegistrationPassword = "CaseAudit!123";
const legacyPoliceUsername = "legacynoemail815";
const legacyPolicePhone = "010-9888-0003";
const legacyPolicePassword = "LegacyAudit!123";
const earliestLegacyPolicePhone = "010-9888-0004";
const legacyMissingUsername = "legacycontact815";
const legacyMissingPhone = "010-9888-0005";
const legacyAdminUsername = "legacyadmin815";
const legacyAdminPhone = "010-9888-0006";
const legacyBatchPrefix = "legacyauditbatch";
const legacyBatchSize = 171;
const legacyPhoneLoginContact = "010-9888-0088";
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

async function jsonGet(tenantType: TenantType, pathname: string) {
  const response = await fetch(`${localTransportOrigin}${pathname}`, {
    headers: {
      host: configs[tenantType].host,
      "x-forwarded-host": configs[tenantType].host,
      "x-forwarded-proto": "http",
    },
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { response, data };
}

async function passwordHashMatches(password: string, hash: string) {
  return bcrypt.compare(password.trim().toLowerCase(), hash);
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
    assert(issued.deliveryPhone === "01080001000", "Police admin reset used an unexpected contact phone.");
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
  const loginResult = await login("fire", registrationPhone, "rEGISTERlOCAL!123");
  await loginResult.context.dispose();
}

async function verifyPoliceRegistrationAndAccountLookup() {
  const before = await jsonGet(
    "police",
    `/api/auth/username-availability?username=${encodeURIComponent(policeRegistrationUsername)}`
  );
  assert(before.response.status === 200 && before.data.available === true, "New police username was not available.");
  assert(before.data.username === normalizedPoliceRegistrationUsername, "Username availability did not normalize case.");

  const registered = await jsonRequest("police", "/api/auth/register", {
    name: "계정감사",
    username: policeRegistrationUsername,
    contactPhone: policeRegistrationPhone,
    email: policeRegistrationEmail,
    password: policeRegistrationPassword,
    agreeToTerms: true,
    agreeToPrivacy: true,
  });
  assert(registered.response.status === 201, `Police registration failed with ${registered.response.status}.`);

  const after = await jsonGet(
    "police",
    `/api/auth/username-availability?username=${encodeURIComponent(policeRegistrationUsername.toUpperCase())}`
  );
  assert(after.response.status === 200 && after.data.available === false, "Case-insensitive username duplicate was not detected.");
  for (let attempt = 0; attempt < 35; attempt += 1) {
    const unrestrictedAvailability = await jsonGet(
      "police",
      `/api/auth/username-availability?username=${encodeURIComponent(policeRegistrationUsername.toUpperCase())}`
    );
    assert(unrestrictedAvailability.response.status === 200, "Username availability was rate limited.");
  }

  const duplicateUsername = await jsonRequest("police", "/api/auth/register", {
    name: "아이디중복감사",
    username: policeRegistrationUsername.toUpperCase(),
    contactPhone: "010-9888-0099",
    email: "duplicate-username-audit@local.invalid",
    password: "Duplicate!123",
    agreeToTerms: true,
    agreeToPrivacy: true,
  });
  assert(duplicateUsername.response.status === 409, "Duplicate police username was accepted by registration.");
  assert(duplicateUsername.data.code === "USERNAME_EXISTS", "Duplicate username did not return the expected error code.");

  const caseInsensitiveLogin = await login(
    "police",
    policeRegistrationUsername.toUpperCase(),
    "cASEaUDIT!123"
  );
  await caseInsensitiveLogin.context.dispose();

  const duplicateContact = await jsonRequest("police", "/api/auth/register", {
    name: "중복감사",
    username: "differentaudit815",
    contactPhone: policeRegistrationPhone,
    email: "different-audit@local.invalid",
    password: "Different!123",
    agreeToTerms: true,
    agreeToPrivacy: true,
  });
  assert(duplicateContact.response.status === 409, "Duplicate police contact phone was accepted.");
  assert(duplicateContact.data.code === "ACCOUNT_EXISTS", "Duplicate contact did not return account guidance.");

  const duplicateEmail = await jsonRequest("police", "/api/auth/register", {
    name: "이메일중복",
    username: "emailduplicate815",
    contactPhone: "010-9888-0098",
    email: policeRegistrationEmail.toUpperCase(),
    password: "Different!123",
    agreeToTerms: true,
    agreeToPrivacy: true,
  });
  assert(duplicateEmail.response.status === 409, "Case-insensitive duplicate recovery email was accepted.");
  assert(duplicateEmail.data.code === "ACCOUNT_EXISTS", "Duplicate email did not return account guidance.");

  const legacyFallbackDb = createDb("police");
  try {
    await legacyFallbackDb.user.deleteMany({ where: { phone: legacyPhoneLoginContact.replaceAll("-", "") } });
    await legacyFallbackDb.user.create({
      data: {
        name: "구가입자",
        phone: legacyPhoneLoginContact.replaceAll("-", ""),
        contactPhone: "",
        email: null,
        password: await bcrypt.hash("legacyfallback!123", 10),
      },
    });
    const legacyPhoneDuplicate = await jsonRequest("police", "/api/auth/register", {
      name: "재가입시도",
      username: "legacyfbdup815",
      contactPhone: legacyPhoneLoginContact,
      email: "legacy-fallback-duplicate@local.invalid",
      password: "Different!123",
      agreeToTerms: true,
      agreeToPrivacy: true,
    });
    assert(legacyPhoneDuplicate.response.status === 409, "Legacy phone-login account was duplicated by registration.");
    assert(legacyPhoneDuplicate.data.code === "ACCOUNT_EXISTS", "Legacy phone-login duplicate did not return account guidance.");
  } finally {
    await legacyFallbackDb.user.deleteMany({ where: { phone: legacyPhoneLoginContact.replaceAll("-", "") } });
    await legacyFallbackDb.$disconnect();
  }

  const lookupRequest = await jsonRequest("police", "/api/auth/account-lookup/request", {
    name: "계정감사",
    contactPhone: policeRegistrationPhone,
  });
  assert(lookupRequest.response.status === 200, "Account lookup request failed.");
  assert(
    lookupRequest.data.username === normalizedPoliceRegistrationUsername,
    "Account lookup did not immediately return the username."
  );
  assert(!lookupRequest.data.previewFile, "Account lookup unexpectedly created an email preview.");
  assert(!lookupRequest.data.previewCode, "Account lookup unexpectedly returned an email code.");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const unrestrictedLookup = await jsonRequest("police", "/api/auth/account-lookup/request", {
      name: "계정감사",
      contactPhone: policeRegistrationPhone,
    });
    assert(unrestrictedLookup.response.status === 200, "Account lookup request was rate limited.");
  }
  const missingLookup = await jsonRequest("police", "/api/auth/account-lookup/request", {
    name: "없는회원",
    contactPhone: "010-9999-9999",
  });
  assert(missingLookup.response.status === 404, "Unknown account lookup did not return a not-found response.");
  assert(!missingLookup.data.username, "Unknown account lookup exposed a username.");

  const lookupDb = createDb("police");
  try {
    const lookupTokenCount = await lookupDb.passwordResetToken.count({
      where: { user: { phone: normalizedPoliceRegistrationUsername }, purpose: "ACCOUNT_LOOKUP" },
    });
    assert(lookupTokenCount === 0, "Direct account lookup created an email verification token.");
  } finally {
    await lookupDb.$disconnect();
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto("http://police.localhost:3200/find-account", { waitUntil: "networkidle" });
    await page.locator("#lookupName").fill("계정감사");
    await page.locator("#lookupContactPhone").fill(policeRegistrationPhone);
    await page.getByRole("button", { name: "아이디 확인" }).click();
    await page.getByTestId("found-username").waitFor();
    assert(
      (await page.getByTestId("found-username").textContent()) === normalizedPoliceRegistrationUsername,
      "Browser account lookup returned an unexpected username."
    );
    const resetHref = await page.getByRole("link", { name: "비밀번호 재설정" }).getAttribute("href");
    assert(resetHref?.includes(`identity=${normalizedPoliceRegistrationUsername}`), "Recovered username was not handed to password reset.");
  } finally {
    await browser.close();
  }
}

async function verifyLegacyContactRegistrationAndAdminManagement() {
  const db = createDb("police");
  const normalizedLegacyPhone = legacyMissingPhone.replaceAll("-", "");
  const normalizedAdminPhone = legacyAdminPhone.replaceAll("-", "");
  const normalizedRegisteredPhone = policeRegistrationPhone.replaceAll("-", "");
  const sharedLegacyHash = await bcrypt.hash("legacycontact!123", 10);
  const ambiguousHash = await bcrypt.hash("ambiguous!123", 10);
  try {
    await db.user.createMany({
      data: [
        {
          name: "연락처복구",
          phone: legacyMissingUsername,
          contactPhone: "",
          email: null,
          password: sharedLegacyHash,
        },
        {
          name: "관리보완",
          phone: legacyAdminUsername,
          contactPhone: "",
          email: null,
          password: sharedLegacyHash,
        },
        {
          name: "동명이인",
          phone: "legacyambiguous815a",
          contactPhone: "",
          email: null,
          password: ambiguousHash,
        },
        {
          name: "동명이인",
          phone: "legacyambiguous815b",
          contactPhone: "",
          email: null,
          password: ambiguousHash,
        },
      ],
    });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const wrongPassword = await jsonRequest("police", "/api/auth/account-lookup/legacy-contact", {
        name: "연락처복구",
        contactPhone: legacyMissingPhone,
        password: "WrongPassword!123",
      });
      assert(wrongPassword.response.status === 404, "Wrong legacy password was accepted or rate limited.");
    }

    const duplicateContact = await jsonRequest("police", "/api/auth/account-lookup/legacy-contact", {
      name: "연락처복구",
      contactPhone: policeRegistrationPhone,
      password: "lEGACYcONTACT!123",
    });
    assert(duplicateContact.response.status === 409, "A contact owned by another account was attached to a legacy account.");
    assert(duplicateContact.data.code === "CONTACT_EXISTS", "Legacy contact collision returned an unexpected code.");

    const ambiguous = await jsonRequest("police", "/api/auth/account-lookup/legacy-contact", {
      name: "동명이인",
      contactPhone: "010-9888-0007",
      password: "aMBIGUOUS!123",
    });
    assert(ambiguous.response.status === 409, "Ambiguous same-name accounts were automatically linked.");
    assert(ambiguous.data.code === "ACCOUNT_AMBIGUOUS", "Ambiguous account response did not require administrator help.");

    const browser = await chromium.launch({
      headless: true,
      args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto("http://police.localhost:3200/find-account", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "연락처 미등록 기존 회원 확인" }).click();
      await page.locator("#lookupName").fill("연락처복구");
      await page.locator("#lookupContactPhone").fill(legacyMissingPhone);
      await page.locator("#lookupPassword").fill("lEGACYcONTACT!123");
      await page.getByRole("button", { name: "연락처 등록 후 아이디 확인" }).click();
      await page.getByTestId("found-username").waitFor();
      assert(
        (await page.getByTestId("found-username").textContent()) === legacyMissingUsername,
        "Browser legacy contact registration returned an unexpected username."
      );
    } finally {
      await browser.close();
    }

    const updatedLegacy = await db.user.findUnique({ where: { phone: legacyMissingUsername } });
    assert(updatedLegacy?.contactPhone === normalizedLegacyPhone, "Legacy self-service did not persist the contact phone.");
    assert(
      updatedLegacy && (await passwordHashMatches("LeGaCyCoNtAcT!123", updatedLegacy.password)),
      "Legacy contact registration did not preserve case-insensitive password access."
    );

    const directLookup = await jsonRequest("police", "/api/auth/account-lookup/request", {
      name: "연락처복구",
      contactPhone: legacyMissingPhone,
    });
    assert(directLookup.response.status === 200, "Newly registered legacy contact did not work in direct ID lookup.");
    assert(directLookup.data.username === legacyMissingUsername, "Direct lookup returned the wrong legacy username.");

    const batchHash = await bcrypt.hash("batchlegacy!123", 10);
    await db.user.createMany({
      data: Array.from({ length: legacyBatchSize }, (_, index) => ({
        name: "대량회원",
        phone: `${legacyBatchPrefix}${String(index).padStart(3, "0")}`,
        contactPhone: "",
        email: null,
        password: batchHash,
      })),
    });

    const admin = await login("police", "010-0000-0000", "PoliceAdmin!123", true);
    try {
      const missingResponse = await admin.context.get(
        `/api/admin/users?contactStatus=missing&search=${encodeURIComponent("대량회원")}&limit=50`
      );
      const missing = (await missingResponse.json()) as {
        pagination?: { totalCount?: number; totalPages?: number };
        contactSummary?: { missingCount?: number };
      };
      assert(missingResponse.status() === 200, "Administrator missing-contact filter failed.");
      assert(missing.pagination?.totalCount === legacyBatchSize, "The 171-member legacy batch was not fully filterable.");
      assert((missing.pagination?.totalPages ?? 0) >= 4, "Missing-contact pagination did not cover the legacy batch.");
      assert((missing.contactSummary?.missingCount ?? 0) >= legacyBatchSize, "Missing-contact summary undercounted legacy members.");

      const adminUser = await db.user.findUnique({ where: { phone: legacyAdminUsername } });
      assert(adminUser, "Admin-assisted legacy fixture was not created.");
      const updateResponse = await admin.context.put(`/api/admin/users?id=${adminUser.id}`, {
        data: { contactPhone: legacyAdminPhone },
      });
      assert(updateResponse.status() === 200, "Administrator could not add a missing contact phone.");
      const updatedAdminUser = await db.user.findUnique({ where: { id: adminUser.id } });
      assert(updatedAdminUser?.contactPhone === normalizedAdminPhone, "Administrator contact update was not persisted.");

      const duplicateAdminUpdate = await admin.context.put(`/api/admin/users?id=${adminUser.id}`, {
        data: { contactPhone: normalizedRegisteredPhone },
      });
      const duplicateAdminBody = (await duplicateAdminUpdate.json()) as { code?: string };
      assert(duplicateAdminUpdate.status() === 409, "Administrator was allowed to save another member's contact.");
      assert(duplicateAdminBody.code === "CONTACT_EXISTS", "Administrator contact collision returned an unexpected code.");
    } finally {
      await admin.context.dispose();
    }
  } finally {
    await db.user.deleteMany({
      where: {
        OR: [
          { phone: { in: [legacyMissingUsername, legacyAdminUsername, "legacyambiguous815a", "legacyambiguous815b"] } },
          { phone: { startsWith: legacyBatchPrefix } },
        ],
      },
    });
    await db.$disconnect();
  }
}

async function verifyLegacyPoliceAccountLookupWithoutEmail() {
  const db = createDb("police");
  try {
    await db.user.deleteMany({ where: { phone: legacyPoliceUsername } });
    await db.user.create({
      data: {
        name: "기존회원",
        phone: legacyPoliceUsername,
        contactPhone: legacyPolicePhone.replaceAll("-", ""),
        email: null,
        password: await bcrypt.hash(legacyPolicePassword.toLowerCase(), 10),
      },
    });
    await db.user.create({
      data: {
        name: "초기회원",
        phone: earliestLegacyPolicePhone.replaceAll("-", ""),
        contactPhone: "",
        email: null,
        password: await bcrypt.hash(legacyPolicePassword.toLowerCase(), 10),
      },
    });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const lookup = await jsonRequest("police", "/api/auth/account-lookup/request", {
        name: "기존회원",
        contactPhone: legacyPolicePhone,
      });
      assert(lookup.response.status === 200, `Legacy account lookup failed on attempt ${attempt + 1}.`);
      assert(lookup.data.username === legacyPoliceUsername, "Legacy account lookup returned an unexpected username.");
      assert(!lookup.data.previewFile, "Legacy account lookup unexpectedly required an email preview.");
    }

    const earliestLookup = await jsonRequest("police", "/api/auth/account-lookup/request", {
      name: "초기회원",
      contactPhone: earliestLegacyPolicePhone,
    });
    assert(earliestLookup.response.status === 200, "Earliest legacy account lookup failed.");
    assert(
      earliestLookup.data.username === earliestLegacyPolicePhone.replaceAll("-", ""),
      "Earliest legacy phone login was not recovered."
    );
    const browser = await chromium.launch({
      headless: true,
      args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto("http://police.localhost:3200/find-account", { waitUntil: "networkidle" });
      await page.locator("#lookupName").fill("기존회원");
      await page.locator("#lookupContactPhone").fill(legacyPolicePhone);
      await page.getByRole("button", { name: "아이디 확인" }).click();
      await page.getByTestId("found-username").waitFor();
      assert(
        (await page.getByTestId("found-username").textContent()) === legacyPoliceUsername,
        "Browser legacy lookup returned an unexpected username."
      );
      assert((await page.locator("#lookupCode").count()) === 0, "Legacy lookup still required an email code.");
    } finally {
      await browser.close();
    }
  } finally {
    await db.user.deleteMany({
      where: { phone: { in: [legacyPoliceUsername, earliestLegacyPolicePhone.replaceAll("-", "")] } },
    });
    await db.$disconnect();
  }
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
      } else {
        await db.user.deleteMany({
          where: {
            phone: {
              in: [
                normalizedPoliceRegistrationUsername,
                "differentaudit815",
                legacyPoliceUsername,
                earliestLegacyPolicePhone.replaceAll("-", ""),
                legacyMissingUsername,
                legacyAdminUsername,
                "legacyambiguous815a",
                "legacyambiguous815b",
                legacyPhoneLoginContact.replaceAll("-", ""),
              ],
            },
          },
        });
        await db.user.deleteMany({ where: { phone: { startsWith: legacyBatchPrefix } } });
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
    const legacyPoliceLogin = await login("police", sharedIdentity, configs.police.originalPassword);
    await legacyPoliceLogin.context.dispose();
    const legacyPoliceCaseLogin = await login("police", sharedIdentity, configs.police.originalPassword.toLowerCase());
    await legacyPoliceCaseLogin.context.dispose();
    const legacyFireLogin = await login("fire", sharedIdentity, configs.fire.originalPassword);
    await legacyFireLogin.context.dispose();
    const legacyFireCaseLogin = await login("fire", sharedIdentity, configs.fire.originalPassword.toLowerCase());
    await legacyFireCaseLogin.context.dispose();

    await verifyFireRegistrationEmailRequirement();
    await verifyPoliceRegistrationAndAccountLookup();
    await verifyLegacyPoliceAccountLookupWithoutEmail();
    await verifyLegacyContactRegistrationAndAdminManagement();
    await requestAndConfirmEmailReset("police", configs.police.resetPassword);
    const [policeAfterReset, fireUnchanged] = await Promise.all([
      policeDb.user.findUnique({ where: { phone: sharedIdentity } }),
      fireDb.user.findUnique({ where: { phone: sharedIdentity } }),
    ]);
    assert(policeAfterReset && (await passwordHashMatches(configs.police.resetPassword, policeAfterReset.password)), "Police password was not changed.");
    assert(policeAfterReset.emailVerifiedAt, "Police recovery email was not marked verified.");
    assert(policeAfterReset.credentialVersion === 3, "Police credential version was not incremented for upgrade and reset.");
    assert(fireUnchanged && (await passwordHashMatches(configs.fire.originalPassword, fireUnchanged.password)), "Police reset changed the fire password.");
    const policeLogin = await login("police", sharedIdentity, configs.police.resetPassword);
    await policeLogin.context.dispose();

    await requestAndConfirmEmailReset("fire", configs.fire.resetPassword);
    const [policeStillReset, fireAfterReset] = await Promise.all([
      policeDb.user.findUnique({ where: { phone: sharedIdentity } }),
      fireDb.user.findUnique({ where: { phone: sharedIdentity } }),
    ]);
    assert(policeStillReset && (await passwordHashMatches(configs.police.resetPassword, policeStillReset.password)), "Fire reset changed the police password.");
    assert(fireAfterReset && (await passwordHashMatches(configs.fire.resetPassword, fireAfterReset.password)), "Fire password was not changed.");
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

    const report = {
      result: "passed",
      checks: [
        "legacy password automatic case-insensitive upgrade",
        "case-insensitive police username availability, registration rejection, and login",
        "police contact-phone duplicate prevention",
        "case-insensitive recovery-email duplicate prevention",
        "legacy phone-login account re-registration prevention",
        "direct police account lookup by name and phone without email",
        "browser-driven immediate account lookup and reset handoff",
        "legacy police account lookup without email",
        "earliest legacy phone login lookup without email or contact field",
        "account lookup without request rate limits",
        "account lookup creates no email token and returns not-found safely",
        "legacy missing-contact self-registration with name, password, and new phone",
        "legacy contact collision and ambiguous same-name account protection",
        "171-member missing-contact administrator filter and pagination",
        "administrator missing-contact update and duplicate rejection",
        "username availability and legacy contact recovery without request rate limits",
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
    };
    const evidenceFile = process.env.ACCOUNT_RECOVERY_EVIDENCE?.trim();
    if (evidenceFile) {
      const absoluteEvidenceFile = resolve(evidenceFile);
      mkdirSync(resolve(absoluteEvidenceFile, ".."), { recursive: true });
      writeFileSync(absoluteEvidenceFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await Promise.all([policeDb.$disconnect(), fireDb.$disconnect()]);
    await restoreSeedState();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
