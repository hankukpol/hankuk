import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, request as playwrightRequest, type BrowserContext, type Page } from "playwright";

type TenantType = "police" | "fire";
const evidenceDir = resolve(
  process.env.SUPERLOOPY_EVIDENCE ?? ".superloopy/evidence/frontend/20260809-password-recovery"
);
const screenshotDir = resolve(evidenceDir, "screenshots");
const tenantConfig = {
  police: { host: "police.localhost:3200", identity: "010-9000-0000", password: "PoliceLocal!123" },
  fire: { host: "fire.localhost:3200", identity: "010-9000-0000", password: "FireLocal!123" },
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createTenantContext(width: number, height: number) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1"],
  });
  const context = await browser.newContext({
    viewport: { width, height },
  });
  return { browser, context };
}

async function assertNoHorizontalScroll(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${label}: horizontal scroll detected.`);
}

async function captureForgotPassword(tenantType: TenantType, width: number) {
  const { browser, context } = await createTenantContext(width, width === 390 ? 844 : 900);
  try {
    const page = await context.newPage();
    await page.goto(`http://${tenantConfig[tenantType].host}/forgot-password`, { waitUntil: "networkidle" });
    await page.getByText("비밀번호 찾기", { exact: true }).first().waitFor();
    await page.getByText("세션 확인 중...", { exact: true }).waitFor({ state: "hidden", timeout: 15000 });
    await page.getByRole("button", { name: "이메일 인증코드 받기" }).waitFor();
    await assertNoHorizontalScroll(page, `${tenantType}-${width}-forgot`);
    await page.screenshot({ path: resolve(screenshotDir, `${tenantType}-forgot-${width}.png`), fullPage: true });

    if (width === 390) {
      await page.getByRole("button", { name: "학원 관리자에게 일회용 코드를 받은 경우" }).click();
      await page.getByText("10분짜리 일회용 코드").waitFor();
      await assertNoHorizontalScroll(page, `${tenantType}-${width}-admin-code`);
      await page.screenshot({ path: resolve(screenshotDir, `${tenantType}-admin-code-${width}.png`), fullPage: true });
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

async function authenticateContext(context: BrowserContext, tenantType: TenantType) {
  const api = await playwrightRequest.newContext({
    baseURL: "http://127.0.0.1:3200",
    extraHTTPHeaders: {
      host: tenantConfig[tenantType].host,
      "x-forwarded-host": tenantConfig[tenantType].host,
      "x-forwarded-proto": "http",
    },
  });
  try {
    const csrfResponse = await api.get("/api/auth/csrf");
    const csrf = (await csrfResponse.json()) as { csrfToken?: string };
    assert(csrf.csrfToken, `${tenantType}: visual QA CSRF token missing.`);
    const callback = await api.post("/api/auth/callback/credentials", {
      form: {
        csrfToken: csrf.csrfToken,
        callbackUrl: `http://${tenantConfig[tenantType].host}`,
        json: "true",
        ...(tenantType === "police"
          ? { username: tenantConfig[tenantType].identity }
          : { phone: tenantConfig[tenantType].identity }),
        password: tenantConfig[tenantType].password,
        adminOnly: "false",
      },
    });
    assert(callback.ok(), `${tenantType}: visual QA authentication failed.`);
    const state = await api.storageState();
    await context.addCookies(
      state.cookies.map((cookie) => ({
        ...cookie,
        domain: tenantConfig[tenantType].host.split(":")[0],
      }))
    );
  } finally {
    await api.dispose();
  }
}

async function captureAccountSecurity(tenantType: TenantType) {
  const { browser, context } = await createTenantContext(1280, 900);
  try {
    await authenticateContext(context, tenantType);
    const page = await context.newPage();
    await page.goto(`http://${tenantConfig[tenantType].host}/account/security`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "계정 보안" }).waitFor();
    await page.getByRole("heading", { name: "복구 이메일" }).waitFor();
    await assertNoHorizontalScroll(page, `${tenantType}-account-security`);
    await page.screenshot({ path: resolve(screenshotDir, `${tenantType}-account-security-1280.png`), fullPage: true });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  mkdirSync(screenshotDir, { recursive: true });
  for (const tenantType of ["police", "fire"] as const) {
    for (const width of [390, 768, 1280]) {
      await captureForgotPassword(tenantType, width);
    }
    await captureAccountSecurity(tenantType);
  }
  const report = {
    result: "passed",
    viewports: [390, 768, 1280],
    tenants: ["police", "fire"],
    states: ["email reset", "administrator code", "authenticated account security"],
    horizontalScroll: false,
    screenshotDir,
  };
  writeFileSync(resolve(evidenceDir, "visual-qa.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
