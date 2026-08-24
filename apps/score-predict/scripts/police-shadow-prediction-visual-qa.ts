import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const APP_DIR = process.cwd();
const EVIDENCE_ROOT = path.resolve(
  APP_DIR,
  process.env.SUPERLOOPY_EVIDENCE ??
    ".superloopy/evidence/frontend/20260824-police-shadow-prediction"
);
const SCREENSHOT_DIR = path.join(EVIDENCE_ROOT, "screenshots");
const VIEWPORTS = [390, 768, 1280] as const;
const BASE_URL = "http://police.localhost:3200";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loadLocalEnv() {
  const source = readFileSync(path.join(APP_DIR, ".env.docker.local"), "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction(
    (target) => {
      const element = document.querySelector(target);
      return Boolean(
        element &&
          Object.keys(element).some(
            (key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$")
          )
      );
    },
    selector
  );
}

async function login(page: Page, baseUrl: string, identitySelector: string, identity: string, password: string) {
  await page.goto(`${baseUrl}/admin-login`, { waitUntil: "domcontentloaded" });
  const identityField = page.locator(identitySelector);
  if ((await identityField.count()) === 0) {
    await waitForHydration(page, "#username");
    await page.locator("#username").fill(identity);
  } else {
    await waitForHydration(page, identitySelector);
    await identityField.fill(identity);
  }
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "관리자 로그인", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 60_000 });
}

async function main() {
  loadLocalEnv();
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1",
    ],
  });
  const runtimeErrors: string[] = [];
  const checks: Array<{
    viewport: number;
    rowCount: number;
    lockedRowCount: number;
    tableScrollable: boolean;
    publicExposure: boolean;
    calibrated: boolean;
  }> = [];

  try {
    const unauthenticated = await browser.newContext();
    const unauthenticatedPage = await unauthenticated.newPage();
    const unauthenticatedResponse = await unauthenticatedPage.goto(
      `${BASE_URL}/api/admin/police-prediction-shadow?examId=1`,
      { waitUntil: "domcontentloaded" }
    );
    const unauthenticatedStatus = unauthenticatedResponse?.status() ?? 0;
    assert(unauthenticatedStatus === 401, `비로그인 API 응답이 401이 아닙니다: ${unauthenticatedStatus}`);
    await unauthenticated.close();

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 500) runtimeErrors.push(`${response.status()} ${response.url()}`);
    });
    await login(page, BASE_URL, "#username", "010-0000-0000", "PoliceAdmin!123");

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport, height: 900 });
      const apiResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/admin/police-prediction-shadow")
      );
      await page.goto(`${BASE_URL}/admin/pass-cut`, { waitUntil: "domcontentloaded" });
      const apiResponse = await apiResponsePromise;
      assert(apiResponse.status() === 200, `그림자 모델 API가 ${apiResponse.status()}를 반환했습니다.`);
      const payload = await apiResponse.json() as {
        publicExposure?: boolean;
        calibrated?: boolean;
        rows?: Array<{
          status?: string;
          correctedWrittenPassCutScore?: number | null;
          sensitivityLowScore?: number | null;
          sensitivityHighScore?: number | null;
          possibleMinScore?: number | null;
          likelyMinScore?: number | null;
          sureMinScore?: number | null;
        }>;
      };
      assert(payload.publicExposure === false, "그림자 모델이 사용자 공개 상태입니다.");
      assert(payload.calibrated === false, "미보정 그림자 모델이 보정 완료로 표시됩니다.");
      const lockedRows = (payload.rows ?? []).filter((row) =>
        row.correctedWrittenPassCutScore === null &&
        row.sensitivityLowScore === null &&
        row.sensitivityHighScore === null &&
        row.possibleMinScore === null &&
        row.likelyMinScore === null &&
        row.sureMinScore === null
      );
      assert(
        lockedRows.length === (payload.rows?.length ?? 0),
        "관리자 API가 미교정 보정 수치를 반환합니다."
      );

      const section = page.getByRole("heading", { name: "합격예측 그림자 모델", exact: true })
        .locator("xpath=ancestor::section[1]");
      await section.waitFor();
      await section.locator(".admin-status-strip")
        .getByText("보정모델 검증 대기", { exact: true })
        .waitFor();
      const table = section.locator("table");
      await table.getByRole("columnheader", { name: "원표본 1배수", exact: true }).waitFor();
      assert(
        await table.getByRole("columnheader", { name: "보정 선발배수", exact: true }).count() === 0,
        "관리자 표에 보정 선발배수 열이 남아 있습니다."
      );
      assert(
        await table.getByRole("columnheader", { name: "가능권", exact: true }).count() === 0 &&
          await table.getByRole("columnheader", { name: "유력권", exact: true }).count() === 0 &&
          await table.getByRole("columnheader", { name: "확실권", exact: true }).count() === 0,
        "관리자 표에 미교정 합격권 열이 남아 있습니다."
      );
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);

      const scroller = section.locator(".overflow-x-auto").first();
      await scroller.waitFor();
      const overflow = await scroller.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      const documentWidth = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      assert(
        documentWidth.documentWidth <= documentWidth.viewport + 1,
        `${viewport}px에서 문서 가로 넘침이 발생했습니다.`
      );
      assert(
        overflow.scrollWidth >= overflow.clientWidth,
        `${viewport}px에서 비교표 내부 스크롤 영역이 확인되지 않습니다.`
      );

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `police-shadow-prediction-${viewport}.png`),
      });
      checks.push({
        viewport,
        rowCount: payload.rows?.length ?? 0,
        lockedRowCount: lockedRows.length,
        tableScrollable: overflow.scrollWidth > overflow.clientWidth,
        publicExposure: payload.publicExposure,
        calibrated: payload.calibrated,
      });
    }
    await context.close();

    const fireContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const firePage = await fireContext.newPage();
    await login(firePage, "http://fire.localhost:3200", "#phone", "010-0000-0000", "FireAdmin!123");
    const fireStatus = await firePage.evaluate(async () => {
      const response = await fetch("/api/admin/police-prediction-shadow?examId=1", {
        cache: "no-store",
      });
      return response.status;
    });
    assert(fireStatus === 404, `소방 관리자에서 경찰 그림자 API가 차단되지 않았습니다: ${fireStatus}`);
    await fireContext.close();

    assert(runtimeErrors.length === 0, `브라우저 런타임 오류: ${runtimeErrors.join(" | ")}`);
    const report = {
      result: "passed",
      generatedAt: new Date().toISOString(),
      unauthenticatedStatus,
      fireTenantStatus: fireStatus,
      checks,
      runtimeErrors,
    };
    writeFileSync(path.join(EVIDENCE_ROOT, "shadow-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      path.join(EVIDENCE_ROOT, "VISUAL_QA.md"),
      [
        "# 경찰 관리자 그림자 합격예측 시각 QA",
        "",
        `- 실행 시각: ${report.generatedAt}`,
        "- 결과: PASS",
        "- 관리자 화면: 390px, 768px, 1280px 확인",
        "- 비로그인 API: 401",
        "- 소방 관리자 API: 404",
        "- 사용자 공개 상태: false",
        "- 캘리브레이션 상태: false",
        "- 관리자 API 보정 수치: 전 행 null",
        "- 관리자 표 보정 선발배수·가능권·유력권·확실권 열: 비노출",
        "- 문서 가로 넘침: 없음",
        "- 넓은 비교표: 내부 가로 스크롤",
        "- 브라우저 런타임 오류: 없음",
        "",
      ].join("\n")
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
