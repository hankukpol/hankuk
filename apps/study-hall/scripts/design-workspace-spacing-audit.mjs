import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const output = ".superloopy/evidence/frontend/2026-09-15-workspace-spacing";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const context = await browser.newContext({ baseURL: "http://localhost:3000" });
  assert.ok((await context.request.post("/api/auth/login", { data: { email: "admin-police@mock.local", password: "test1234" } })).ok());
  await context.route("**/api/**", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 912 });
    for (const route of ["phone-submissions", "staff", "points", "interviews", "leave", "payments", "reports", "settings/rules"]) {
      await page.goto(`/police/admin/${route}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const scan = await page.evaluate(() => {
        const visible = el => el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden";
        const controls = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=radio]), main select, main button.admin-button')].filter(visible);
        const overlaps = [];
        for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i].getBoundingClientRect(), b = controls[j].getBoundingClientRect();
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) overlaps.push([controls[i].outerHTML.slice(0, 180), controls[j].outerHTML.slice(0, 180)]);
        }
        return { scrollWidth: document.documentElement.scrollWidth, overlaps };
      });
      results.push({ route, width, ...scan });
      if (route === "phone-submissions") {
        if (width < 768) await page.getByRole("button", { name: "휴대폰 조회 조건", exact: true }).click();
        const date = page.getByLabel("조회 날짜", { exact: true });
        const refresh = page.getByRole("button", { name: "새로고침", exact: true });
        const d = await date.boundingBox(), r = await refresh.boundingBox();
        assert.ok(d && r && Math.abs(d.y - r.y) <= 2, `date/refresh row at ${width}`);
        assert.ok(r.x - d.x - d.width >= 15, `date/refresh gap at ${width}`);
        if (width >= 768) {
          const view = page.getByRole("group", { name: "휴대폰 체크 보기" });
          if (await view.count()) {
            const v = await view.boundingBox();
            const panel = await page.locator("#phone-query-panel").boundingBox();
            assert.ok(panel.y - v.y - v.height >= 15, `view/filter spacing at ${width}`);
          }
        }
      }
      await page.screenshot({ path: `${output}/${route.replaceAll("/", "-")}-${width}.png`, fullPage: true });
    }
  }
  fs.writeFileSync(`${output}/errors.json`, JSON.stringify(errors, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(results.every(result => result.scrollWidth <= result.width + 1 && !result.overlaps.length), "Check audit.json for layout findings");
} finally {
  fs.writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(`${results.length} route/viewport checks passed`);
