import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { inspectOverlaps } from "./design-overlap-inspect.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.DESIGN_AUDIT_URL || "http://127.0.0.1:3100";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Local mock UI audit only");
const output = process.env.DESIGN_AUDIT_OUTPUT || ".superloopy/evidence/frontend/2026-09-08-design-audit/workflows";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const context = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  assert((await context.request.post("/api/auth/login", { data: { email: "admin-police@mock.local", password: "test1234" } })).ok());
  const cookie = (await context.cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
  const response = await context.request.get("/api/police/students", { headers: { Cookie: cookie } });
  assert(response.ok());
  const payload = await response.json();
  const students = Array.isArray(payload) ? payload : payload.students;
  const student = students.find((entry) => entry.studentNumber === "90001") ?? students[0];
  assert(student?.id);
  for (const width of (process.env.DESIGN_AUDIT_WIDTHS || "390,768,1280,1600").split(",").map(Number)) {
    const page = await context.newPage();
    async function capture(path) {
      const overlap = await page.evaluate(inspectOverlaps);
      results.push({ width, screenshot: path, ...overlap });
      await page.screenshot({ path });
      assert.deepEqual(overlap.issues, [], `${path}: form overlaps`);
    }
    await page.setViewportSize({ width, height: 900 });
    const pending = [];
    await page.route("**/api/**", async (route) => {
      if (["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.continue();
      if (route.request().url().includes("/points")) {
        pending.push({ body: route.request().postDataJSON(), route });
        return;
      }
      return route.abort();
    });
    async function visit(url) {
      await page.goto(url, { waitUntil: "load", timeout: 90000 });
      await page.waitForLoadState("networkidle", { timeout: 1000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => ![...document.querySelectorAll(".admin-main .admin-skeleton")].some(el => el.getBoundingClientRect().height > 0));
    }
    async function revealAction(name) {
      const openTools = page.locator('.admin-mobile-tools[data-open="true"]');
      if (width < 768 && await openTools.count()) {
        await page.keyboard.press("Escape");
        await openTools.waitFor({ state: "hidden" });
      }
      const action = page.getByRole("button", { name, exact: true, includeHidden: true });
      if (width >= 768) {
        await action.waitFor({ state: "visible" });
        return action;
      }
      if (!await action.isVisible()) {
        const id = await action.evaluate((el) => el.closest(".admin-mobile-tools-panel")?.id);
        assert.ok(id);
        await page.locator(`[aria-controls=${JSON.stringify(id)}][data-mobile-tools-trigger]`).click();
      }
      return action;
    }
    await visit("/police/admin/points");
    for (const mode of ["single", "batch"]) {
      await (await revealAction(mode === "single" ? "개별 부여" : "일괄 부여")).click();
      const dialog = page.getByRole("dialog", { name: mode === "single" ? "개별 상벌점 부여" : "일괄 상벌점 부여" });
      if (mode === "single") {
        await dialog.getByPlaceholder("학생을 선택해 주세요.").click();
        await dialog.getByRole("button", { name: new RegExp(student.studentNumber) }).click();
      } else {
        await dialog.getByRole("checkbox").first().check();
      }
      await dialog.getByLabel("적용 날짜").fill("2026-06-15");
      await dialog.getByLabel("규칙 선택").selectOption("");
      await dialog.getByRole("spinbutton", { name: "직접 점수 입력", exact: true }).fill("5");
      await dialog.getByLabel("사유 메모").fill("UI 검증용 입력: 실제 저장하지 않음");
      const submit = dialog.locator('button[type="submit"]');
      const before = pending.length;
      await submit.click();
      await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button[type="submit"]')].some((el) => el.disabled));
      for (let attempt = 0; pending.length === before && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(pending.length, before + 1);
      assert.equal(pending.at(-1).body.date, "2026-06-15");
      await page.keyboard.press("Escape");
      assert(await dialog.isVisible());
      assert(await dialog.getByRole("button", { name: "취소", exact: true }).isDisabled());
      await capture(`${output}/${mode}-${width}-pending.png`);
      await pending.at(-1).route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "테스트 오류: 입력값을 유지하고 다시 시도해 주세요." }) });
      await page.getByText("테스트 오류: 입력값을 유지하고 다시 시도해 주세요.").last().waitFor();
      assert(await submit.isEnabled());
      assert.equal(await dialog.getByLabel("사유 메모").inputValue(), "UI 검증용 입력: 실제 저장하지 않음");
      assert.equal(await dialog.getByLabel("적용 날짜").inputValue(), "2026-06-15");
      await capture(`${output}/${mode}-${width}-error.png`);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      results.push({ width, mode, requests: 1, datePreserved: true, pendingCloseGuard: true, errorRetryEnabled: true, noPersistedWrites: true });
    }
    await visit("/police/admin/seats");
    await page.locator(".admin-seat-card").filter({ hasText: student.name }).first().click();
    const seatDialog = page.getByRole("dialog", { name: student.name, exact: true });
    await seatDialog.waitFor();
    for (let index = 0; index < await seatDialog.getByRole("tab").count(); index++) {
      const tab = seatDialog.getByRole("tab").nth(index);
      await tab.click();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await seatDialog.getByText(/불러오는 중/).first().waitFor({ state: "hidden" });
      await page.waitForLoadState("networkidle", { timeout: 1000 }).catch(() => {});
      const panelId = await tab.getAttribute("aria-controls");
      assert.equal(await page.locator(`[id="${panelId}"]`).isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await capture(`${output}/seat-${width}-tab-${index}.png`);
      results.push({ width, seatTab: await tab.textContent(), panelLinked: true, noDocumentOverflow: true });
    }
    await page.keyboard.press("Escape");
    await seatDialog.waitFor({ state: "hidden" });
    await visit(`/police/admin/students/${student.id}`);
    for (const [button, title] of [["경고 조정", "경고 단계 조정"], ["퇴실 처리", "학생 퇴실 처리"]]) {
      await (await revealAction(button)).click();
      const detailDialog = page.getByRole("dialog", { name: title });
      await detailDialog.waitFor();
      assert.equal(await detailDialog.evaluate((el) => Math.round(el.getBoundingClientRect().width)), Math.min(width, 760));
      assert.equal(await detailDialog.locator('.admin-dialog-footer').count(), 1);
      await capture(`${output}/student-${width}-${button === "경고 조정" ? "warning" : "withdrawal"}.png`);
      await page.keyboard.press("Escape");
      await detailDialog.waitFor({ state: "hidden" });
      results.push({ width, detailDialog: title, drawerWidth: Math.min(width, 760), fixedFooter: true });
    }
    for (const [route, action, title] of [
      ["staff", "직원 추가", "직원 추가"],
      ["staff", /수정$/, "직원 정보 수정"],
      ["points/rules", "새 규칙", "상벌점 규칙 추가"],
      ["points/rules", "지각 수정", "상벌점 규칙 수정"],
    ]) {
      await visit(`/police/admin/${route}`);
      if (action instanceof RegExp) await page.locator(".admin-table-link").first().click();
      else await (await revealAction(action)).click();
      const editor = page.getByRole("dialog", { name: title, exact: true });
      await editor.waitFor();
      assert.equal(await editor.evaluate(el => Math.round(el.getBoundingClientRect().width)), Math.min(width, 760));
      assert.equal(await editor.locator(".admin-dialog-footer").count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await capture(`${output}/${route.replaceAll("/", "-")}-${width}-${title}.png`);
      await page.keyboard.press("Escape");
      await editor.waitFor({ state: "hidden" });
      results.push({ width, settingsEditor: title, drawerWidth: Math.min(width, 760), fixedFooter: true, noPersistedWrites: true });
    }
    if (width < 1024) {
      while (await page.getByRole("dialog").count()) await page.keyboard.press("Escape");
      const menu = page.getByRole("button", { name: "관리자 메뉴" });
      await menu.click();
      assert.equal(await menu.getAttribute("aria-expanded"), "true");
      await page.keyboard.press("Escape");
      assert.equal(await menu.getAttribute("aria-expanded"), "false");
      results.push({ width, mobileMenuEscape: true });
    }
    await page.close();
    console.log(`Actual form and seat workflows passed at ${width}px`);
  }
} finally {
  fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
