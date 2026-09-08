import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = process.env.DESIGN_AUDIT_OUTPUT || ".superloopy/evidence/frontend/2026-09-08-design-audit/workflows";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const context = await browser.newContext({ baseURL: process.env.DESIGN_AUDIT_URL || "http://127.0.0.1:3100", reducedMotion: "reduce" });
  assert((await context.request.post("/api/auth/login", { data: { email: "admin-police@mock.local", password: "test1234" } })).ok());
  for (const width of [390, 1600]) {
    const page = await context.newPage();
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
    await page.goto("/police/admin/points", { waitUntil: "networkidle" });
    for (const mode of ["single", "batch"]) {
      await page.getByRole("button", { name: mode === "single" ? "개별 부여" : "일괄 부여", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: mode === "single" ? "개별 상벌점 부여" : "일괄 상벌점 부여" });
      if (mode === "single") {
        await dialog.getByPlaceholder("학생을 선택해 주세요.").click();
        await dialog.getByRole("button", { name: /P-2026-001/ }).click();
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
      await page.waitForFunction(() => document.querySelector('[role="dialog"] button[type="submit"]')?.disabled);
      assert.equal(pending.length, before + 1);
      assert.equal(pending.at(-1).body.date, "2026-06-15");
      await page.keyboard.press("Escape");
      assert(await dialog.isVisible());
      assert(await dialog.getByRole("button", { name: "취소", exact: true }).isDisabled());
      await page.screenshot({ path: `${output}/${mode}-${width}-pending.png` });
      await pending.at(-1).route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "테스트 오류: 입력값을 유지하고 다시 시도해 주세요." }) });
      await page.getByText("테스트 오류: 입력값을 유지하고 다시 시도해 주세요.").last().waitFor();
      assert(await submit.isEnabled());
      assert.equal(await dialog.getByLabel("사유 메모").inputValue(), "UI 검증용 입력: 실제 저장하지 않음");
      assert.equal(await dialog.getByLabel("적용 날짜").inputValue(), "2026-06-15");
      await page.screenshot({ path: `${output}/${mode}-${width}-error.png` });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      results.push({ width, mode, requests: 1, datePreserved: true, pendingCloseGuard: true, errorRetryEnabled: true, noPersistedWrites: true });
    }
    await page.goto("/police/admin/seats", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /김지훈/ }).first().click();
    const seatDialog = page.getByRole("dialog", { name: "김지훈" });
    await seatDialog.waitFor();
    for (let index = 0; index < await seatDialog.getByRole("tab").count(); index++) {
      const tab = seatDialog.getByRole("tab").nth(index);
      await tab.click();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await seatDialog.getByText(/불러오는 중/).first().waitFor({ state: "hidden" });
      await page.waitForLoadState("networkidle");
      const panelId = await tab.getAttribute("aria-controls");
      assert.equal(await page.locator(`[id="${panelId}"]`).isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ path: `${output}/seat-${width}-tab-${index}.png` });
      results.push({ width, seatTab: await tab.textContent(), panelLinked: true, noDocumentOverflow: true });
    }
    await page.keyboard.press("Escape");
    await seatDialog.waitFor({ state: "hidden" });
    await page.goto("/police/admin/students/student-police-001", { waitUntil: "networkidle" });
    for (const [button, title] of [["경고 조정", "경고 단계 조정"], ["퇴실 처리", "학생 퇴실 처리"]]) {
      await page.getByRole("button", { name: button, exact: true }).click();
      const detailDialog = page.getByRole("dialog", { name: title });
      await detailDialog.waitFor();
      assert.equal(await detailDialog.evaluate((el) => Math.round(el.getBoundingClientRect().width)), Math.min(width, 760));
      assert.equal(await detailDialog.locator('.admin-dialog-footer').count(), 1);
      await page.screenshot({ path: `${output}/student-${width}-${button === "경고 조정" ? "warning" : "withdrawal"}.png` });
      await page.keyboard.press("Escape");
      await detailDialog.waitFor({ state: "hidden" });
      results.push({ width, detailDialog: title, drawerWidth: Math.min(width, 760), fixedFooter: true });
    }
    if (width < 1024) {
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
