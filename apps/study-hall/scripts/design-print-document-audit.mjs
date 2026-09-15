import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const output = ".superloopy/evidence/frontend/2026-09-15-print-document";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const context = await browser.newContext({ baseURL: "http://localhost:3000", reducedMotion: "reduce" });
  assert.ok((await context.request.post("/api/auth/login", { data: { email: "admin-police@mock.local", password: "test1234" } })).ok());
  await context.route("**/api/**", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  context.on("page", p => p.on("pageerror", error => errors.push(error.message)));
  page.on("pageerror", error => errors.push(error.message));
  for (const kind of ["morning", "regular"]) {
    const examTypeId = kind === "morning" ? "import-http-morning" : "import-http-regular";
    await page.setViewportSize({ width: 1280, height: 912 });
    await page.goto(`/police/admin/exams/students/import-student-4?kind=${kind}&examTypeId=${examTypeId}&from=2026-09-01&to=2026-09-15`);
    await page.getByRole("button", { name: "A4 인쇄 / PDF 저장", exact: true }).waitFor({ timeout: 60000 });
    for (const summaryOnly of [false, true]) {
      const before = await page.locator("[data-report-panel]").evaluateAll(nodes => nodes.map(node => node.hidden));
      const popupPromise = page.waitForEvent("popup");
      await page.getByRole("button", { name: summaryOnly ? "학습 진단만 인쇄 / PDF 저장" : "A4 인쇄 / PDF 저장", exact: true }).click();
      const popup = await popupPromise;
      await popup.locator(".report-document").waitFor({ timeout: 30000 });
      await popup.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
      assert.deepEqual(await page.locator("[data-report-panel]").evaluateAll(nodes => nodes.map(node => node.hidden)), before);
      const label = `${kind}-${summaryOnly ? "summary" : "full"}`;
      for (const width of [390, 768, 1280]) {
        await popup.setViewportSize({ width, height: 912 });
        const result = await popup.evaluate(() => ({
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          tables: document.querySelectorAll("table").length,
          rows: document.querySelectorAll("tr").length,
          summaryTables: document.querySelectorAll(".report-summary-table").length,
          detailTables: document.querySelectorAll(".report-detail-table").length,
          charts: document.images.length,
          hiddenPanels: document.querySelectorAll("[data-report-panel][hidden]").length,
          remainingMetrics: document.querySelectorAll(".admin-metric-strip").length,
          overflowingTables: [...document.querySelectorAll("table")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).length,
        }));
        results.push({ label, ...result });
        assert.ok(result.scrollWidth <= width + 1, JSON.stringify(result));
        assert.equal(result.overflowingTables, 0);
        assert.equal(result.hiddenPanels, 0);
        assert.equal(result.remainingMetrics, 0);
        assert.ok(result.tables > 0, `${label}: missing tables`);
        await popup.screenshot({ path: `${output}/${label}-${width}.png`, fullPage: true });
      }
      await popup.emulateMedia({ media: "print" });
      await popup.pdf({ path: `${output}/${label}.pdf`, preferCSSPageSize: true, printBackground: true });
      await popup.screenshot({ path: `${output}/${label}-print.png`, fullPage: true });
      await popup.evaluate(() => { window.print = () => { document.body.dataset.printInvoked = "true"; }; });
      await popup.emulateMedia({ media: "screen" });
      await popup.getByRole("button", { name: "인쇄 / PDF 저장", exact: true }).click();
      await popup.waitForFunction(() => document.body.dataset.printInvoked === "true");
      await popup.close();
      console.log(`${label}: passed`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  fs.writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
