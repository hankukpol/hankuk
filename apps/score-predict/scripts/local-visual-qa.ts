import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

type TenantType = "police" | "fire";

const evidenceRoot = resolve(
  process.cwd(),
  process.env.SUPERLOOPY_EVIDENCE ?? ".superloopy/evidence/frontend/20260807-score-predict-tenant-split"
);
const screenshotsDir = resolve(evidenceRoot, "screenshots");
const runtimeErrors: string[] = [];
const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
const qaScope = process.env.SUPERLOOPY_QA_SCOPE ?? "full";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

async function gotoWithRetry(
  page: Page,
  url: string,
  options: { waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit"; timeout?: number }
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.goto(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await page.waitForTimeout(2_500);
    }
  }
  throw lastError;
}

async function verifyTenantPalette(page: Page, tenantType: TenantType, surface: string) {
  const expected = tenantType === "police" ? "#2563eb" : "#dc2626";
  const palette = await page.evaluate(() => ({
    tenant: document.body.dataset.tenant ?? "",
    service600: getComputedStyle(document.body).getPropertyValue("--service-600").trim().toLowerCase(),
  }));
  assert(palette.tenant === tenantType, `${surface}: body tenant is ${palette.tenant || "missing"}.`);
  assert(
    palette.service600 === expected,
    `${surface}: expected ${tenantType} service color ${expected}, received ${palette.service600 || "missing"}.`
  );
}

function attachDiagnostics(page: Page, label: string) {
  page.on("pageerror", (error) => runtimeErrors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`${label} console.error: ${message.text()}`);
  });
}

async function login(context: BrowserContext, tenantType: TenantType) {
  await authenticateContext(
    context,
    tenantType,
    "010-9000-0000",
    tenantType === "police" ? "PoliceLocal!123" : "FireLocal!123"
  );
}

async function authenticateContext(
  context: BrowserContext,
  tenantType: TenantType,
  identifier: string,
  password: string,
  adminOnly = false
) {
  const page = await context.newPage();
  const host = `http://${tenantType}.localhost:3200`;
  await gotoWithRetry(page, `${host}/login`, { waitUntil: "domcontentloaded" });
  const authResult = await page.evaluate(
    async ({ tenantType: pageTenantType, identifier: pageIdentifier, pagePassword, pageAdminOnly }) => {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrf = (await csrfResponse.json()) as { csrfToken?: string };
      const body = new URLSearchParams({
        csrfToken: csrf.csrfToken ?? "",
        callbackUrl: window.location.origin,
        password: pagePassword,
        json: "true",
      });
      body.set(pageTenantType === "police" ? "username" : "phone", pageIdentifier);
      if (pageAdminOnly) body.set("adminOnly", "true");
      const response = await fetch("/api/auth/callback/credentials?json=true", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const payload = (await response.json()) as { url?: string };
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await sessionResponse.json()) as {
        user?: { tenantType?: string; role?: string };
      };
      return { status: response.status, payload, session };
    },
    {
      tenantType,
      identifier,
      pagePassword: password,
      pageAdminOnly: adminOnly,
    }
  );
  assert(authResult.status === 200, `${tenantType} browser authentication returned ${authResult.status}.`);
  assert(!authResult.payload.url?.includes("error="), `${tenantType} browser authentication failed.`);
  assert(authResult.session.user?.tenantType === tenantType, `${tenantType} browser session claim mismatch.`);
  if (adminOnly) assert(authResult.session.user?.role === "ADMIN", `${tenantType} browser admin role is missing.`);
  await page.close();
}

async function loginAdmin(context: BrowserContext, tenantType: TenantType) {
  await authenticateContext(
    context,
    tenantType,
    "010-0000-0000",
    tenantType === "police" ? "PoliceAdmin!123" : "FireAdmin!123",
    true
  );
}

