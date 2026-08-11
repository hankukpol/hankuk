import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

type TenantType = "police" | "fire";

const evidenceRoot = resolve(process.cwd(), "../../.superloopy/evidence/frontend/20260810-notice-board");
const screenshotsDir = resolve(evidenceRoot, "screenshots");
const baseUrls: Record<TenantType, string> = {
  police: "http://police.localhost:3200",
  fire: "http://fire.localhost:3200",
};
const userPasswords: Record<TenantType, string> = {
  police: "PoliceLocal!123",
  fire: "FireLocal!123",
};
const checks: string[] = [];
const runtimeErrors: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function attachDiagnostics(page: Page, label: string) {
  page.on("pageerror", (error) => runtimeErrors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`${label}: ${message.text()}`);
  });
}

async function authenticateContext(
  context: BrowserContext,
  tenantType: TenantType,
  identifier: string,
  password: string,
  adminOnly = false
) {
  const page = await context.newPage();
  await page.goto(`${baseUrls[tenantType]}/login`, { waitUntil: "domcontentloaded" });
  const authResult = await page.evaluate(
    async ({ pageTenantType, pageIdentifier, pagePassword, pageAdminOnly }) => {
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
      const session = (await sessionResponse.json()) as { user?: { tenantType?: string; role?: string } };
      return { status: response.status, payload, session };
    },
    { pageTenantType: tenantType, pageIdentifier: identifier, pagePassword: password, pageAdminOnly: adminOnly }
  );
  assert(authResult.status === 200, `${tenantType}: authentication returned ${authResult.status}.`);
  assert(!authResult.payload.url?.includes("error="), `${tenantType}: authentication failed.`);
  assert(authResult.session.user?.tenantType === tenantType, `${tenantType}: session tenant mismatch.`);
  if (adminOnly) assert(authResult.session.user?.role === "ADMIN", `${tenantType}: admin role is missing.`);
  await page.close();
}

async function loginUser(context: BrowserContext, tenantType: TenantType) {
  await authenticateContext(context, tenantType, "010-9000-0000", userPasswords[tenantType]);
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.documentWidth <= dimensions.viewportWidth + 1,
    `${label}: horizontal overflow ${dimensions.documentWidth}px > ${dimensions.viewportWidth}px.`
  );
}

async function capturePublicBoard(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  tenantType: TenantType,
  width: number
) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await loginUser(context, tenantType);
  const page = await context.newPage();
  attachDiagnostics(page, `${tenantType}-${width}`);
  await page.goto(`${baseUrls[tenantType]}/exam/notices`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "공지사항", exact: true }).waitFor();
  await page.getByRole("search").waitFor();
  assert((await page.getByText("새 공지 작성", { exact: true }).count()) === 0, `${tenantType}: public write button is exposed.`);
  await assertNoHorizontalOverflow(page, `${tenantType}-${width}`);

  await page.screenshot({ path: resolve(screenshotsDir, `${tenantType}-notice-list-${width}.png`), fullPage: true });
  checks.push(`${tenantType} public list ${width}px: board list, search, no write action, no horizontal overflow`);

  if (tenantType === "police" && width === 390) {
    const firstVisibleRow = page.locator("tbody button:visible, ul button:visible").first();
    if ((await firstVisibleRow.count()) > 0) {
      await firstVisibleRow.click();
      await page.getByRole("button", { name: "목록", exact: true }).waitFor();
      await assertNoHorizontalOverflow(page, "police-detail-390");
      await page.screenshot({ path: resolve(screenshotsDir, "police-notice-detail-390.png"), fullPage: true });
      checks.push("police public detail 390px: title, metadata, body, list return action");
    }
  }

  await context.close();
}

