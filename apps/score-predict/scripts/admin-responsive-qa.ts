import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

type TenantType = "police" | "fire";

const APP_DIR = process.cwd();
const EVIDENCE_ROOT = path.resolve(
  APP_DIR,
  process.env.SUPERLOOPY_EVIDENCE ??
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
const selectedTenant = process.env.SCORE_ADMIN_QA_TENANT;
const ACTIVE_TENANTS = selectedTenant
  ? TENANTS.filter((tenant) => tenant.type === selectedTenant)
  : TENANTS;
const selectedViewport = Number(process.env.SCORE_ADMIN_QA_VIEWPORT ?? 0);
const ACTIVE_VIEWPORTS = selectedViewport
  ? VIEWPORTS.filter((viewport) => viewport === selectedViewport)
  : VIEWPORTS;
const ROUTES = [
  ["/admin", "관리자 대시보드", "dashboard"],
  ["/admin/exams", "시험 관리", "exams"],
  ["/admin/answers", "정답 관리", "answers"],
  ["/admin/regions", /(?:경찰 지역 및 모집인원 관리|지역\/모집인원 관리)/, "regions"],
  ["/admin/pre-registrations", "사전등록 관리", "pre-registrations"],
  ["/admin/stats", "참여 통계", "stats"],
  ["/admin/users", "사용자 관리", "users"],
  ["/admin/banners", "배너 관리", "banners"],
  ["/admin/site/operations", "운영 설정", "operations"],
] as const;
const selectedPath = process.env.SCORE_ADMIN_QA_PATH;
const ACTIVE_ROUTES = selectedPath
  ? ROUTES.filter(([pathname]) => pathname === selectedPath)
  : ROUTES;

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

async function openAdminRoute(page: Page, tenant: (typeof TENANTS)[number], pathname: string) {
  await page.goto(`${tenant.baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/admin-login")) {
    await login(page, tenant);
    await page.goto(`${tenant.baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
  }
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
    for (const tenant of ACTIVE_TENANTS) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      page.setDefaultNavigationTimeout(60_000);
      page.on("pageerror", (error) => runtimeErrors.push(`${tenant.type}: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(`${tenant.type}: ${message.text()}`);
      });
      page.on("response", (response) => {
        if (response.status() >= 500) {
          runtimeErrors.push(`${tenant.type}: ${response.status()} ${response.url()}`);
        }
      });
      await login(page, tenant);

      for (const viewport of ACTIVE_VIEWPORTS) {
        await page.setViewportSize({ width: viewport, height: 900 });
        for (const [pathname, heading, slug] of ACTIVE_ROUTES) {
          await openAdminRoute(page, tenant, pathname);
          await page.getByRole("heading", { name: heading, exact: true }).waitFor();
          if (pathname !== "/admin") {
            const pageTabs = page.locator(".admin-content-tabs").first();
            await pageTabs.waitFor();
            const activePageTabs = pageTabs.locator(
              '.admin-content-tab[aria-current="page"], .admin-content-tab[aria-selected="true"], .admin-content-tab[data-active="true"]'
            );
            assert(
              (await activePageTabs.count()) === 1,
              `${tenant.type}-${slug}-${viewport}: expected exactly one active page tab.`
            );
            await page.waitForTimeout(150);
            const [tabListBox, activeTabBox] = await Promise.all([
              pageTabs.boundingBox(),
              activePageTabs.first().boundingBox(),
            ]);
            assert(
              tabListBox &&
                activeTabBox &&
                activeTabBox.x >= tabListBox.x - 1 &&
                activeTabBox.x + activeTabBox.width <= tabListBox.x + tabListBox.width + 1,
              `${tenant.type}-${slug}-${viewport}: active page tab is clipped outside the tab list.`
            );

            if (
              pathname === "/admin/site/operations" &&
              process.env.SCORE_ADMIN_QA_CLICK_SITE_TABS === "1"
            ) {
              const siteTabLabels = (await pageTabs.locator(".admin-content-tab").allTextContents()).map(
                (label) => label.trim()
              );
              for (const label of siteTabLabels) {
                await pageTabs.getByRole("link", { name: label, exact: true }).click();
                await page.waitForFunction(
                  (expectedLabel) => {
                    const activeTabs = [
                      ...document.querySelectorAll(
                        '.admin-content-tabs .admin-content-tab[aria-current="page"]'
                      ),
                    ];
                    return (
                      activeTabs.length === 1 &&
                      activeTabs[0].textContent?.trim() === expectedLabel
                    );
                  },
                  label
                );
              }
              await pageTabs.getByRole("link", { name: "운영", exact: true }).click();
              await page.getByRole("heading", { name: "운영 설정", exact: true }).waitFor();
            }
          }

          const stateTabLists = page.locator('.admin-content-tabs[role="tablist"]');
          for (let tabListIndex = 0; tabListIndex < (await stateTabLists.count()); tabListIndex += 1) {
            const stateTabList = stateTabLists.nth(tabListIndex);
            const stateTabs = stateTabList.getByRole("tab");
            if ((await stateTabs.count()) < 2) continue;
            await stateTabs.nth(1).click();
            await page.waitForFunction(
              ({ listIndex }) => {
                const lists = document.querySelectorAll('.admin-content-tabs[role="tablist"]');
                const tabs = lists[listIndex]?.querySelectorAll(".admin-content-tab");
                return (
                  tabs?.length &&
                  tabs[1]?.getAttribute("aria-selected") === "true" &&
                  lists[listIndex]?.querySelectorAll(
                    '.admin-content-tab[aria-selected="true"]'
                  ).length === 1
                );
              },
              { listIndex: tabListIndex }
            );
          }
          if (pathname === "/admin/pre-registrations") {
            const listTable = page
              .getByRole("heading", { name: "사전등록 목록", exact: true })
              .locator("xpath=following::table[1]");
            await listTable.waitFor();
            await page.waitForTimeout(1_200);
            await listTable.scrollIntoViewIfNeeded();
            await listTable.locator("xpath=..").evaluate((scroller) => {
              scroller.scrollLeft = scroller.scrollWidth;
            });
            const editButton = listTable.getByRole("button", { name: "수정", exact: true }).first();
            if (await editButton.count()) {
              const alignment = await editButton.locator("xpath=ancestor::td[1]").evaluate((cell) => {
                const buttons = [...cell.querySelectorAll("button")];
                const cellRect = cell.getBoundingClientRect();
                const left = Math.min(...buttons.map((button) => button.getBoundingClientRect().left));
                const right = Math.max(...buttons.map((button) => button.getBoundingClientRect().right));
                return {
                  cellCenter: cellRect.left + cellRect.width / 2,
                  controlsCenter: (left + right) / 2,
                };
              });
              assert(
                Math.abs(alignment.cellCenter - alignment.controlsCenter) <= 2,
                `${tenant.type}-${slug}-${viewport}: management buttons are not centered in their cell.`
              );
            }
          }
          await assertDocumentFits(page, `${tenant.type}-${slug}-${viewport}`);
          const filename = `${tenant.type}-${slug}-${viewport}.png`;
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
          checks.push({ tenant: tenant.type, viewport, route: pathname });
        }

        if (viewport === 390) {
          await openAdminRoute(page, tenant, "/admin");
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
      viewports: ACTIVE_VIEWPORTS,
      checks,
      runtimeErrors,
      screenshotCount:
        checks.length +
        (ACTIVE_VIEWPORTS.includes(390) ? ACTIVE_TENANTS.length : 0),
    };
    writeFileSync(path.join(EVIDENCE_ROOT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      path.join(EVIDENCE_ROOT, "VISUAL_QA.md"),
      [
        "# 관리자 반응형 시각 QA",
        "",
        `- 실행 시각: ${report.generatedAt}`,
        "- 결과: PASS",
        `- 화면폭: ${ACTIVE_VIEWPORTS.join("px, ")}px`,
        `- 화면 확인: ${checks.length}건 + 모바일 메뉴 ${
          ACTIVE_VIEWPORTS.includes(390) ? ACTIVE_TENANTS.length : 0
        }건`,
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