async function verifyAdminSeparation(context: BrowserContext, tenantType: TenantType) {
  await loginAdmin(context, tenantType);
  const host = `http://${tenantType}.localhost:3200`;

  for (const target of [
    { path: "/admin/stats", name: "stats" },
    { path: "/admin/regions", name: "regions" },
  ]) {
    const page = await context.newPage();
    attachDiagnostics(page, `${tenantType}-admin-${target.name}`);
    // The first visit compiles the chart-heavy admin bundle in local Next.js.
    // Give that cold compilation enough time without weakening element checks.
    await gotoWithRetry(page, `${host}${target.path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const expectedHeading =
      target.name === "stats"
        ? "참여 통계"
        : tenantType === "police"
          ? "경찰 지역 및 모집인원 관리"
          : "지역/모집인원 관리";
    await page
      .getByRole("heading", {
        name: expectedHeading,
        exact: true,
      })
      .waitFor({ timeout: 30_000 });
    await page.getByText(/활성 시험 1개/).waitFor({ timeout: 20_000 });
    await verifyTenantPalette(page, tenantType, `${tenantType} admin ${target.name}`);
    if (tenantType === "fire" && target.name === "regions") {
      await page.getByRole("button", { name: "소방학과(남)", exact: true }).waitFor();
    }
    const bodyText = await page.locator("body").innerText();

    if (tenantType === "police") {
      assert(bodyText.includes("경행경채"), `Police admin ${target.name} is missing 경행경채.`);
      assert(
        !bodyText.includes("구조 경채") && !bodyText.includes("소방학과 경채") && !bodyText.includes("구급 경채"),
        `Fire exam types are visible in police admin ${target.name}.`
      );
    } else {
      assert(!bodyText.includes("경행경채"), `Police career type is visible in fire admin ${target.name}.`);
      if (target.name === "stats") {
        assert(bodyText.includes("구조 경채") && bodyText.includes("구급 경채"), "Fire admin stats types are missing.");
        assert(
          bodyText.includes("공채(남)") && bodyText.includes("공채(여)"),
          "Fire admin prediction cohorts are not split by gender."
        );
      } else {
        assert(bodyText.includes("소방학과(남)"), "Fire admin region cohorts are missing.");
      }
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    assert(!hasHorizontalOverflow, `${tenantType} admin ${target.name} has page-level horizontal overflow.`);
    const filename = `${tenantType}-admin-${target.name}-${page.viewportSize()?.width ?? 0}.png`;
    await page.screenshot({ path: resolve(screenshotsDir, filename), fullPage: true });
    record(`${tenantType}-admin-${target.name}`, true, `tenant palette and exam types separated, no page overflow, ${filename}`);

    if (target.name === "stats") {
      const predictionHeading = page.getByRole("heading", { name: "지역별 1배수 도달 지표" });
      await predictionHeading.scrollIntoViewIfNeeded();
      const predictionFilename = `${tenantType}-admin-stats-prediction-${page.viewportSize()?.width ?? 0}.png`;
      await page.screenshot({ path: resolve(screenshotsDir, predictionFilename) });
      record(
        `${tenantType}-admin-stats-prediction`,
        true,
        `tenant palette and recruitment cohorts visible, ${predictionFilename}`
      );
    }
    await page.close();
  }
}

async function verifySmsConsentAtViewport(context: BrowserContext) {
  await authenticateContext(context, "police", "010-9115-1015", "police-user-15!");
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  attachDiagnostics(page, "police-sms-consent-390");
  await gotoWithRetry(page, "http://police.localhost:3200/account/notifications", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "문자 수신 설정" }).waitFor();
  await page.getByText("동의하지 않아도 채점과 합격예측을 이용할 수 있습니다.").waitFor();
  const checkbox = page.locator('input[type="checkbox"]');
  await checkbox.waitFor({ state: "visible", timeout: 20_000 });
  assert(await checkbox.isChecked(), "Police SMS consent seed should render as checked.");
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  assert(!hasHorizontalOverflow, "Police SMS consent page has horizontal overflow at 390px.");
  const filename = "police-sms-consent-390.png";
  await page.screenshot({ path: resolve(screenshotsDir, filename), fullPage: true });
  record("police-sms-consent-390", true, `optional consent and withdrawal control visible, ${filename}`);
  await page.close();
}

async function verifyPublicLandingAtViewport(
  context: BrowserContext,
  tenantType: TenantType,
  width: number,
  height: number
) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  attachDiagnostics(page, `${tenantType}-public-landing-${width}`);
  await gotoWithRetry(page, `http://${tenantType}.localhost:3200/`, { waitUntil: "domcontentloaded" });
  await page.locator("body[data-tenant]").waitFor({ timeout: 20_000 });
  await page.getByText("세션 확인 중...", { exact: true }).waitFor({ state: "detached", timeout: 30_000 });
  await page
    .getByRole("heading", { name: /^(대구·경북|지역별) 시험 현황$/ })
    .waitFor({ timeout: 30_000 });
  await verifyTenantPalette(page, tenantType, `${tenantType} public landing`);

  assert(page.url() === `http://${tenantType}.localhost:3200/`, `${tenantType} public root changed URL to ${page.url()}.`);
  const bodyText = await page.locator("body").innerText();
  if (tenantType === "police") {
    assert(bodyText.includes("경찰"), "Police public landing branding is missing.");
    assert(!bodyText.includes("소방 합격예측"), "Fire branding is visible on the police public landing.");
  } else {
    assert(bodyText.includes("소방"), "Fire public landing branding is missing.");
    assert(!bodyText.includes("경찰 합격예측"), "Police branding is visible on the fire public landing.");
  }
  assert(await page.locator("#username, #phone").count() === 0, `${tenantType} public root rendered the login form.`);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  assert(!hasHorizontalOverflow, `${tenantType} public landing has horizontal overflow at ${width}px.`);

  const filename = `${tenantType}-public-landing-${width}.png`;
  await page.screenshot({ path: resolve(screenshotsDir, filename), fullPage: true });
  record(
    `${tenantType}-public-landing-${width}`,
    true,
    `tenant palette applied, unauthenticated landing visible, login form absent, no horizontal overflow, ${filename}`
  );
  await page.close();
}

async function verifyMainAtViewport(
  context: BrowserContext,
  tenantType: TenantType,
  width: number,
  height: number
) {
  await login(context, tenantType);
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  attachDiagnostics(page, `${tenantType}-main-${width}`);
  await gotoWithRetry(page, `http://${tenantType}.localhost:3200/exam/main`, { waitUntil: "networkidle" });
  await verifyTenantPalette(page, tenantType, `${tenantType} main`);
  await page.getByRole("heading", { name: "채점자 성적분포도" }).waitFor();
  const settingsPayload = await page.evaluate(async () => {
    const response = await fetch("/api/site-settings", { cache: "no-store" });
    return (await response.json()) as { settings?: Record<string, unknown> };
  });
  const settings = settingsPayload.settings ?? {};
  const tabVisibility = [
    { label: "풀서비스 메인", enabled: settings["site.tabMainEnabled"] !== false },
    { label: "응시정보 입력", enabled: settings["site.tabInputEnabled"] !== false },
    { label: "내 성적 분석", enabled: settings["site.tabResultEnabled"] !== false },
    { label: "최종 예상 컷", enabled: settings["site.finalPredictionEnabled"] === true },
    { label: "합격 예측 정보", enabled: settings["site.tabPredictionEnabled"] !== false },
    { label: "실시간 댓글", enabled: settings["site.commentsEnabled"] !== false },
    { label: "공지사항", enabled: settings["site.tabNoticesEnabled"] !== false },
    { label: "FAQ", enabled: settings["site.tabFaqEnabled"] !== false },
  ];
  const tabNavigation = page.locator("#exam-functions > div").first();
  for (const tab of tabVisibility) {
    const count = await tabNavigation.getByRole("button", { name: tab.label, exact: true }).count();
    assert(
      count === (tab.enabled ? 1 : 0),
      `${tenantType} ${tab.label} tab visibility does not match the admin setting.`
    );
  }
  assert(await tabNavigation.locator("svg").count() === 0, `${tenantType} unopened tab lock icon is visible.`);
  const bodyText = await page.locator("body").innerText();
  if (tenantType === "police") {
    assert(bodyText.includes("헌법") && bodyText.includes("형사법") && bodyText.includes("경찰학"), "Police distribution subjects are missing.");
    assert(bodyText.includes("경행경채"), "Police career label is missing.");
    assert(!bodyText.includes("소방학개론") && !bodyText.includes("소방관계법규") && !bodyText.includes("구급 경채"), "Fire content is visible on police page.");
  } else {
    assert(bodyText.includes("소방학개론") && bodyText.includes("소방관계법규") && bodyText.includes("행정법총론"), "Fire distribution subjects are missing.");
    assert(bodyText.includes("구조") && bodyText.includes("구급"), "Fire career labels are missing.");
    assert(!bodyText.includes("헌법") && !bodyText.includes("형사법") && !bodyText.includes("경행경채"), "Police content is visible on fire page.");
  }
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  const filename = `${tenantType}-main-${width}.png`;
  await page.screenshot({ path: resolve(screenshotsDir, filename), fullPage: true });
  if (hasHorizontalOverflow) {
    const overflowDetails = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === "string" ? element.className : "",
          right: Math.round(element.getBoundingClientRect().right),
          width: Math.round(element.getBoundingClientRect().width),
        }))
        .filter((item) => item.right > window.innerWidth + 1)
        .slice(0, 8)
    );
    throw new Error(`${tenantType} ${width}px has horizontal overflow: ${JSON.stringify(overflowDetails)}`);
  }
  record(
    `${tenantType}-main-${width}`,
    true,
    `tenant palette and subjects separated, unopened tabs hidden without lock icons, no horizontal overflow, ${filename}`
  );
  await page.close();
}

