import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

type TenantType = "police" | "fire";

const APP_DIR = process.cwd();
const EVIDENCE_ROOT = path.join(
  APP_DIR,
  ".superloopy/evidence/frontend/20260809-admin-workflow/responsive"
);
const SCREENSHOT_DIR = path.join(EVIDENCE_ROOT, "screenshots");
const VIEWPORTS = [390, 768, 1280] as const;
const TENANTS = [
  {
    type: "police" as const,
    baseUrl: "http://police.localhost:3200",
    identitySelector: "#username",
    identity: "010-0000-0000",
    password: "PoliceAdmin!123",
  },
  {
    type: "fire" as const,
    baseUrl: "http://fire.localhost:3200",
    identitySelector: "#phone",
    identity: "010-0000-0000",
    password: "FireAdmin!123",
  },
] as const;
const ROUTES = [
  ["/admin", "관리자 대시보드", "dashboard"],
  ["/admin/exams", "시험 관리", "exams"],
  ["/admin/answers", "정답 관리", "answers"],
  ["/admin/users", "사용자 관리", "users"],
  ["/admin/banners", "배너 관리", "banners"],
  ["/admin/site/operations", "운영 설정", "operations"],
] as const;

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
    selector,
    { timeout: 30_000 }
  );
}

async function login(page: Page, tenant: (typeof TENANTS)[number]) {
  await page.goto(`${tenant.baseUrl}/admin-login`, { waitUntil: "domcontentloaded" });
  const identity = page.locator(tenant.identitySelector);
  if ((await identity.count()) === 0) {
    await page.locator("#username").fill(tenant.identity);
  } else {
    await waitForHydration(page, tenant.identitySelector);
    await identity.fill(tenant.identity);
  }
  await page.locator("#password").fill(tenant.password);
  await page.getByRole("button", { name: "관리자 로그인", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 60_000 });
  await page.getByRole("heading", { name: "관리자 대시보드", exact: true }).waitFor();
}

async function assertDocumentFits(page: Page, label: string) {
  const size = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert(
    size.documentWidth <= size.viewport + 1,
    `${label}: horizontal overflow ${size.documentWidth}px > ${size.viewport}px.`
  );
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
  const checks: Array<{ tenant: TenantType; viewport: number; route: string }> = [];
  const runtimeErrors: string[] = [];

  try {
    for (const tenant of TENANTS) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      page.setDefaultNavigationTimeout(60_000);
      page.on("pageerror", (error) => runtimeErrors.push(`${tenant.type}: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(`${tenant.type}: ${message.text()}`);
      });
      await login(page, tenant);

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport, height: 900 });
        for (const [pathname, heading, slug] of ROUTES) {
          await page.goto(`${tenant.baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
          await page.getByRole("heading", { name: heading, exact: true }).waitFor();
          await assertDocumentFits(page, `${tenant.type}-${slug}-${viewport}`);
          const filename = `${tenant.type}-${slug}-${viewport}.png`;
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
          checks.push({ tenant: tenant.type, viewport, route: pathname });
        }

        if (viewport === 390) {
          await page.goto(`${tenant.baseUrl}/admin`, { waitUntil: "domcontentloaded" });
          await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
          const closeMenuButton = page.getByRole("button", { name: "메뉴 닫기", exact: true });
          await closeMenuButton.waitFor();
          await page.waitForTimeout(350);
          const drawerBox = await closeMenuButton.locator("xpath=..").boundingBox();
          assert(
            drawerBox && drawerBox.x === 0 && drawerBox.width >= 239,
            `${tenant.type}: mobile admin drawer did not finish opening.`
          );
          await page.screenshot({
            path: path.join(SCREENSHOT_DIR, `${tenant.type}-mobile-menu-390.png`),
            fullPage: true,
          });
          await closeMenuButton.click();
        }
      }
      await context.close();
    }

    assert(runtimeErrors.length === 0, `Runtime errors: ${runtimeErrors.join(" | ")}`);
    const report = {
      result: "passed",
      generatedAt: new Date().toISOString(),
      viewports: VIEWPORTS,
      checks,
      runtimeErrors,
      screenshotCount: checks.length + TENANTS.length,
    };
    writeFileSync(path.join(EVIDENCE_ROOT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      path.join(EVIDENCE_ROOT, "VISUAL_QA.md"),
      [
        "# 관리자 반응형 시각 QA",
        "",
        `- 실행 시각: ${report.generatedAt}`,
        "- 결과: PASS",
        `- 화면폭: ${VIEWPORTS.join("px, ")}px`,
        `- 화면 확인: ${checks.length}건 + 모바일 메뉴 ${TENANTS.length}건`,
        "- 문서 가로 스크롤: 없음 (넓은 표는 내부 스크롤 영역 사용)",
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
