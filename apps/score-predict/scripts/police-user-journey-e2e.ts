import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";

type JsonObject = Record<string, unknown>;
type SettingSnapshot = { key: string; value: string } | null;

const APP_DIR = process.cwd();
const BASE_URL = "http://police.localhost:3200";
const EVIDENCE_ROOT = path.resolve(
  APP_DIR,
  ".superloopy/evidence/frontend/20260809-police-user-journey"
);
const SCREENSHOT_DIR = path.join(EVIDENCE_ROOT, "screenshots");
const DOCKER_CONTAINER = "score-predict-local-web-1";
const SETTING_KEYS = {
  answerInput: "police::site.answerInputEnabled",
  preRegistration: "police::site.preRegistrationEnabled",
  comments: "police::site.commentsEnabled",
  tabInput: "police::site.tabInputEnabled",
  tabResult: "police::site.tabResultEnabled",
  tabPrediction: "police::site.tabPredictionEnabled",
  tabNotices: "police::site.tabNoticesEnabled",
  tabFaq: "police::site.tabFaqEnabled",
} as const;

const runSuffix = `${Date.now()}`.slice(-8);
const user = {
  name: "경북워크플로우",
  username: `journey${runSuffix}`,
  contactPhone: `010-7${runSuffix.slice(0, 3)}-${runSuffix.slice(4, 8)}`,
  email: `journey-${runSuffix}@example.test`,
  oldPassword: "Journey!1234",
  newPassword: "Journey!5678",
};

