import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startServer as startNextServer } from "next/dist/server/lib/start-server";
import { chromium, devices, type APIRequestContext, type Browser, type BrowserContext, type Page } from "playwright";

type StepResult = {
  name: string;
  ok: boolean;
  detail?: string;
  error?: string;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type UserIdentity = {
  name: string;
  phone: string;
  password: string;
};

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3200";
const SERVER_MODE = process.env.E2E_SERVER_MODE === "dev" ? "dev" : "prod";
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "010-0000-0000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin1234!";
const MIN_SUBMIT_DURATION_MS = Number(process.env.UI_MIN_SUBMIT_DURATION_MS ?? "121000");
const RUN_TAG = new Date().toISOString().replace(/[:.]/g, "-");
const ARTIFACT_ROOT = process.env.UI_E2E_ARTIFACT_DIR ?? path.join("artifacts", "ui-e2e", RUN_TAG);
const SCREENSHOT_DIR = path.join(ARTIFACT_ROOT, "screenshots");
const VIDEO_DIR = path.join(ARTIFACT_ROOT, "videos");

const results: StepResult[] = [];
const runtimeErrors: string[] = [];

let serverStarted = false;
let browser: Browser | null = null;

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function asRecord(value: JsonValue, context: string): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} is not an object`);
  }
  return value as Record<string, JsonValue>;
}

function asArray(value: JsonValue, context: string): JsonValue[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} is not an array`);
  }
  return value;
}

function asNumber(value: JsonValue, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} is not a number`);
  }
  return value;
}

function asBoolean(value: JsonValue, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} is not a boolean`);
  }
  return value;
}

async function isBaseUrlReachable(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL, { redirect: "manual" });
    return response.status > 0;
  } catch {
    return false;
  }
}

function makeRandomPhone(): string {
  const block1 = String(randomInt(1000, 10000));
  const block2 = String(randomInt(1000, 10000));
  return `010-${block1}-${block2}`;
}

function buildCandidateExamNumber(gender: "MALE" | "FEMALE"): string {
  const prefix = String(randomInt(0, 1000)).padStart(3, "0");
  const genderDigit = gender === "FEMALE" ? "2" : "1";
  const typeCode = "01"; // PUBLIC
  const suffix = String(randomInt(0, 10000)).padStart(4, "0");
  return `${prefix}${genderDigit}${typeCode}${suffix}`;
}

function pickUserAnswer(correctAnswer: number): number {
  // Keep high accuracy while avoiding suspicious fixed patterns.
  if (randomInt(0, 100) < 85) {
    return correctAnswer;
  }

  let wrong = randomInt(1, 5);
  while (wrong === correctAnswer) {
    wrong = randomInt(1, 5);
  }
  return wrong;
}

async function runStep(name: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? undefined });
    if (detail) {
      console.log(`[PASS] ${name} - ${detail}`);
    } else {
      console.log(`[PASS] ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, error: message });
    console.error(`[FAIL] ${name}`);
    console.error(message);
    throw error;
  }
}

function printSummary(): void {
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;

  console.log("\n=== UI E2E SUMMARY ===");
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  for (const item of results) {
    if (item.ok) {
      console.log(`- PASS: ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
    } else {
      console.log(`- FAIL: ${item.name} -> ${item.error ?? "unknown error"}`);
    }
  }

  if (runtimeErrors.length > 0) {
    console.log("\nCaptured browser runtime errors:");
    for (const error of runtimeErrors) {
      console.log(`- ${error}`);
    }
  }

  console.log(`\nArtifacts: ${ARTIFACT_ROOT}`);
}

async function startServer(): Promise<void> {
  if (serverStarted) return;
  if (await isBaseUrlReachable()) {
    serverStarted = true;
    return;
  }
  const parsed = new URL(BASE_URL);
  const port = parsed.port ? Number(parsed.port) : 3200;
  await startNextServer({
    dir: process.cwd(),
    port,
    isDev: SERVER_MODE === "dev",
    allowRetry: false,
  });
  serverStarted = true;
}

async function stopServer(): Promise<void> {
  serverStarted = false;
}

function initArtifacts(): void {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  mkdirSync(path.join(VIDEO_DIR, "user"), { recursive: true });
  mkdirSync(path.join(VIDEO_DIR, "admin"), { recursive: true });
  mkdirSync(path.join(VIDEO_DIR, "mobile"), { recursive: true });
}