async function verifyPredictionAtViewport(
  context: BrowserContext,
  tenantType: TenantType,
  width: number,
  height: number
) {
  await login(context, tenantType);
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  attachDiagnostics(page, `${tenantType}-prediction-${width}`);
  await gotoWithRetry(page, `http://${tenantType}.localhost:3200/exam/prediction`, { waitUntil: "networkidle" });
  await verifyTenantPalette(page, tenantType, `${tenantType} prediction`);
  if (tenantType === "police") {
    await page.getByRole("heading", { name: "표본 순위를 중심으로 안내합니다" }).waitFor();
  } else {
    await page.getByRole("heading", { name: "나의 합격예측" }).waitFor();
  }
  await page.waitForTimeout(1_600);

  const bodyText = await page.locator("body").innerText();
  assert(!bodyText.includes("0.15점 차이"), `${tenantType} prediction still exposes mock score gaps.`);
  assert(!bodyText.includes("1배수(92등)"), `${tenantType} prediction still exposes a mock rank.`);
  if (tenantType === "police") {
    assert(bodyText.includes("표본 내 순위"), "Police prediction does not show the sample rank.");
    assert(bodyText.includes("모집인원 × 2배수"), "Police prediction does not show the fixed 2x policy notice.");
    assert(!bodyText.includes("등 여유") && !bodyText.includes("등 초과"), "Police prediction mixes sample rank with a population boundary.");
    for (const grade of ["합격 확실권", "합격 유력권", "합격 가능권", "합격 도전권"]) {
      assert(!bodyText.includes(grade), `Police prediction leaked uncalibrated grade: ${grade}.`);
    }
  } else {
    for (const grade of ["확실권", "유력권", "가능권", "도전권"]) {
      assert(bodyText.includes(grade), `${tenantType} prediction is missing ${grade}.`);
    }
    assert(
      bodyText.includes("소방 선발배수") && bodyText.includes("경찰 고정 2배수 계산을 사용하지 않습니다."),
      "Fire prediction does not explain the fire-only pass multiple."
    );
  }

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  assert(!hasHorizontalOverflow, `${tenantType} prediction has horizontal overflow at ${width}px.`);
  const filename = `${tenantType}-prediction-${width}.png`;
  await page.screenshot({ path: resolve(screenshotsDir, filename), fullPage: true });
  record(
    `${tenantType}-prediction-${width}`,
    true,
    tenantType === "police"
      ? `rank-first uncalibrated state visible, no mixed-scale margin, no horizontal overflow, ${filename}`
      : `real model boundaries and four grades visible, tenant palette applied, no horizontal overflow, ${filename}`
  );
  await page.close();
}

