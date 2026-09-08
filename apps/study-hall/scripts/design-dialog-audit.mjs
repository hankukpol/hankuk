import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
const output = process.env.DESIGN_AUDIT_OUTPUT || ".superloopy/evidence/frontend/2026-09-08-design-audit/dialogs";
fs.mkdirSync(output, { recursive: true });
await build({ entryPoints: ["scripts/fixtures/design-dialogs.tsx"], bundle: true, format: "iife", outfile: path.join(output, "fixture.js"), jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const width of [390, 768, 1280, 1600]) {
    const page = await browser.newPage({ viewport: { width, height: 568 }, reducedMotion: "reduce" });
    await page.goto(`${process.env.DESIGN_AUDIT_URL || "http://127.0.0.1:3100"}/login`, { waitUntil: "networkidle" });
    await page.addScriptTag({ path: path.join(output, "fixture.js") });
    const trigger = page.getByRole("button", { name: "Open fixture drawer" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Dialog keyboard and form fixture" });
    await dialog.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "dialog");
    const geometry = await dialog.evaluate((el) => {
      const footer = el.querySelector(".admin-dialog-footer").getBoundingClientRect();
      const close = el.querySelector(".admin-dialog-close").getBoundingClientRect();
      return { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, title: getComputedStyle(el.querySelector("h2")).fontSize, radius: getComputedStyle(el).borderRadius, footerBottom: footer.bottom, close: [close.width, close.height], overflow: document.body.style.overflow };
    });
    assert.equal(geometry.width, Math.min(width, 760));
    assert.equal(geometry.height, 568);
    assert.equal(geometry.title, "20px");
    assert.equal(geometry.radius, "0px");
    assert.deepEqual(geometry.close, [44, 44]);
    assert(geometry.footerBottom <= 569);
    assert.equal(geometry.overflow, "hidden");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Submit fixture");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "닫기");
    await dialog.getByRole("button", { name: "Submit fixture" }).click();
    assert.equal(await page.getByLabel("Submission count").textContent(), "0");
    await dialog.getByLabel("Required value").fill("valid");
    await dialog.getByRole("button", { name: "Submit fixture" }).click();
    assert.equal(await page.getByLabel("Submission count").textContent(), "1");
    for (const kind of ["confirm", "completion"]) {
      const opener = dialog.getByRole("button", { name: `Open nested ${kind}` });
      await opener.click();
      await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2);
      await page.keyboard.press("Shift+Tab");
      assert(await page.evaluate(() => document.activeElement.closest('[role="dialog"]') !== document.querySelector('[role="dialog"]')));
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1);
      assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
      assert.equal(await opener.evaluate((el) => el === document.activeElement), true);
    }
    await page.screenshot({ path: path.join(output, `drawer-${width}.png`) });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await page.getByRole("button", { name: "Open fixture modal" }).click();
    const modal = page.getByRole("dialog", { name: "Central modal" });
    const modalGeometry = await modal.evaluate((el) => ({ radius: getComputedStyle(el).borderRadius, footer: el.querySelector('.admin-dialog-footer').getBoundingClientRect().bottom, height: el.getBoundingClientRect().height }));
    assert.equal(modalGeometry.radius, "8px");
    assert(modalGeometry.height <= 536);
    assert(modalGeometry.footer <= 568);
    await page.screenshot({ path: path.join(output, `modal-${width}.png`) });
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden" });
    await page.getByLabel("Persistent draft").fill("preserved");
    await page.getByRole("tab", { name: "First", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Last");
    assert.equal(await page.getByLabel("Persistent draft").isVisible(), false);
    await page.keyboard.press("Home");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "First");
    assert.equal(await page.getByLabel("Persistent draft").inputValue(), "preserved");
    results.push({ width, height: 568, drawer: geometry, modal: modalGeometry, nativeValidation: true, singleSubmit: true, nestedDialogs: true, focusRestoration: true, scrollLock: true, disabledTabSkipped: true, draftPreserved: true });
    await page.close();
    console.log(`Dialog and tab behavior passed at ${width}px`);
  }
} finally {
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