function sanitizeArtifactName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function captureScreenshot(page: Page, label: string): Promise<void> {
  const filename = `${sanitizeArtifactName(label)}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
}

function writeArtifactSummary(): void {
  const summaryPath = path.join(ARTIFACT_ROOT, "summary.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    serverMode: SERVER_MODE,
    results,
    runtimeErrors,
  };
  writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function attachPageDiagnostics(page: Page, scope: string): void {
  page.on("pageerror", (error) => {
    runtimeErrors.push(`[${scope}] pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(`[${scope}] console.error: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() === 404) {
      runtimeErrors.push(`[${scope}] response404: ${response.url()}`);
    }
  });
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
}

async function fetchJson(request: APIRequestContext, path: string): Promise<{ status: number; json: JsonValue }> {
  const target = path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `${BASE_URL}${path}`;
  const response = await request.get(target);
  const text = await response.text();
  let json: JsonValue = null;
  if (text.length > 0) {
    json = JSON.parse(text) as JsonValue;
  }
  return { status: response.status(), json };
}

async function findAvailableExamNumber(
  request: APIRequestContext,
  examId: number,
  regionId: number,
  gender: "MALE" | "FEMALE"
): Promise<string> {
  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const examNumber =
      rangeStart !== null && rangeEnd !== null
        ? String(randomInt(rangeStart, rangeEnd + 1)).padStart(10, "0")
        : buildCandidateExamNumber(gender);

    const params = new URLSearchParams({
      examId: String(examId),
      regionId: String(regionId),
      examType: "PUBLIC",
      gender,
      examNumber,
    });

    const { status, json } = await fetchJson(request, `/api/exam-number/check?${params.toString()}`);
    assertCondition(status === 200, `exam-number/check failed: status=${status}`);
    const body = asRecord(json, "exam-number/check body");
    const available = asBoolean(body.available ?? null, "available");
    if (available) {
      return examNumber;
    }

    const reason = typeof body.reason === "string" ? body.reason : "";
    const digits = reason.match(/\d{10}/g);
    if (digits && digits.length >= 2) {
      const start = Number(digits[0]);
      const end = Number(digits[1]);
      if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end) {
        rangeStart = start;
        rangeEnd = end;
      }
    }
  }

  throw new Error("Could not find an available exam number");
}

async function waitForIdChange(page: Page, previousId: string | null, timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const currentId = await page.locator("input[id*='-quick-']").first().getAttribute("id");
    if (currentId && previousId && currentId !== previousId) {
      return;
    }
    await page.waitForTimeout(120);
  }
  throw new Error("Timed out waiting for next subject quick-input block");
}

async function switchToQuickMode(page: Page): Promise<void> {
  if ((await page.locator("input[id*='-quick-']").count()) > 0) {
    return;
  }

  const groups = page.locator("div.inline-flex.overflow-hidden.rounded-md.border");
  const groupCount = await groups.count();
  for (let i = 0; i < groupCount; i += 1) {
    const buttons = groups.nth(i).locator("button");
    if ((await buttons.count()) === 2) {
      await buttons.first().click();
      await page.waitForTimeout(200);
      if ((await page.locator("input[id*='-quick-']").count()) > 0) {
        return;
      }
    }
  }

  throw new Error("Could not switch OMR input mode to quick");
}

async function setCurrentSubjectDifficulty(page: Page): Promise<void> {
  const groups = page.locator("div.inline-flex.overflow-hidden.rounded-md.border");
  const groupCount = await groups.count();
  for (let i = 0; i < groupCount; i += 1) {
    const buttons = groups.nth(i).locator("button");
    if ((await buttons.count()) === 5) {
      await buttons.nth(2).click();
      return;
    }
  }

  throw new Error("Could not find difficulty selector");
}

async function fillCurrentSubjectQuickInputs(page: Page): Promise<{ firstId: string | null; questionCount: number }> {
  const inputs = page.locator("input[id*='-quick-']");
  const questionCount = await inputs.count();
  assertCondition(questionCount > 0, "No quick-input answer cells found");

  const firstId = await inputs.first().getAttribute("id");
  for (let q = 1; q <= questionCount; q += 1) {
    const correctAnswer = ((q - 1) % 4) + 1;
    const answer = pickUserAnswer(correctAnswer);
    await inputs.nth(q - 1).fill(String(answer));
  }
  return { firstId, questionCount };
}

async function registerViaUi(page: Page, user: UserIdentity): Promise<void> {
  await page.goto(`${BASE_URL}/register`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#name");

  await page.fill("#name", user.name);
  await page.fill("#phone", user.phone);
  await page.fill("#password", user.password);
  await page.fill("#passwordConfirm", user.password);
  await page.check("#allAgreed");

  const submitButton = page.locator("form button[type='submit']");
  await submitButton.click();

  try {
    await page.waitForURL("**/login", { timeout: 5000 });
    return;
  } catch {
    // Some tenant flows show recovery codes first and navigate to login only after confirmation.
  }

  const recoveryCodeTitle = page.getByText("복구코드 (1회 표시)");
  if (await recoveryCodeTitle.isVisible({ timeout: 10000 }).catch(() => false)) {
    const recoveryCodeCount = await page.locator("code").count();
    assertCondition(recoveryCodeCount > 0, "Recovery code screen rendered without codes");
    await page.getByRole("button", { name: "로그인으로 이동" }).click();
    await page.waitForURL("**/login", { timeout: 15000 });
    return;
  }

  throw new Error("Registration did not redirect to login or show the recovery-code success state");
}

async function loginViaUi(page: Page, phone: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#phone");

  await page.fill("#phone", phone);
  await page.fill("#password", password);
  await page.locator("form button[type='submit']").click();

  await page.waitForURL((url) => {
    const value = url.toString();
    return !value.includes("/login");
  }, { timeout: 15000 });
}

async function openAndEnsure200(page: Page, path: string): Promise<void> {
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 0;
  assertCondition(status === 200, `${path} expected 200, got ${status}`);
  await page.waitForTimeout(120);
}

async function assertNoHorizontalOverflow(page: Page, path: string): Promise<void> {
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 0;
  assertCondition(status === 200, `${path} expected 200, got ${status}`);

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  assertCondition(
    metrics.scrollWidth <= metrics.innerWidth + 2,
    `${path} has horizontal overflow: scrollWidth=${metrics.scrollWidth}, innerWidth=${metrics.innerWidth}`
  );
}

async function runDesktopUserFlow(userPage: Page): Promise<{ submissionId: number }> {
  const examsMeta = await fetchJson(userPage.request, "/api/exams?active=true");
  assertCondition(examsMeta.status === 200, `/api/exams?active=true failed: ${examsMeta.status}`);
  const metaBody = asRecord(examsMeta.json, "exams body");
  const activeExam = asRecord(metaBody.activeExam ?? null, "activeExam");
  const activeExamId = asNumber(activeExam.id ?? null, "activeExam.id");
  const regions = asArray(metaBody.regions ?? null, "regions");
  const publicSubjects = asArray(asRecord(metaBody.subjectGroups ?? null, "subjectGroups").PUBLIC ?? null, "PUBLIC");
  assertCondition(publicSubjects.length > 0, "No PUBLIC subjects");
  const subjectCount = publicSubjects.length;

  const targetRegion = regions
    .map((item, index) => asRecord(item as JsonValue, `region[${index}]`))
    .find((row) => {
      const recruit = typeof row.recruitPublicMale === "number" ? row.recruitPublicMale : 0;
      return recruit > 0;
    });
  assertCondition(targetRegion, "No region with recruitPublicMale > 0");
  const targetRegionId = asNumber(targetRegion.id ?? null, "targetRegion.id");

  await openAndEnsure200(userPage, "/exam/input");
  await userPage.waitForSelector("#gender");
  await userPage.selectOption("#gender", "MALE");
  await userPage.selectOption("#examType", "PUBLIC");
  await userPage.selectOption("#region", String(targetRegionId));

  const regionValue = await userPage.locator("#region").inputValue();
  const regionId = Number(regionValue);
  assertCondition(Number.isInteger(regionId) && regionId > 0, `Invalid regionId value: ${regionValue}`);

  const examNumber = await findAvailableExamNumber(userPage.request, activeExamId, regionId, "MALE");
  await userPage.fill("#examNumber", examNumber);
  await userPage.waitForTimeout(700);

  await switchToQuickMode(userPage);

  for (let subjectIndex = 0; subjectIndex < subjectCount; subjectIndex += 1) {
    await setCurrentSubjectDifficulty(userPage);
    const { firstId } = await fillCurrentSubjectQuickInputs(userPage);

    if (subjectIndex < subjectCount - 1) {
      await waitForIdChange(userPage, firstId);
    }
  }

  // Submission anti-abuse validation marks very fast submissions as suspicious.
  await userPage.waitForTimeout(MIN_SUBMIT_DURATION_MS);
  const submissionResponsePromise = userPage
    .waitForResponse(
      (response) =>
        response.url().includes("/api/submission") &&
        response.request().method() === "POST",
      { timeout: 45000 }
    )
    .catch(() => null);

  await userPage.locator("div.mt-5.flex.justify-end button").click();
  await userPage.waitForURL(/\/exam\/result\?submissionId=\d+$/, {
    timeout: 60000,
    waitUntil: "domcontentloaded",
  });

  const currentUrl = new URL(userPage.url());
  const submissionIdFromUrl = Number(currentUrl.searchParams.get("submissionId") ?? null);
  const submissionResponse = await submissionResponsePromise;

  let submissionId = submissionIdFromUrl;

  if (submissionResponse) {
    assertCondition(
      submissionResponse.ok(),
      `/api/submission failed: ${submissionResponse.status()}`
    );

    const submissionBody = asRecord(
      (await submissionResponse.json()) as JsonValue,
      "submission response"
    );
    const submissionIdFromResponse = Number(submissionBody.submissionId ?? null);
    assertCondition(
      Number.isInteger(submissionIdFromResponse) && submissionIdFromResponse > 0,
      `Invalid submissionId in response: ${JSON.stringify(submissionBody)}`
    );
    submissionId = submissionIdFromResponse;
  }

  assertCondition(
    Number.isInteger(submissionId) && submissionId > 0,
    `Invalid submissionId after submit: url=${userPage.url()}`
  );

  const resultApi = await fetchJson(userPage.request, `/api/result?submissionId=${submissionId}`);
  assertCondition(resultApi.status === 200, `/api/result failed: ${resultApi.status}`);

  const analysisApi = await fetchJson(userPage.request, `/api/analysis/subject-stats?submissionId=${submissionId}`);
  assertCondition(analysisApi.status === 200, `/api/analysis/subject-stats failed: ${analysisApi.status}`);

  const predictionApi = await fetchJson(userPage.request, `/api/prediction?submissionId=${submissionId}`);
  assertCondition(predictionApi.status === 200, `/api/prediction failed: ${predictionApi.status}`);
  const predictionBody = asRecord(predictionApi.json, "prediction body");
  const summary = asRecord(predictionBody.summary ?? null, "prediction summary");
  const oneMultipleBaseRank = asNumber(summary.oneMultipleBaseRank ?? null, "oneMultipleBaseRank");
  assertCondition(oneMultipleBaseRank > 0, "oneMultipleBaseRank should be > 0");

  const finalGetApi = await fetchJson(userPage.request, `/api/final-prediction?submissionId=${submissionId}`);
  assertCondition(finalGetApi.status === 200, `/api/final-prediction GET failed: ${finalGetApi.status}`);

  await openAndEnsure200(userPage, `/exam/result?submissionId=${submissionId}`);
  await openAndEnsure200(userPage, `/exam/prediction?submissionId=${submissionId}`);
  await openAndEnsure200(userPage, `/exam/final?submissionId=${submissionId}`);
  await openAndEnsure200(userPage, "/exam/comments");
  await openAndEnsure200(userPage, "/exam/notices");
  await openAndEnsure200(userPage, "/exam/faq");

  return { submissionId: submissionId, };
}

async function runDesktopAdminFlow(adminPage: Page): Promise<string> {
  const adminPages = [
    "/admin",
    "/admin/exams",
    "/admin/answers",
    "/admin/regions",
    "/admin/submissions",
    "/admin/users",
    "/admin/notices",
    "/admin/faqs",
    "/admin/events",
    "/admin/banners",
    "/admin/pass-cut",
    "/admin/stats",
    "/admin/site",
    "/admin/site/basic",
    "/admin/site/policies",
    "/admin/site/visibility",
    "/admin/site/operations",
    "/admin/site/auto-pass-cut",
    "/admin/comments",
    "/admin/mock-data",
  ];

  for (const path of adminPages) {
    await openAndEnsure200(adminPage, path);
    assertCondition(!adminPage.url().includes("/login"), `${path} redirected to login`);
  }

  return `${adminPages.length} pages`;
}

async function runMobileChecks(userContext: BrowserContext, submissionId: number): Promise<string> {
  const mobileContext = await browser!.newContext({
    ...devices["iPhone 13"],
    storageState: await userContext.storageState(),
    recordVideo: {
      dir: path.join(VIDEO_DIR, "mobile"),
      size: { width: 390, height: 844 },
    },
  });
  const mobilePage = await mobileContext.newPage();
  attachPageDiagnostics(mobilePage, "mobile-user");

  const pagesToCheck = [
    "/",
    "/exam/main",
    "/exam/input",
    `/exam/result?submissionId=${submissionId}`,
    `/exam/prediction?submissionId=${submissionId}`,
    `/exam/final?submissionId=${submissionId}`,
    "/exam/comments",
  ];

  for (const path of pagesToCheck) {
    await assertNoHorizontalOverflow(mobilePage, path);
  }

  await mobilePage.goto(`${BASE_URL}/exam/input`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForSelector("#examNumber");
  assertCondition(await mobilePage.locator("#examNumber").isVisible(), "Mobile #examNumber should be visible");

  await mobileContext.close();
  return `${pagesToCheck.length} pages`;
}

async function main(): Promise<void> {
  const user: UserIdentity = {
    name: "\uD14C\uC2A4\uD2B8\uC720\uC800",
    phone: makeRandomPhone(),
    password: "Usertest!123",
  };
  initArtifacts();

  await runStep("Start app server", async () => {
    await startServer();
    return `${BASE_URL} (${SERVER_MODE})`;
  });

  await runStep("Launch browser", async () => {
    browser = await chromium.launch({ headless: true });
    return "chromium";
  });

  const userContext = await browser!.newContext({
    recordVideo: {
      dir: path.join(VIDEO_DIR, "user"),
      size: { width: 1280, height: 720 },
    },
  });
  const userPage = await userContext.newPage();
  attachPageDiagnostics(userPage, "desktop-user");

  const adminContext = await browser!.newContext({
    recordVideo: {
      dir: path.join(VIDEO_DIR, "admin"),
      size: { width: 1280, height: 720 },
    },
  });
  const adminPage = await adminContext.newPage();
  attachPageDiagnostics(adminPage, "desktop-admin");

  let submissionId = 0;

  await runStep("UI register (real user flow)", async () => {
    await registerViaUi(userPage, user);
    await captureScreenshot(userPage, "01-register-complete");
    return user.phone;
  });

  await runStep("UI login (user)", async () => {
    await loginViaUi(userPage, user.phone, user.password);
    await captureScreenshot(userPage, "02-user-login-complete");
    return "ok";
  });

  await runStep("Unauthorized admin access blocked for user", async () => {
    const response = await userPage.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    assertCondition([200, 302, 307].includes(status), `/admin unexpected status: ${status}`);
    assertCondition(userPage.url().includes("/login"), `Expected redirect to login, got ${userPage.url()}`);
    await captureScreenshot(userPage, "03-user-admin-blocked");
    return "redirected";
  });

  await runStep("UI OMR input -> score/result/prediction/final", async () => {
    const result = await runDesktopUserFlow(userPage);
    submissionId = result.submissionId;
    await captureScreenshot(userPage, "04-user-result-ready");
    return `submissionId=${submissionId}`;
  });

  await runStep("UI login (admin)", async () => {
    await loginViaUi(adminPage, ADMIN_PHONE, ADMIN_PASSWORD);
    await captureScreenshot(adminPage, "05-admin-login-complete");
    return ADMIN_PHONE;
  });

  await runStep("Admin pages render + access checks", async () => {
    const detail = await runDesktopAdminFlow(adminPage);
    await captureScreenshot(adminPage, "06-admin-pages-checked");
    return detail;
  });

  await runStep("Mobile responsive checks", async () => {
    const detail = await runMobileChecks(userContext, submissionId);
    await captureScreenshot(userPage, "07-mobile-checks-complete");
    return detail;
  });

  await userContext.close();
  await adminContext.close();
}

main()
  .then(async () => {
    if (browser) {
      await browser.close();
    }
    await stopServer();
    writeArtifactSummary();
    printSummary();
    const hasFailure = results.some((item) => !item.ok);
    process.exit(hasFailure ? 1 : 0);
  })
  .catch(async (error) => {
    console.error("\nUI E2E run aborted due to failure.");
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    if (browser) {
      await browser.close();
    }
    await stopServer();
    writeArtifactSummary();
    printSummary();
    process.exit(1);
  });