async function verifyResultAtViewport(
  context: BrowserContext,
  tenantType: TenantType,
  width: number,
  height: number
) {
  await login(context, tenantType);
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  attachDiagnostics(page, `${tenantType}-result-${width}`);
  await gotoWithRetry(page, `http://${tenantType}.localhost:3200/exam/result`, {
    waitUntil: "networkidle",
  });
  await verifyTenantPalette(page, tenantType, `${tenantType} result`);
  await page.getByRole("heading", { name: "전체 성적 요약", exact: true }).waitFor();

  const bodyText = await page.locator("body").innerText();
  if (tenantType === "police") {
    assert(
      bodyText.includes("취업지원대상자 가산점이 필기 점수에 적용되었습니다."),
      "Police result is missing its written-bonus decision."
    );
    assert(
      !bodyText.includes("과목별 40% 이상 득점에 적용"),
      "Fire per-subject bonus wording leaked into the police result."
    );
  } else {
    assert(
      bodyText.includes("취업지원대상자 가산점은 필기시험 과목별 40% 이상 득점에 적용되었습니다."),
      "Fire result is missing its per-subject written-bonus decision."
    );
    assert(
      !bodyText.includes("출원인원이 모집인원 이하"),
      "Police applicant-count exception wording leaked into the fire result."
    );
  }

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  assert(!hasHorizontalOverflow, `${tenantType} result has horizontal overflow at ${width}px.`);
  const filename = `${tenantType}-result-${width}.png`;
  await page.screenshot({ path: resolve(screenshotsDir, filename), fullPage: true });
  record(
    `${tenantType}-result-${width}`,
    true,
    `tenant-specific written bonus and palette visible, no horizontal overflow, ${filename}`
  );
  await page.close();
}

