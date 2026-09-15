import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseURL = "http://localhost:3000";
const output = ".superloopy/evidence/frontend/2026-09-15-analysis-filter";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const context = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  assert.ok((await context.request.post("/api/auth/login", { data: { email: "admin-police@mock.local", password: "test1234" } })).ok());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort());
  for (const width of [1137, 390, 768, 1024, 1280, 1600]) {
    await page.setViewportSize({ width, height: 912 });
    await page.goto("/police/admin/exams/students/import-student-4?kind=morning&examTypeId=mock-exam-type-police-1789041796073&from=2026-09-15&to=2026-09-15", { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
    for (const kind of ["morning", "regular"]) {
      const kindTab = page.getByRole("tab", { name: kind === "morning" ? "아침 모의고사" : "정기 모의고사", exact: true });
      if (await kindTab.getAttribute("aria-selected") !== "true") await kindTab.click();
      if (kind === "regular") await page.locator(".admin-filter-bar select").first().selectOption("import-http-regular", { force: true });
      await page.getByText("개인 성적을 불러오는 중입니다.", { exact: true }).waitFor({ state: "hidden", timeout: 60000 });
      assert.deepEqual((await page.getByRole("alert").allTextContents()).filter(text => text.trim()), []);
      if (width < 768) await page.getByRole("button", { name: "개인 성적 조회 조건", exact: true }).click();
      const filter = page.locator(".admin-filter-bar").first();
      await filter.waitFor({ state: "visible" });
      await page.evaluate(() => document.fonts.ready);
      const bounds = await filter.evaluate(el => [...el.querySelectorAll(":scope > label")].map(label => {
        const control = label.querySelector(".admin-input-group, select, input");
        const field = label.getBoundingClientRect(), rect = control.getBoundingClientRect();
        return { label: label.childNodes[0].textContent, field: { left: field.left, right: field.right }, control: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
      }));
      await page.screenshot({ path: `${output}/${kind}-${width}.png` });
      results.push({ width, kind, bounds, errors: [...errors] });
      fs.writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
      for (const entry of bounds) assert.ok(entry.control.left >= entry.field.left - 1 && entry.control.right <= entry.field.right + 1, `${width}/${kind}: ${entry.label} exceeds its field: ${JSON.stringify(entry)}`);
      for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i].control, b = bounds[j].control;
        assert.ok(Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1, `${width}/${kind}: controls overlap`);
      }
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const search = filter.getByPlaceholder("이름 또는 수험번호 검색");
      assert.ok((await search.inputValue()).includes("90005"), "Loaded student selection is preserved");
      await search.focus();
      const dropdown = filter.locator("ul");
      await dropdown.waitFor();
      assert.ok(await dropdown.evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1 && el.getBoundingClientRect().left >= -1));
      await search.blur();
      if (width < 768) await page.keyboard.press("Escape");
      console.log(`${width}/${kind}: fields contained, no overlap`);
    }
  }
} finally {
  await browser.close();
}