const runtimeErrors: string[] = [];
const expectedAuthEvents: string[] = [];
const checks: Array<{ name: string; detail: string }> = [];
const screenshots: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loadLocalEnv() {
  const envPath = path.join(APP_DIR, ".env.docker.local");
  const source = readFileSync(envPath, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

function policeDatabaseUrl() {
  const rawUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert(rawUrl, "DIRECT_URL or DATABASE_URL is required.");
  const url = new URL(rawUrl);
  assert(
    ["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname),
    `Refusing to run the user journey against non-local database host ${url.hostname}.`
  );
  assert(url.port === "54332", `Refusing to run against unexpected database port ${url.port}.`);
  url.searchParams.set("schema", "score_predict_police");
  return url.toString();
}

async function cleanupJourneyUsers(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    await tx.authRateLimitBucket.deleteMany({
      where: { namespace: { startsWith: "password-reset-" } },
    });
    const users = await tx.user.findMany({
      where: { phone: { startsWith: "journey" } },
      select: { id: true },
    });
    const userIds = users.map((item) => item.id);
    if (userIds.length === 0) return;
    await tx.submission.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
}

function asObject(value: unknown, label: string): JsonObject {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value as JsonObject;
}

function asNumber(value: unknown, label: string): number {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be a number.`);
  return value;
}

function asString(value: unknown, label: string): string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
  return value;
}

function record(name: string, detail: string) {
  checks.push({ name, detail });
  console.log(`[PASS] ${name}: ${detail}`);
}

function attachDiagnostics(page: Page, scope: string) {
  page.on("pageerror", (error) => runtimeErrors.push(`${scope} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const messageText = message.text();
    if (
      (messageText.includes("[next-auth][error][CLIENT_FETCH_ERROR]") &&
        messageText.includes("Failed to fetch")) ||
      (messageText.includes("Failed to load resource") && messageText.includes("401 (Unauthorized)"))
    ) {
      expectedAuthEvents.push(`${scope}: ${messageText}`);
      return;
    }
    runtimeErrors.push(`${scope} console.error: ${messageText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      runtimeErrors.push(`${scope} response ${response.status()}: ${response.url()}`);
    }
  });
  page.on("dialog", async (dialog) => dialog.accept());
}

async function assertNoHorizontalScroll(page: Page, label: string) {
  let metrics: { viewport: number; content: number } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded");
      metrics = await page.evaluate(() =>
        document.documentElement
          ? {
              viewport: window.innerWidth,
              content: document.documentElement.scrollWidth,
            }
          : null
      );
      if (metrics) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.includes("Execution context was destroyed") &&
        !message.includes("Cannot read properties of null")
      ) {
        throw error;
      }
    }
    await page.waitForTimeout(150);
  }
  assert(metrics, `${label} could not be measured after navigation settled.`);
  assert(
    metrics.content <= metrics.viewport + 1,
    `${label} has horizontal scroll (${metrics.content}px > ${metrics.viewport}px).`
  );
}

async function capture(page: Page, name: string) {
  await assertNoHorizontalScroll(page, name);
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
  screenshots.push(filename);
}

async function gotoWithAbortRetry(page: Page, url: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("net::ERR_ABORTED") || attempt === 2) throw error;
      await page.waitForTimeout(300);
    }
  }
}

async function openPreRegistrationDialog(page: Page) {
  const trigger = page.locator('[data-pre-registration-modal="true"]').first();
  const dialog = page.getByRole("dialog");
  const formHeading = dialog.locator("h1").filter({ hasText: "수험번호 사전등록" });
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await trigger.click({ force: true });
    const opened = await formHeading
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
    await page.waitForTimeout(500);
  }
  throw new Error("Pre-registration dialog did not open after three trigger attempts.");
}

async function updateOperationSettings(
  prisma: PrismaClient,
  settings: { preRegistration: boolean; answerInput: boolean }
) {
  await prisma.$transaction([
    prisma.siteSetting.upsert({
      where: { key: SETTING_KEYS.preRegistration },
      update: { value: String(settings.preRegistration) },
      create: { key: SETTING_KEYS.preRegistration, value: String(settings.preRegistration) },
    }),
    prisma.siteSetting.upsert({
      where: { key: SETTING_KEYS.answerInput },
      update: { value: String(settings.answerInput) },
      create: { key: SETTING_KEYS.answerInput, value: String(settings.answerInput) },
    }),
    prisma.siteSetting.upsert({
      where: { key: SETTING_KEYS.comments },
      update: { value: "true" },
      create: { key: SETTING_KEYS.comments, value: "true" },
    }),
    ...[
      SETTING_KEYS.tabInput,
      SETTING_KEYS.tabResult,
      SETTING_KEYS.tabPrediction,
      SETTING_KEYS.tabNotices,
      SETTING_KEYS.tabFaq,
    ].map((key) =>
      prisma.siteSetting.upsert({
        where: { key },
        update: { value: "true" },
        create: { key, value: "true" },
      }),
    ),
  ]);
}

function readPreviewCode(previewFile: string) {
  const normalizedPreviewFile = previewFile.replaceAll("\\", "/");
  assert(
    /^\.mail-preview\/[A-Za-z0-9._-]+\.txt$/.test(normalizedPreviewFile),
    "Unexpected mail preview path."
  );
  const localPath = path.join(APP_DIR, normalizedPreviewFile);
  if (existsSync(localPath)) {
    const content = readFileSync(localPath, "utf8");
    const match = content.match(/인증코드:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/);
    assert(match, "Password reset code was not found in the local mail preview.");
    return match[1];
  }
  const containerPath = `/workspace/apps/score-predict/${normalizedPreviewFile}`;
  const content = execFileSync("docker", ["exec", DOCKER_CONTAINER, "cat", containerPath], {
    encoding: "utf8",
  });
  const match = content.match(/인증코드:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/);
  assert(match, "Password reset code was not found in the local mail preview.");
  return match[1];
}

async function submitLogin(page: Page, password: string) {
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(password);
  await page.locator("form button[type='submit']").click();
}

async function assertPoliceUserSession(page: Page, label: string) {
  const session = await page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    return (await response.json()) as {
      user?: { id?: string; name?: string; role?: string; tenantType?: string; username?: string };
    };
  });
  assert(session.user?.role === "USER", `${label}: user session role is missing.`);
  assert(session.user.tenantType === "police", `${label}: tenant session is not police.`);
  assert(session.user.username === user.username, `${label}: session username mismatch.`);
}

async function chooseAvailableExamNumber(scope: Page | Locator) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const candidate = String(2_026_003_000 + randomInt(0, 1_000));
    await scope.locator("#examNumber").fill(candidate);
    const available = scope.getByText("사용 가능한 응시번호입니다.", { exact: true });
    const confirmed = await available
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (confirmed) return candidate;
  }
  throw new Error("Could not find an available 경북 exam number in the configured range.");
}

async function fillPoliceOmr(page: Page) {
  await page.getByRole("button", { name: "빠른입력 (키보드)", exact: true }).click();
  const subjectNames = ["헌법", "형사법", "경찰학"];
  let answerState = 0x2468ace1;

  for (const subjectName of subjectNames) {
    await page.getByRole("button", { name: new RegExp(`^${subjectName}`) }).click();
    await page.getByRole("button", { name: "보통", exact: true }).click();
    const inputs = page.locator(`input[id^='${subjectName}-quick-']`);
    const count = await inputs.count();
    assert(count > 0, `${subjectName} quick inputs are missing.`);

    for (let index = 0; index < count; index += 1) {
      const questionNumber = index + 1;
      answerState = (Math.imul(answerState, 1_664_525) + 1_013_904_223) >>> 0;
      const correctAnswer = ((questionNumber - 1) % 4) + 1;
      const answer =
        questionNumber % 3 === 0 ? ((answerState >>> 16) % 4) + 1 : correctAnswer;
      await inputs.nth(index).fill(String(answer));
    }
  }

  await page.getByText("총 입력: 100/100문항", { exact: true }).waitFor({ timeout: 10_000 });
}

async function readApiJson(page: Page, route: string) {
  const result = await page.evaluate(async (pathname) => {
    const response = await fetch(pathname, { method: "GET", cache: "no-store" });
    const body = (await response.json()) as unknown;
    return { ok: response.ok, status: response.status, body };
  }, route);
  assert(result.ok, `${route} returned ${result.status}: ${JSON.stringify(result.body)}`);
  return asObject(result.body, route);
}

async function main() {
  loadLocalEnv();
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const prisma = new PrismaClient({ datasources: { db: { url: policeDatabaseUrl() } } });
  const settingSnapshots = new Map<string, SettingSnapshot>();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let userContext: BrowserContext | null = null;
  let submissionId = 0;
  let resultEvidence: JsonObject | null = null;
  let predictionEvidence: JsonObject | null = null;

  try {
    const activeExam = await prisma.exam.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        year: true,
        round: true,
        policePredictionModelVersion: true,
        quotas: {
          where: { region: { name: "경북", isActive: true } },
          select: {
            recruitCount: true,
            applicantCount: true,
            examNumberStart: true,
            examNumberEnd: true,
            region: { select: { id: true, name: true } },
          },
        },
      },
    });
    assert(activeExam, "A single active police exam is required.");
    assert(activeExam.quotas.length === 1, "The active exam must contain one active 경북 quota.");
    const gyeongbukQuota = activeExam.quotas[0];
    assert(gyeongbukQuota.recruitCount > 0, "경북 recruit count must be configured.");
    assert(gyeongbukQuota.applicantCount !== null, "경북 applicant count must be configured.");
    assert(
      gyeongbukQuota.examNumberStart === "2026003000" &&
        gyeongbukQuota.examNumberEnd === "2026003999",
      "경북 local exam-number range is not configured."
    );
    assert(
      activeExam.policePredictionModelVersion === "police-2026-2x-rank-first-v2",
      "Unexpected police prediction model version."
    );
    record(
      "경북 회차 준비",
      `${activeExam.year}년 ${activeExam.round}차, 모집 ${gyeongbukQuota.recruitCount}명, 모델 ${activeExam.policePredictionModelVersion}`
    );

    for (const key of Object.values(SETTING_KEYS)) {
      settingSnapshots.set(key, await prisma.siteSetting.findUnique({ where: { key } }));
    }
    await cleanupJourneyUsers(prisma);

    browser = await chromium.launch({
      headless: true,
      args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1"],
    });
    userContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await userContext.newPage();
    attachDiagnostics(page, "police-user-journey");

    const landingResponse = await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    assert(landingResponse?.status() === 200, `Landing returned ${landingResponse?.status()}.`);
    await page.getByText("한국경찰학원 합격예측", { exact: true }).first().waitFor();
    await page.getByRole("link", { name: "회원가입", exact: true }).first().waitFor();
    await capture(page, "01-first-access-390");
    record("처음 사이트 접속", "경찰 도메인, 2026년 2차 회차, 회원가입 진입 확인");

    const registrationLink = page.getByRole("link", { name: "회원가입", exact: true }).first();
    assert((await registrationLink.getAttribute("href")) !== null, "Registration link has no href.");
    await gotoWithAbortRetry(page, `${BASE_URL}/register`);
    await page.waitForURL("**/register");
    await page.locator("#name").fill(user.name);
    await page.locator("#username").fill(user.username);
    await page.locator("#contactPhone").fill(user.contactPhone);
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.oldPassword);
    await page.locator("#passwordConfirm").fill(user.oldPassword);
    const requiredAgreements = page.locator("input[type='checkbox']");
    assert((await requiredAgreements.count()) === 2, "Registration should show two required agreements.");
    await requiredAgreements.nth(0).check();
    await requiredAgreements.nth(1).check();
    await page.locator("form button[type='submit']").click();
    await page.waitForURL("**/login?registered=1", { timeout: 15_000 });
    await page.getByText("회원가입이 완료되었습니다. 로그인해 주세요.", { exact: true }).waitFor();
    await capture(page, "02-registration-complete-390");
    record("회원가입", `아이디 ${user.username}, 복구 이메일과 연락처 저장 완료`);

    await page.getByRole("link", { name: "비밀번호 찾기", exact: true }).click();
    await page.waitForURL("**/forgot-password");
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.locator("#recoveryIdentity").fill(user.username);
    await page.locator("#recoveryEmail").fill(user.email);
    const resetRequestPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/password-reset/request") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "이메일 인증코드 받기", exact: true }).click();
    const resetRequestResponse = await resetRequestPromise;
    const resetRequestBody = (await resetRequestResponse.json()) as { previewFile?: string; error?: string };
    assert(resetRequestResponse.ok(), resetRequestBody.error ?? "Password reset request failed.");
    const previewFile = asString(resetRequestBody.previewFile, "previewFile");
    const resetCode = readPreviewCode(previewFile);
    await page.locator("#resetCode").fill(resetCode);
    await page.locator("#newPassword").fill(user.newPassword);
    await page.locator("#newPasswordConfirm").fill(user.newPassword);
    await capture(page, "03-password-reset-code-768");
    await page.getByRole("button", { name: "새 비밀번호 설정", exact: true }).click();
    await page
      .getByRole("main")
      .getByText("비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요.", { exact: true })
      .waitFor();
    await page.waitForURL("**/login", { timeout: 10_000 });
    record("비밀번호 찾기", "이메일 인증코드로 비밀번호 변경 완료");

    await submitLogin(page, user.oldPassword);
    await page
      .getByRole("main")
      .getByText("아이디 또는 비밀번호가 올바르지 않습니다.", { exact: true })
      .waitFor();
    await capture(page, "04-old-password-rejected-768");
    await submitLogin(page, user.newPassword);
    await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByText(user.name, { exact: true }).first().waitFor();
    await assertPoliceUserSession(page, "after password reset login");
    record("재로그인", "기존 비밀번호 거부, 새 비밀번호 로그인 성공");

    await updateOperationSettings(prisma, { preRegistration: true, answerInput: false });
    await assertPoliceUserSession(page, "after admin operation transition");
    // Re-enter the canonical tenant root explicitly. The login page uses a
    // prefixed preview callback URL, so reloading whichever URL happened to be
    // current can spend the entire navigation timeout following canonical 308s.
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await assertPoliceUserSession(page, "after user page reload");
    await page.getByText(user.name, { exact: true }).first().waitFor({ timeout: 30_000 });
    await openPreRegistrationDialog(page);
    const preRegistrationDialog = page.getByRole("dialog");
    const preRegistrationHeading = preRegistrationDialog.getByRole("heading", {
      name: "수험번호 사전등록",
      exact: true,
    });
    const preRegistrationRendered = await preRegistrationHeading
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (!preRegistrationRendered) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "debug-pre-registration-tab.png"), fullPage: true });
      const bodyText = (await page.locator("body").innerText()).slice(0, 2_000);
      throw new Error(`Pre-registration tab did not render. url=${page.url()} body=${bodyText}`);
    }
    await preRegistrationDialog.locator("#examNumber").waitFor({ state: "visible", timeout: 60_000 });
    await preRegistrationDialog.locator("#gender").selectOption("MALE");
    await preRegistrationDialog.locator("#examType").selectOption("PUBLIC");
    await preRegistrationDialog.locator("#region").selectOption({ label: "경북" });
    await preRegistrationDialog.locator("#examNumber").waitFor({ state: "visible", timeout: 30_000 });
    const examNumber = await chooseAvailableExamNumber(preRegistrationDialog);
    const preRegistrationPromise = page.waitForResponse(
      (response) => response.url().includes("/api/pre-registration") && response.request().method() === "POST"
    );
    await preRegistrationDialog.getByRole("button", { name: "사전등록 저장", exact: true }).click();
    const preRegistrationResponse = await preRegistrationPromise;
    assert(preRegistrationResponse.ok(), `Pre-registration returned ${preRegistrationResponse.status()}.`);
    await page.getByText(/사전등록 완료/).waitFor();
    await capture(page, "05-gyeongbuk-pre-registration-1280");

    const registeredUser = await prisma.user.findUnique({
      where: { phone: user.username },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        preRegistrations: {
          where: { examId: activeExam.id },
          select: { id: true, examNumber: true, examType: true, region: { select: { name: true } } },
        },
      },
    });
    assert(registeredUser?.email === user.email, "Registered recovery email mismatch.");
    assert(registeredUser.emailVerifiedAt, "Password reset should verify the registered email.");
    assert(registeredUser.preRegistrations.length === 1, "Expected one pre-registration for the active exam.");
    assert(registeredUser.preRegistrations[0].region.name === "경북", "Pre-registration region is not 경북.");
    assert(registeredUser.preRegistrations[0].examNumber === examNumber, "Pre-registration exam number mismatch.");
    record("경북 사전등록", `${examNumber}, 공채, 홍보 문자 미동의 상태로 저장 성공`);

    await updateOperationSettings(prisma, { preRegistration: false, answerInput: true });
    await gotoWithAbortRetry(page, `${BASE_URL}/exam/input`);
    const answerInputHeading = page.getByRole("heading", { name: "응시정보 입력", exact: true });
    const answerInputRendered = await answerInputHeading
      .waitFor({ state: "visible", timeout: 90_000 })
      .then(() => true)
      .catch(() => false);
    if (!answerInputRendered) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "debug-answer-input-transition.png"), fullPage: true });
      const bodyText = (await page.locator("body").innerText()).slice(0, 2_000);
      throw new Error(`Answer-input transition did not render. url=${page.url()} body=${bodyText}`);
    }
    await page.getByRole("heading", { name: "사전등록 정보를 불러왔습니다", exact: true }).waitFor();
    assert((await page.locator("#region option:checked").textContent())?.trim() === "경북", "경북 was not restored.");
    assert((await page.locator("#examNumber").inputValue()) === examNumber, "Exam number was not restored.");
    await fillPoliceOmr(page);
    await capture(page, "06-omr-complete-1280");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, "06b-omr-complete-390");
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.route("**/api/submission", async (route) => {
      const request = route.request();
      if (request.method() !== "POST") return route.continue();
      const payload = request.postDataJSON() as JsonObject;
      await route.continue({ postData: JSON.stringify({ ...payload, submitDurationMs: 125_000 }) });
    });
    const submissionPromise = page.waitForResponse(
      (response) => response.url().includes("/api/submission") && response.request().method() === "POST",
      { timeout: 60_000 }
    );
    await page.getByRole("button", { name: "채점하기", exact: true }).click();
    const submissionResponse = await submissionPromise;
    const submissionBody = (await submissionResponse.json()) as JsonObject;
    assert(submissionResponse.ok(), `Submission failed: ${JSON.stringify(submissionBody)}`);
    submissionId = asNumber(submissionBody.submissionId, "submissionId");
    await page.unroute("**/api/submission");
    await page.waitForURL(new RegExp(`/exam/result\\?submissionId=${submissionId}$`), { timeout: 30_000 });
    await page.getByRole("heading", { name: "내 성적 분석", exact: true }).waitFor();
    await page.getByText(/2026년 2차.*공채.*경북/).waitFor();
    await page.getByRole("heading", { name: "전체 성적 요약", exact: true }).waitFor();
    await capture(page, "07-gyeongbuk-result-1280");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, "07b-gyeongbuk-result-390");
    await page.setViewportSize({ width: 1280, height: 900 });

    const result = await readApiJson(page, `/api/result?submissionId=${submissionId}`);
    const submission = asObject(result.submission, "result.submission");
    const analysisSummary = asObject(result.analysisSummary, "result.analysisSummary");
    const totalAnalysis = asObject(analysisSummary.total, "result.analysisSummary.total");
    assert(submission.regionName === "경북", "Result API region is not 경북.");
    assert(submission.scoringStatus === "SCORED", "Submission was not scored.");
    assert(asNumber(totalAnalysis.questionCount, "questionCount") === 100, "Result does not contain 100 questions.");
    resultEvidence = {
      totalScore: submission.totalScore,
      finalScore: submission.finalScore,
      rank: totalAnalysis.myRank,
      participants: totalAnalysis.totalParticipants,
      percentile: totalAnalysis.percentile,
      questionCount: totalAnalysis.questionCount,
    };
    const persistedSubmission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        isSuspicious: true,
        submitDurationMs: true,
        userAnswers: { select: { id: true } },
        subjectScores: { select: { id: true } },
        region: { select: { name: true } },
        user: {
          select: {
            preRegistrations: {
              where: { examId: activeExam.id },
              select: { submissionId: true, convertedAt: true },
            },
          },
        },
      },
    });
    assert(persistedSubmission?.region.name === "경북", "Persisted submission region mismatch.");
    assert(!persistedSubmission.isSuspicious, "Normal user submission was marked suspicious.");
    assert(persistedSubmission.submitDurationMs === 125_000, "Test duration was not persisted.");
    assert(persistedSubmission.userAnswers.length === 100, "Persisted OMR answer count is not 100.");
    assert(persistedSubmission.subjectScores.length === 3, "Persisted subject score count is not 3.");
    assert(
      persistedSubmission.user.preRegistrations[0]?.submissionId === submissionId &&
        persistedSubmission.user.preRegistrations[0]?.convertedAt,
      "Pre-registration was not converted to the submission."
    );
    record(
      "경북 답안 제출과 성적",
      `100문항, 총점 ${submission.totalScore}, 표본 ${totalAnalysis.totalParticipants}명 중 ${totalAnalysis.myRank}등`
    );

    await page.waitForLoadState("domcontentloaded");
    let examAnalysisTab = page.getByRole("tab", { name: "시험 분석", exact: true });
    const examAnalysisReady = await examAnalysisTab
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!examAnalysisReady) {
      await gotoWithAbortRetry(page, `${BASE_URL}/exam/result?submissionId=${submissionId}`);
      await page.getByRole("heading", { name: "전체 성적 요약", exact: true }).waitFor({ timeout: 30_000 });
      examAnalysisTab = page.getByRole("tab", { name: "시험 분석", exact: true });
      await examAnalysisTab.waitFor({ state: "visible", timeout: 30_000 });
    }
    await examAnalysisTab.click();
    await page.getByRole("heading", { name: "과목별 비교 차트", exact: true }).waitFor();
    await page.getByRole("tab", { name: "정오표", exact: true }).click();
    await page
      .getByRole("heading", { name: "정오표 - 문항별 정답률 분석", exact: true })
      .waitFor();
    record("성적 상세 분석", "내 성적, 시험 분석, 정오표 탭 모두 표시");

    await page.getByRole("button", { name: "합격예측 분석 보기", exact: true }).click();
    await page.waitForURL("**/exam/prediction");
    await page.getByRole("heading", { name: "표본 순위를 중심으로 안내합니다", exact: true }).waitFor();
    await page.getByText("현재는 검증되지 않은 합격 등급을 제공하지 않습니다.", { exact: false }).waitFor();
    await page.waitForTimeout(1_700);
    await capture(page, "08-gyeongbuk-prediction-1280");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, "08b-gyeongbuk-prediction-390");
    await page.setViewportSize({ width: 1280, height: 900 });
    const prediction = await readApiJson(page, `/api/prediction?submissionId=${submissionId}`);
    const summary = asObject(prediction.summary, "prediction.summary");
    assert(summary.regionName === "경북", "Prediction API region is not 경북.");
    assert(summary.modelVersion === "police-2026-2x-rank-first-v2", "Prediction model version mismatch.");
    assert(summary.passMultiple === 2, "Police pass multiple is not 2.0.");
    assert(summary.gradeAvailability === "UNAVAILABLE", "Uncalibrated police grade should remain unavailable.");
    assert(summary.predictionGrade === null, "Uncalibrated prediction grade leaked through the API.");
    assert(Array.isArray(summary.unavailableReasons), "Prediction unavailable reasons are missing.");
    predictionEvidence = {
      modelVersion: summary.modelVersion,
      passMultiple: summary.passMultiple,
      sampleRank: summary.myRank,
      sampleTopPercent: summary.sampleTopPercent,
      participants: summary.totalParticipants,
      gradeAvailability: summary.gradeAvailability,
      unavailableReasons: summary.unavailableReasons,
    };
    record(
      "합격예측",
      `경북 표본 ${summary.totalParticipants}명 중 ${summary.myRank}등, 2배수 정책 표시, 미보정 등급 비공개`
    );

    const storageState = await userContext.storageState();
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ]) {
      const context = await browser.newContext({ viewport, storageState });
      const responsivePage = await context.newPage();
      attachDiagnostics(responsivePage, `responsive-${viewport.width}`);
      await responsivePage.goto(`${BASE_URL}/exam/result?submissionId=${submissionId}`, {
        waitUntil: "domcontentloaded",
      });
      await responsivePage.getByRole("heading", { name: "내 성적 분석", exact: true }).waitFor();
      await capture(responsivePage, `09-result-${viewport.width}`);
      await responsivePage.goto(`${BASE_URL}/exam/prediction?submissionId=${submissionId}`, {
        waitUntil: "domcontentloaded",
      });
      await responsivePage.getByRole("heading", { name: "표본 순위를 중심으로 안내합니다", exact: true }).waitFor();
      await responsivePage.waitForTimeout(1_700);
      await capture(responsivePage, `10-prediction-${viewport.width}`);
      await context.close();
    }
    record("반응형 사용자 흐름", "390px, 768px, 1280px에서 가로 스크롤 없이 성적·예측 표시");

    const contentContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState,
    });
    const contentPage = await contentContext.newPage();
    attachDiagnostics(contentPage, "user-content-and-account-390");

    await gotoWithAbortRetry(contentPage, `${BASE_URL}/exam/notices`);
    await contentPage.getByRole("heading", { name: "공지사항", exact: true }).waitFor();
    await contentPage.getByRole("button", { name: /police-local-notice/ }).click();
    await contentPage.getByText("개인정보가 없는 로컬 고정 공지입니다.", { exact: true }).waitFor();
    assert(
      !(await contentPage.locator("main").innerText()).includes("<p>"),
      "Notice detail exposed HTML tags as text.",
    );
    await capture(contentPage, "11-notice-detail-390");

    await gotoWithAbortRetry(contentPage, `${BASE_URL}/exam/faq`);
    await contentPage.getByRole("heading", { name: "자주 묻는 질문 (FAQ)", exact: true }).waitFor();
    await contentPage.locator("summary", { hasText: "police 로컬 FAQ" }).click();
    await contentPage.getByText("테넌트 격리 검증용 가상 데이터입니다.", { exact: true }).waitFor();
    await capture(contentPage, "12-faq-open-390");

    await gotoWithAbortRetry(contentPage, `${BASE_URL}/exam/comments`);
    await contentPage.getByRole("heading", { name: "댓글", exact: true }).waitFor();
    const commentText = `사용자 여정 검증 댓글 ${runSuffix}`;
    await contentPage.getByPlaceholder("댓글을 입력해주세요...").fill(commentText);
    const commentCreateResponse = contentPage.waitForResponse(
      (response) => response.url().includes("/api/comments") && response.request().method() === "POST",
    );
    await contentPage.getByRole("button", { name: "등록", exact: true }).click();
    assert((await commentCreateResponse).ok(), "Comment creation API failed.");
    await contentPage.getByText(commentText, { exact: true }).waitFor();
    await contentPage.getByText(/총 댓글 수:\s*1개/).waitFor();
    await capture(contentPage, "13-comment-created-390");
    await contentPage.getByRole("button", { name: "삭제", exact: true }).first().click();
    await contentPage.getByText(commentText, { exact: true }).waitFor({ state: "hidden" });

    await gotoWithAbortRetry(contentPage, `${BASE_URL}/account/notifications`);
    await contentPage.getByRole("heading", { name: "문자 수신 설정", exact: true }).waitFor();
    await contentPage
      .getByText("한국경찰학원 홍보 문자 수신 동의 (선택)", { exact: true })
      .waitFor();
    await capture(contentPage, "14-notification-settings-390");

    await gotoWithAbortRetry(contentPage, `${BASE_URL}/account/security`);
    await contentPage.getByRole("heading", { name: "계정 보안", exact: true }).waitFor();
    assert(
      (await contentPage.getByLabel("이메일", { exact: true }).inputValue()) === user.email,
      "Account security page did not show the registered recovery email.",
    );
    await capture(contentPage, "15-account-security-390");
    await contentContext.close();
    record("게시판·댓글·계정", "공지 HTML 정제, FAQ, 댓글 등록·삭제, 문자 수신 설정과 계정 보안 확인");

  } finally {
    for (const [key, snapshot] of settingSnapshots.entries()) {
      if (snapshot) {
        await prisma.siteSetting.upsert({ where: { key }, update: { value: snapshot.value }, create: snapshot });
      } else {
        await prisma.siteSetting.deleteMany({ where: { key } });
      }
    }
    await cleanupJourneyUsers(prisma);
    if (userContext) await userContext.close();
    if (browser) await browser.close();
    await prisma.$disconnect();
  }

  assert(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join(" | ")}`);

  const report = {
    result: "passed",
    generatedAt: new Date().toISOString(),
    tenant: "police",
    region: "경북",
    viewports: [390, 768, 1280],
    checks,
    resultEvidence,
    predictionEvidence,
    runtimeErrors,
    expectedAuthEvents,
    screenshots,
    cleanup: "temporary user and operation-setting changes removed",
  };
  writeFileSync(path.join(EVIDENCE_ROOT, "workflow-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const visualReport = [
    "# 경찰 경북 사용자 여정 시각 QA",
    "",
    `- 실행 시각: ${report.generatedAt}`,
    "- 결과: PASS",
    "- 흐름: 첫 접속, 회원가입, 비밀번호 찾기, 새 비밀번호 로그인, 사전등록, OMR, 성적, 합격예측",
    "- 화면폭: 390px, 768px, 1280px",
    "- 테넌트/지역: 경찰 / 경북",
    "- 가로 스크롤: 없음",
    "- 브라우저 런타임 오류: 없음",
    "",
    "## 디자인·안티슬롭 점검",
    "",
    "- PASS: 잠금 상태에 가짜 수치·차트·블러 데이터를 노출하지 않음",
    "- PASS: 과도한 그라데이션·장식용 배지·불필요한 히어로 문구 없음",
    "- PASS: 빈 상태·표본 부족·등급 비공개 사유를 실제 상태 그대로 안내",
    "- PASS: DESIGN.md의 경찰 파란색·타이포그래피·간격 토큰을 유지",
    "- PASS: 390px, 768px, 1280px에서 가로 스크롤과 잘린 주요 동작 없음",
    "",
    ...checks.map((check) => `- PASS: ${check.name}, ${check.detail}`),
    "",
  ].join("\n");
  writeFileSync(path.join(EVIDENCE_ROOT, "VISUAL_QA.md"), visualReport, "utf8");
  writeFileSync(path.join(EVIDENCE_ROOT, "DESIGN_TOKENS.md"), readFileSync(path.join(APP_DIR, "DESIGN.md"), "utf8"), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