async function captureErrorState(context: BrowserContext) {
  await login(context, "police");
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/main-stats", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "로컬 오류 상태 검증" }),
    });
  });
  await gotoWithRetry(page, "http://police.localhost:3200/exam/main", { waitUntil: "networkidle" });
  await page.getByText("로컬 오류 상태 검증", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshotsDir, "police-error-390.png"), fullPage: true });
  record("police-error-390", true, "error state rendered without layout break");
  await page.close();
}

async function captureEmptyState(context: BrowserContext) {
  await login(context, "fire");
  const page = await context.newPage();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.route("**/api/main-stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tenantType: "fire",
        examTypes: [],
        updatedAt: new Date(0).toISOString(),
        careerExamEnabled: true,
        sectionVisibility: { overview: true, difficulty: true, competitive: true, scoreDistribution: true },
        liveStats: null,
        notices: [],
        difficulty: null,
        rows: [],
        topCompetitive: [],
        leastCompetitive: [],
        scoreDistributions: {},
        refresh: { enabled: false, intervalSec: 60 },
      }),
    });
  });
  await gotoWithRetry(page, "http://fire.localhost:3200/exam/main", { waitUntil: "networkidle" });
  await page.getByText("현재 집계 가능한 시험 데이터가 없습니다.", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshotsDir, "fire-empty-768.png"), fullPage: true });
  record("fire-empty-768", true, "empty state rendered without layout break");
  await page.close();
}

async function main() {
  mkdirSync(screenshotsDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1"],
  });
  try {
    for (const tenantType of ["police", "fire"] as const) {
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1280, height: 900 },
      ]) {
        const context = await browser.newContext({ viewport });
        await verifyPublicLandingAtViewport(context, tenantType, viewport.width, viewport.height);
        if (qaScope !== "public-landing") {
          await verifyMainAtViewport(context, tenantType, viewport.width, viewport.height);
          await verifyPredictionAtViewport(context, tenantType, viewport.width, viewport.height);
          await verifyResultAtViewport(context, tenantType, viewport.width, viewport.height);
        }
        await context.close();
      }
    }

    if (qaScope !== "public-landing") {
      const errorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await captureErrorState(errorContext);
      await errorContext.close();
      const emptyContext = await browser.newContext({ viewport: { width: 768, height: 1024 } });
      await captureEmptyState(emptyContext);
      await emptyContext.close();
      for (const tenantType of ["police", "fire"] as const) {
        const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        await verifyAdminSeparation(adminContext, tenantType);
        await adminContext.close();
      }
      const consentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await verifySmsConsentAtViewport(consentContext);
      await consentContext.close();
    }
  } finally {
    await browser.close();
  }

  assert(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join(" | ")}`);
  const report = {
    generatedAt: new Date().toISOString(),
    scope: qaScope,
    localOrigins: ["http://police.localhost:3200", "http://fire.localhost:3200"],
    checks,
    runtimeErrors,
  };
  writeFileSync(resolve(evidenceRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const stateSummary = qaScope === "public-landing"
    ? "비로그인 공개 랜딩"
    : "비로그인 공개 랜딩, 정상, API 오류, 활성 시험 없음";
  const verificationSummary = qaScope === "public-landing"
    ? "경찰 블루·소방 레드 팔레트, 공개 랜딩 유지, 로그인 폼 미노출, 가로 스크롤 없음, 브라우저 런타임 오류 없음"
    : "경찰 블루·소방 레드 팔레트, 비로그인 공개 랜딩, 사용자·관리자 화면 과목 및 직렬 교차 없음, 가로 스크롤 없음, 브라우저 런타임 오류 없음";
  const qaReport = [
    "# 경찰·소방 로컬 시각 QA",
    "",
    `- 실행 시각: ${report.generatedAt}`,
    "- 환경: Docker Next.js + 로컬 Supabase",
    "- 결과: PASS",
    "- 화면: 경찰·소방 각각 390px, 768px, 1280px",
    `- 상태: ${stateSummary}`,
    `- 검증: ${verificationSummary}`,
    "",
    ...checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"}: ${check.name} - ${check.detail}`),
    "",
  ].join("\n");
  writeFileSync(resolve(evidenceRoot, "QA_REPORT.md"), qaReport, "utf8");
  writeFileSync(resolve(evidenceRoot, "VISUAL_QA.md"), qaReport, "utf8");
  console.log(`Evidence: ${evidenceRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