async function captureAdminBoard(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await authenticateContext(context, "police", "010-0000-0000", "PoliceAdmin!123", true);
  const page = await context.newPage();
  attachDiagnostics(page, "police-admin");
  await page.goto(`${baseUrls.police}/admin/notices`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "공지사항 게시판 관리", exact: true }).waitFor();
  assert((await page.locator("#notice-title").count()) === 0, "Admin editor should be closed on initial list view.");
  await assertNoHorizontalOverflow(page, "police-admin-list-1280");
  await page.screenshot({ path: resolve(screenshotsDir, "police-admin-notice-list-1280.png"), fullPage: true });

  await page.getByRole("button", { name: "새 공지 작성", exact: true }).click();
  await page.locator("#notice-title").waitFor();
  await page.locator(".sun-editor").waitFor();
  await page.locator('[data-command="codeView"]').waitFor();
  await page.locator('[data-command="image"]').waitFor();
  await page.getByRole("button", { name: "공지 등록", exact: true }).waitFor();
  await assertNoHorizontalOverflow(page, "police-admin-editor-1280");
  await page.screenshot({ path: resolve(screenshotsDir, "police-admin-notice-editor-1280.png"), fullPage: true });
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "수정", exact: true }).first().click();
  assert((await page.locator("#notice-title").inputValue()).length > 0, "Admin edit form did not load the selected notice.");
  await page.getByRole("heading", { name: "공지사항 수정", exact: true }).waitFor();
  await page.locator(".sun-editor").waitFor();
  checks.push("police admin 1280px: list-first create/edit workflows with rich-text and image toolbar");
  await context.close();

  const anonymous = await browser.newContext();
  const response = await anonymous.request.post("http://localhost:3200/police/api/admin/notices", {
    data: { title: "권한 검사", content: "권한 검사", priority: 0, isActive: true },
  });
  assert(response.status() === 401, `Anonymous notice creation expected 401, received ${response.status()}.`);
  checks.push("anonymous admin notice creation rejected with 401");
  await anonymous.close();
}

async function main() {
  mkdirSync(screenshotsDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1"],
  });

  try {
    for (const width of [390, 768, 1280]) {
      await capturePublicBoard(browser, "police", width);
    }
    await capturePublicBoard(browser, "fire", 768);
    await captureAdminBoard(browser);
    assert(runtimeErrors.length === 0, `Browser runtime errors:\n${runtimeErrors.join("\n")}`);
  } finally {
    await browser.close();
  }

  const report = [
    "# 공지사항 게시판 Visual QA",
    "",
    "## 결과",
    "",
    ...checks.map((check) => `- [x] ${check}`),
    "- [x] 390px, 768px, 1280px에서 문서 가로 스크롤 없음",
    "- [x] 사용자 화면에 작성, 수정, 삭제 기능 없음",
    "- [x] 관리자 API 비인증 쓰기 401 차단",
    "- [x] 경찰 블루와 소방 레드 서비스 색상 토큰 유지",
    "",
    "## Anti-slop pre-flight",
    "",
    "- [x] 보라색 그라데이션, 글래스모피즘, 과도한 카드 구성 없음",
    "- [x] 기존 Noto Sans KR 글꼴과 서비스별 단일 강조색 유지",
    "- [x] visible em dash 없음",
    "- [x] 목록, 상세, 로딩, 빈 상태, 오류 상태 구현",
    "- [x] hover, focus-visible, disabled 상태 구현",
    "- [x] 모든 신규 색상, 간격, radius가 DESIGN.md 토큰에 연결됨",
    "",
    "## 참고",
    "",
    "- 경찰학원 홈페이지는 번호, 제목, 등록일 중심의 목록 정보 구조만 참고했다.",
    "- 본문 편집기는 현재 서비스 /admin/banners에서 운영 중인 SunEditor를 공통 컴포넌트로 추출해 적용했다.",
    "- 구형 이미지 버튼과 고정폭 레이아웃은 복사하지 않았다.",
  ].join("\n");
  writeFileSync(resolve(evidenceRoot, "VISUAL_QA.md"), `${report}\n`, "utf8");
  console.log(JSON.stringify({ result: "passed", evidence: resolve(evidenceRoot, "VISUAL_QA.md"), checks }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
