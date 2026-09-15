import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const output = ".superloopy/evidence/frontend/2026-09-15-report-tabs";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const context = await browser.newContext({ baseURL: "http://localhost:3000", reducedMotion: "reduce" });
  assert.ok((await context.request.post("/api/auth/login", { data: { email: "admin-police@mock.local", password: "test1234" } })).ok());
  await context.route("**/api/**", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  for (const width of [390, 768, 1137, 1280]) for (const kind of ["morning", "regular"]) {
    await page.setViewportSize({ width, height: 912 });
    await page.goto(`/police/admin/exams/students/import-student-4?kind=${kind}&examTypeId=import-http-${kind}&from=2026-09-01&to=2026-09-15`);
    const tabs = page.getByRole("tablist", { name: "개인 성적 분석 항목" });
    await tabs.waitFor({ timeout: 60000 });
    for (const name of ["성적 요약", "학습 진단", "성적 추이", "과목 비교", "문항 분석", "순위·목표"]) {
      const tab = tabs.getByRole("tab", { name, exact: true });
      await tab.click();
      const panel = page.locator(`[id="${await tab.getAttribute("aria-controls")}"]`);
      await panel.waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await tab.getAttribute("aria-selected"), "true");
      for (const select of await panel.locator("[data-report-navigation] select").all()) {
        const options = await select.locator("option").evaluateAll(nodes => nodes.map(node => node.value));
        for (const option of options) {
          await select.selectOption(option);
          const group = select.locator("xpath=ancestor::div[@data-report-navigation]/..");
          const visibleSubjects = group.locator(":scope > section[data-report-panel]:not([hidden])");
          assert.notEqual(option, "");
          assert.equal(await visibleSubjects.count(), 1);
        }
        await select.selectOption(options[0]);
      }
      assert.equal(await panel.locator(".admin-metric-strip").count(), 0);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= width + 1, `${kind}/${name}/${width}: ${scrollWidth}`);
      results.push({ kind, name, width, scrollWidth, tables: await panel.locator("table").count() });
      await page.screenshot({ path: `${output}/${kind}-${name}-${width}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
} finally {
  fs.writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(`${results.length} tab/viewport checks passed`);
