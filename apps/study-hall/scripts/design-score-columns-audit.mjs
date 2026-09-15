import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const output = ".superloopy/evidence/frontend/2026-09-15-score-columns";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const context = await browser.newContext({ baseURL: "http://localhost:3000" });
  await context.request.post("/api/auth/login", { data: { email: "admin-police@mock.local", password: "test1234" } });
  await context.route("**/api/**", async route => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.abort();
    if (new URL(route.request().url()).pathname.endsWith("/morning-exams/weekly")) {
      const response = await route.fetch();
      const summary = await response.json();
      // Browser-only layout fixture; no scores are saved to the mock or operating database.
      summary.dailyEntries = ["월", "화", "수", "목", "금"].map((dayOfWeek, i) => ({ date: `2026-09-${14 + i}`, dayOfWeek, subjectId: `layout-${i}`, subjectName: ["헌법", "경찰학", "형사법", "긴 이름 과목 비교", "헌법"][i] }));
      summary.rankings = ["김지훈", "박도윤", "긴이름가독성확인"].map((studentName, i) => ({ studentId: `layout-${i}`, studentName, dailyScores: Object.fromEntries(summary.dailyEntries.map(entry => [entry.date, { score: 80 + i }])), weeklyTotal: 400 + 5 * i, weeklyAverage: 80 + i, weeklyRank: i + 1 }));
      return route.fulfill({ json: summary });
    }
    return route.continue();
  });
  const page = await context.newPage();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 912 });
    await page.goto("/police/admin/exams?kind=morning");
    await page.getByRole("tab", { name: "주간 현황", exact: true }).click();
    const weekly = page.locator(".admin-weekly-score-table:visible");
    await weekly.waitFor({ timeout: 60000 });
    const measure = async (table, label) => {
      const cells = await table.locator("thead tr").first().locator("th").evaluateAll(nodes => nodes.map(el => ({ text: el.textContent, width: el.getBoundingClientRect().width })));
      const nameIndex = label === "weekly" ? 0 : 1;
      if (width < 768) {
        assert.ok(cells[nameIndex].width <= 96, JSON.stringify(cells));
        assert.ok(cells[nameIndex + 1].width <= 112, JSON.stringify(cells));
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      results.push({ width, label, cells });
      await page.screenshot({ path: `${output}/${label}-${width}.png` });
    };
    await measure(weekly, "weekly");
    await weekly.locator("..").evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.screenshot({ path: `${output}/weekly-scrolled-${width}.png` });
    await page.getByRole("tab", { name: "일일 입력", exact: true }).click();
    const daily = page.locator(".admin-score-entry-table:visible");
    await daily.waitFor();
    await measure(daily, "daily");
    await page.getByRole("tab", { name: "정기 모의고사", exact: true }).click();
    const regular = page.locator(".admin-score-entry-table:visible");
    await regular.waitFor({ timeout: 60000 });
    await measure(regular, "regular");
  }
  console.log(JSON.stringify(results));
} finally {
  fs.writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
