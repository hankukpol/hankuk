import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import { inspectOverlaps } from "./design-overlap-inspect.mjs";

const baseURL = process.env.DESIGN_AUDIT_URL || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
const output = process.env.DESIGN_AUDIT_OUTPUT || ".superloopy/evidence/frontend/2026-09-15-overlap-settings";
fs.mkdirSync(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  assert.ok((await context.request.post("/api/auth/login", { data: { email: "admin-police@mock.local", password: "test1234" } })).ok());
  const page = await context.newPage();
  const errors = [], writes = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    if (["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.continue();
    writes.push(route.request().url());
    return route.abort();
  });
  async function settle() {
    await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => ![...document.querySelectorAll(".admin-main .admin-skeleton, .admin-main .animate-spin")].some(el => el.getBoundingClientRect().height > 0));
  }
  async function capture(route, mode, width) {
    await settle();
    const overlap = await page.evaluate(inspectOverlaps);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    results.push({ route, mode, width, ...overlap, overflow, errors: [...errors], writes: [...writes] });
    await page.screenshot({ path: `${output}/${route.replaceAll("/", "-")}-${mode}-${width}.png` });
    fs.writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
    assert.deepEqual(overlap.issues, [], `${route}/${mode}/${width}`);
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
  }
  for (const width of [390, 768, 1024, 1137, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, createName, createTitle, editTitle, editSelector] of process.env.DESIGN_SETTINGS_EXTRA_ONLY === "1" ? [] : [
      ["settings/periods", "새 교시", "새 교시 추가", "교시 수정", '[aria-label="교시 수정"]'],
      ["settings/exams", "새 템플릿", "새 시험 템플릿", "시험 템플릿 수정", ".admin-table-link"],
      ["settings/exam-schedules", "일정 추가", "시험 일정 추가", "시험 일정 수정", ".admin-table-link"],
      ["settings/tuition", "새 플랜", "등록 플랜 추가", "등록 플랜 수정", '[title="플랜 수정"]'],
      ["settings/seats", "자습실 추가", "자습실 추가", "자습실 설정", ".admin-table-name .admin-table-link"],
    ]) {
      for (const mode of ["create", "edit"]) {
        await page.goto(`/police/admin/${route}`, { waitUntil: "load" });
        await settle();
        if (mode === "create") {
          const action = page.getByRole("button", { name: createName, exact: true, includeHidden: true });
          if (width < 768 && !await action.isVisible()) {
            const id = await action.evaluate(el => el.closest(".admin-mobile-tools-panel")?.id);
            assert.ok(id);
            await page.locator(`[data-mobile-tools-trigger][aria-controls=${JSON.stringify(id)}]`).click();
          }
          await action.click();
        } else await page.locator(editSelector).filter({ visible: true }).first().click();
        await page.getByRole("dialog", { name: mode === "create" ? createTitle : editTitle, exact: true }).waitFor();
        await capture(route, mode, width);
      }
      if (route === "settings/exams") {
        await page.goto(`/police/admin/${route}`, { waitUntil: "load" });
        await settle();
        await page.getByRole("button", { name: / 복사$/ }).first().click();
        await page.getByRole("dialog", { name: "시험 템플릿 복사", exact: true }).waitFor();
        await capture(route, "copy", width);
      }
    }
    for (const actionName of ["연장 수납", "환불 처리"]) {
      await page.goto("/police/admin/payments", { waitUntil: "load" });
      await settle();
      const action = page.getByRole("button", { name: actionName, exact: true, includeHidden: true });
      if (width < 768 && !await action.isVisible()) {
        const id = await action.evaluate(el => el.closest(".admin-mobile-tools-panel")?.id);
        assert.ok(id);
        await page.locator(`[data-mobile-tools-trigger][aria-controls=${JSON.stringify(id)}]`).click();
      }
      await action.click();
      const dialog = page.getByRole("dialog", { name: actionName, exact: true });
      await dialog.waitFor();
      await capture("payments", actionName === "연장 수납" ? "renew-empty" : "refund-empty", width);
      await dialog.locator(".admin-input-group input").click();
      await dialog.locator("ul button").first().click();
      await capture("payments", actionName === "연장 수납" ? "renew-selected" : "refund-selected", width);
    }
    await page.goto("/police/admin/staff", { waitUntil: "load" });
    await settle();
    await page.locator(".admin-table-link").first().click();
    await page.getByRole("dialog", { name: "직원 정보 수정", exact: true }).getByRole("button", { name: "비밀번호 재설정", exact: true }).click();
    await page.getByRole("dialog", { name: "비밀번호 재설정", exact: true }).waitFor();
    await capture("staff", "nested-password", width);
    console.log(`${width}: dialog overlap checks passed`);
  }
} finally {
  fs.writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
