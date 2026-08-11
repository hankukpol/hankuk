import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium, type BrowserContext, type Page } from "playwright";

type Tenant = {
  type: "police" | "fire";
  schema: "score_predict_police" | "score_predict_fire";
  baseUrl: string;
  adminPassword: string;
};

const tenants: Tenant[] = [
  {
    type: "police",
    schema: "score_predict_police",
    baseUrl: "http://police.localhost:3200",
    adminPassword: "PoliceAdmin!123",
  },
  {
    type: "fire",
    schema: "score_predict_fire",
    baseUrl: "http://fire.localhost:3200",
    adminPassword: "FireAdmin!123",
  },
];
const widths = [390, 768, 1280] as const;
const screenshotsDir = resolve(
  process.cwd(),
  "../../.superloopy/evidence/frontend/20260811-submission-suspicion/screenshots",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loadLocalEnv() {
  const source = readFileSync(resolve(process.cwd(), ".env.docker.local"), "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

function tenantDatabaseUrl(schema: Tenant["schema"]) {
  const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert(raw, "DIRECT_URL or DATABASE_URL is required.");
  const url = new URL(raw);
  assert(
    ["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname),
    `Refusing non-local database host ${url.hostname}.`,
  );
  assert(url.port === "54332", `Refusing unexpected database port ${url.port}.`);
  if (url.hostname === "host.docker.internal") url.hostname = "127.0.0.1";
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function loginAdmin(context: BrowserContext, tenant: Tenant) {
  const page = await context.newPage();
  await page.goto(`${tenant.baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(
    async ({ password }) => {
      const username = "010-0000-0000";
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrf = (await csrfResponse.json()) as { csrfToken?: string };
      const response = await fetch("/api/auth/callback/credentials?json=true", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken: csrf.csrfToken ?? "",
          callbackUrl: window.location.origin,
          username,
          phone: username,
          password,
          json: "true",
        }),
      });
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await sessionResponse.json()) as { user?: { role?: string } };
      return { status: response.status, role: session.user?.role };
    },
    { password: tenant.adminPassword },
  );
  await page.close();
  assert(result.status === 200 && result.role === "ADMIN", `${tenant.type}: admin login failed.`);
}

async function setResultPageEnabled(context: BrowserContext, tenant: Tenant, enabled: boolean) {
  const page = await context.newPage();
  await page.goto(`${tenant.baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  const response = await page.evaluate(async ({ value }) => {
    const result = await fetch("/api/admin/site?section=features", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { "site.tabResultEnabled": value } }),
    });
    return { status: result.status, body: await result.json().catch(() => null) };
  }, { value: enabled });
  await page.close();
  assert(response.status === 200, `${tenant.type}: result page setting update failed.`);
}

async function readResultPageEnabled(context: BrowserContext, tenant: Tenant) {
  const page = await context.newPage();
  await page.goto(`${tenant.baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/admin/site", { cache: "no-store" });
    return { status: result.status, body: await result.json().catch(() => null) };
  });
  await page.close();
  assert(response.status === 200, `${tenant.type}: site setting read failed.`);
  const body = response.body as { settings?: Record<string, unknown> } | null;
  return body?.settings?.["site.tabResultEnabled"] !== false;
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.documentWidth <= dimensions.viewportWidth + 1,
    `${label}: horizontal overflow ${dimensions.documentWidth}px > ${dimensions.viewportWidth}px.`,
  );
}

async function captureTenant(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  tenant: Tenant,
  width: (typeof widths)[number],
  target: { id: number; phone: string },
) {
  const context = await browser.newContext({ viewport: { width, height: 920 } });
  await loginAdmin(context, tenant);

  const resultPage = await context.newPage();
  await resultPage.goto(`${tenant.baseUrl}/exam/result?submissionId=${target.id}`, {
    waitUntil: "networkidle",
  });
  const withheldHeading = resultPage.getByRole("heading", { name: "통계 제외 성적입니다" });
  try {
    await withheldHeading.waitFor();
  } catch (error) {
    const pageText = (await resultPage.locator("body").innerText()).slice(0, 1200);
    throw new Error(`${tenant.type}-${width}: excluded result notice missing. Page text:\n${pageText}`, {
      cause: error,
    });
  }
  assert(
    await resultPage.getByText("내 현재 석차: 관리자 검토 완료 후 표시", { exact: true }).isVisible(),
    `${tenant.type}-${width}: withheld rank label missing.`,
  );
  assert(
    (await resultPage.getByRole("button", { name: /공유/ }).count()) === 0,
    `${tenant.type}-${width}: share action must be hidden.`,
  );
  await assertNoHorizontalOverflow(resultPage, `${tenant.type}-student-${width}`);
  await resultPage.screenshot({
    path: resolve(screenshotsDir, `${tenant.type}-student-${width}.png`),
    fullPage: true,
  });
  await resultPage.close();

  const adminPage = await context.newPage();
  await adminPage.goto(`${tenant.baseUrl}/admin/submissions`, { waitUntil: "networkidle" });
  const searchInput = adminPage.getByPlaceholder("이름, 연락처 또는 응시번호 검색");
  await searchInput.fill(target.phone);
  const responsePromise = adminPage.waitForResponse(
    (response) => response.url().includes("/api/admin/submissions?") && response.status() === 200,
  );
  await adminPage.getByRole("button", { name: "검색", exact: true }).click();
  await responsePromise;
  await adminPage.getByRole("button", { name: "상세", exact: true }).first().click();
  await adminPage.getByRole("heading", { name: "성적 검토 판정" }).waitFor();
  assert(
    await adminPage.getByRole("button", { name: "정상 처리" }).isVisible(),
    `${tenant.type}-${width}: clear action missing.`,
  );
  assert(
    await adminPage.getByRole("button", { name: "통계 제외", exact: true }).isVisible(),
    `${tenant.type}-${width}: exclusion action missing.`,
  );
  await assertNoHorizontalOverflow(adminPage, `${tenant.type}-admin-${width}`);
  await adminPage.screenshot({
    path: resolve(screenshotsDir, `${tenant.type}-admin-${width}.png`),
    fullPage: true,
  });
  await adminPage.close();
  await context.close();
}

async function main() {
  loadLocalEnv();
  mkdirSync(screenshotsDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1,MAP fire.localhost 127.0.0.1"],
  });

  try {
    for (const tenant of tenants) {
      const db = new PrismaClient({ datasources: { db: { url: tenantDatabaseUrl(tenant.schema) } } });
      const controlContext = await browser.newContext();
      await loginAdmin(controlContext, tenant);
      const originalResultEnabled = await readResultPageEnabled(controlContext, tenant);
      try {
        await setResultPageEnabled(controlContext, tenant, true);
        const fixture = await db.submission.findFirst({
          where: {
            isSuspicious: true,
            suspicionStatus: "EXCLUDED",
            scoringStatus: "SCORED",
            subjectScores: { some: {}, none: { isFailed: true } },
          },
          orderBy: { id: "asc" },
          select: { id: true, user: { select: { phone: true } } },
        });
        assert(fixture, `${tenant.type}: excluded local fixture missing.`);
        for (const width of widths) {
          await captureTenant(browser, tenant, width, {
            id: fixture.id,
            phone: fixture.user.phone,
          });
        }
      } finally {
        await setResultPageEnabled(controlContext, tenant, originalResultEnabled);
        await controlContext.close();
        await db.$disconnect();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    `submission-suspicion-visual-qa: ${tenants.length * widths.length * 2} screenshots passed`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
