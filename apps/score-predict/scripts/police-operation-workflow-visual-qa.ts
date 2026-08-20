import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = "http://police.localhost:3200";
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  "../../.superloopy/evidence/frontend/20260820-police-operation-workflow/screenshots",
);

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/admin-login`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((selector) => {
      const element = document.querySelector(selector);
      return Boolean(element && Object.keys(element).some(
        (key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"),
      ));
    }, "#username");
    await page.locator("#username").fill("010-0000-0000");
    await page.locator("#password").fill("PoliceAdmin!123");
    await page.getByRole("button", { name: "관리자 로그인", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/admin", { timeout: 60_000 });
    await page.goto(`${BASE_URL}/admin/site/features`, { waitUntil: "networkidle" });
    await page.getByText("시험 운영 권장 순서", { exact: true }).waitFor({ timeout: 30_000 });

    const captures: Array<{ width: number; height: number }> = [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 900 },
    ];

    for (const viewport of captures) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert.ok(
        overflow.scrollWidth <= overflow.viewportWidth + 1,
        `${viewport.width}px에서 가로 스크롤이 발생했습니다: ${JSON.stringify(overflow)}`,
      );
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `admin-operation-${viewport.width}.png`),
        fullPage: true,
      });
    }

    console.log(JSON.stringify({
      passed: true,
      page: "/admin/site/features",
      widths: captures.map(({ width }) => width),
      outputDir: OUTPUT_DIR,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
