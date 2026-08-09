import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

type TenantType = "police" | "fire";

const projectId = "prj_M7dR3Of2eUxUDCL3QGKcrBdDjQrC";
const teamId = "team_S1kpwEzE2Hbujvnuawv7OPz0";
const deployment = process.env.VERCEL_PREVIEW_URL?.replace(/\/$/, "");
const evidenceRoot = resolve(
  process.cwd(),
  ".superloopy/evidence/frontend/20260807-score-predict-tenant-split/preview"
);
const screenshotsDir = resolve(evidenceRoot, "screenshots");
const runtimeErrors: string[] = [];
const ignoredPlatformErrors: string[] = [];
const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getVercelToken() {
  const authPath = process.platform === "win32"
    ? resolve(process.env.APPDATA ?? "", "com.vercel.cli/Data/auth.json")
    : resolve(process.env.XDG_DATA_HOME ?? resolve(homedir(), ".local/share"), "com.vercel.cli/auth.json");
  const parsed = JSON.parse(readFileSync(authPath, "utf8")) as { token?: string };
  assert(parsed.token, "Vercel CLI auth token is missing.");
  return parsed.token;
}

async function getProtectionBypass() {
  const response = await fetch(`https://api.vercel.com/v9/projects/${projectId}?teamId=${teamId}`, {
    headers: { Authorization: `Bearer ${getVercelToken()}` },
  });
  assert(response.ok, `Failed to read Vercel project protection settings (${response.status}).`);
  const project = await response.json() as {
    protectionBypass?: Record<string, { scope?: string }>;
  };
  const entry = Object.entries(project.protectionBypass ?? {}).find(([, value]) => value.scope === "automation-bypass");
  assert(entry, "Vercel automation protection bypass token is missing.");
  return entry[0];
}

function record(name: string, detail: string) {
  checks.push({ name, ok: true, detail });
  console.log(`[PASS] ${name}: ${detail}`);
}

function attachDiagnostics(page: Page, label: string) {
  page.on("pageerror", (error) => runtimeErrors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("https://vercel.live/_next-live/feedback/feedback.js") && text.includes("Content Security Policy")) {
      ignoredPlatformErrors.push(`${label}: Vercel Preview toolbar blocked by the application CSP`);
      return;
    }
    runtimeErrors.push(`${label} console.error: ${text}`);
  });
}

async function login(context: BrowserContext, tenantType: TenantType) {
  assert(deployment, "VERCEL_PREVIEW_URL is required.");
  const page = await context.newPage();
  const authResponses: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/auth/")) {
      authResponses.push(`${response.request().method()} ${response.status()} ${response.url()}`);
    }
  });
  await page.goto(`${deployment}/${tenantType}/login`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.locator(tenantType === "police" ? "#username" : "#phone").fill("010-9000-0000");
  await page.locator("#password").fill(tenantType === "police" ? "PoliceLocal!123" : "FireLocal!123");
  await page.locator('form button[type="submit"]').click();
  try {
    await page.waitForURL((url) => url.pathname !== `/${tenantType}/login`, { timeout: 45_000 });
  } catch (error) {
    const body = (await page.locator("body").innerText()).slice(0, 800).replaceAll("\n", " | ");
    const cookies = (await context.cookies()).map((cookie) => cookie.name).join(", ");
    throw new Error(
      `${tenantType} Preview browser login did not navigate from ${page.url()}. ` +
      `auth responses: ${authResponses.join(" ; ") || "none"}; cookies: ${cookies || "none"}; body: ${body}`,
      { cause: error }
    );
  }
  await page.close();
}

async function verifyMain(context: BrowserContext, tenantType: TenantType, width: number) {
  assert(deployment, "VERCEL_PREVIEW_URL is required.");
  await login(context, tenantType);
  const page = await context.newPage();
  attachDiagnostics(page, `${tenantType}-preview-${width}`);
  await page.goto(`${deployment}/${tenantType}/exam/main`, { waitUntil: "networkidle", timeout: 45_000 });
  try {
    await page.getByRole("heading", { name: "채점자 성적분포도" }).waitFor({ timeout: 30_000 });
  } catch {
    const diagnostic = (await page.locator("body").innerText()).slice(0, 500).replaceAll("\n", " | ");
    throw new Error(`${tenantType} Preview main did not render at ${page.url()}: ${diagnostic}`);
  }
  const text = await page.locator("body").innerText();
  if (tenantType === "police") {
    assert(text.includes("헌법") && text.includes("형사법") && text.includes("경찰학"), "Police Preview subjects are missing.");
    assert(text.includes("경행경채"), "Police Preview career label is missing.");
    assert(!text.includes("소방학개론") && !text.includes("소방관계법규") && !text.includes("구급 경채"), "Fire content is visible in police Preview.");
  } else {
    assert(text.includes("소방학개론") && text.includes("소방관계법규") && text.includes("행정법총론"), "Fire Preview subjects are missing.");
    assert(text.includes("구조") && text.includes("구급"), "Fire Preview career labels are missing.");
    assert(!text.includes("헌법") && !text.includes("형사법") && !text.includes("경행경채"), "Police content is visible in fire Preview.");
  }
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!hasOverflow, `${tenantType} Preview has horizontal overflow at ${width}px.`);
  const filename = `${tenantType}-main-${width}.png`;
  await page.screenshot({ path: resolve(screenshotsDir, filename), fullPage: true });
  record(`${tenantType}-main-${width}`, `subjects separated, no horizontal overflow, ${filename}`);
  await page.close();
}

async function main() {
  assert(deployment?.startsWith("https://") && !deployment.includes("score-predict.vercel.app"), "A non-production HTTPS VERCEL_PREVIEW_URL is required.");
  mkdirSync(screenshotsDir, { recursive: true });
  const bypass = await getProtectionBypass();
  const browser = await chromium.launch({ headless: true });
  try {
    const selectedTenant = process.env.QA_TENANT as TenantType | undefined;
    for (const tenantType of ["police", "fire"] as const) {
      if (selectedTenant && selectedTenant !== tenantType) continue;
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1280, height: 900 },
      ]) {
        const context = await browser.newContext({
          viewport,
          extraHTTPHeaders: { "x-vercel-protection-bypass": bypass },
        });
        await verifyMain(context, tenantType, viewport.width);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  assert(runtimeErrors.length === 0, `Preview browser runtime errors: ${runtimeErrors.join(" | ")}`);
  const report = {
    generatedAt: new Date().toISOString(),
    deployment,
    checks,
    runtimeErrors,
    ignoredPlatformErrors,
  };
  writeFileSync(resolve(evidenceRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(
    resolve(evidenceRoot, "QA_REPORT.md"),
    [
      "# 경찰·소방 Vercel Preview 시각 QA",
      "",
      `- 실행 시각: ${report.generatedAt}`,
      `- 배포: ${deployment}`,
      "- 데이터: 별도 Supabase 스테이징 프로젝트의 고정 가상 데이터",
      "- 결과: PASS",
      "- 화면: 경찰·소방 각각 390px, 768px, 1280px",
      "- 검증: 과목·직렬 교차 없음, 가로 스크롤 없음, 브라우저 런타임 오류 없음",
      "- 참고: 애플리케이션 CSP가 차단한 Vercel Preview 툴바 오류는 플랫폼 노이즈로 별도 기록",
      "",
      ...checks.map((check) => `- PASS: ${check.name} - ${check.detail}`),
      "",
    ].join("\n"),
    "utf8"
  );
  console.log(`Evidence: ${evidenceRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
