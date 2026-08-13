import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext } from "playwright";

const baseUrl = "http://police.localhost:3200";
const widths = [390, 768, 1280] as const;
const screenshotsDir = resolve(
  process.cwd(),
  "../../.superloopy/evidence/frontend/20260812-police-region-save/screenshots",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function loginAdmin(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/admin-login`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
    const csrf = (await csrfResponse.json()) as { csrfToken?: string };
    const response = await fetch("/api/auth/callback/credentials?json=true", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrfToken: csrf.csrfToken ?? "",
        callbackUrl: window.location.origin,
        username: "010-0000-0000",
        password: "PoliceAdmin!123",
        adminOnly: "true",
        json: "true",
      }),
    });
    const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const session = (await sessionResponse.json()) as { user?: { role?: string } };
    return { status: response.status, role: session.user?.role };
  });
  await page.close();
  assert(result.status === 200 && result.role === "ADMIN", "Police admin login failed.");
}

async function verifyViewport(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  width: (typeof widths)[number],
) {
  const context = await browser.newContext({ viewport: { width, height: 920 } });
  await loginAdmin(context);
  const page = await context.newPage();
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  let savedPayload: Record<string, unknown> | null = null;
  await page.route("**/api/admin/regions", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    savedPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "경찰 모집 설정을 저장했습니다." }),
    });
  });

  await page.goto(`${baseUrl}/admin/regions`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "경찰 지역 및 모집인원 관리" }).waitFor();
  const toggle = page.getByLabel("경북 지역 활성화");
  await toggle.waitFor();
  await toggle.uncheck();
  await page.getByRole("button", { name: "변경 1개 저장" }).click();
  await page.getByText("경찰 모집 설정을 저장했습니다.", { exact: true }).waitFor();

  assert(savedPayload !== null, `${width}: PUT payload was not captured.`);
  const regions = (savedPayload as { regions?: Array<Record<string, unknown>> }).regions ?? [];
  assert(regions.length === 1, `${width}: expected one changed region.`);
  assert(typeof regions[0]?.regionId === "number", `${width}: regionId was not sent.`);
  assert(!("id" in regions[0]), `${width}: legacy id leaked from the new client.`);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.documentWidth <= dimensions.viewportWidth + 1,
    `${width}: horizontal overflow ${dimensions.documentWidth}px > ${dimensions.viewportWidth}px.`,
  );
  assert(runtimeErrors.length === 0, `${width}: runtime errors: ${runtimeErrors.join(" | ")}`);

  await page.screenshot({ path: resolve(screenshotsDir, `police-regions-${width}.png`), fullPage: true });
  await context.close();
}

async function main() {
  mkdirSync(screenshotsDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1"],
  });
  try {
    for (const width of widths) await verifyViewport(browser, width);
  } finally {
    await browser.close();
  }
  console.log("police-regions-save-visual-qa: 390/768/1280 passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
