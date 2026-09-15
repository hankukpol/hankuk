import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.DESIGN_AUDIT_URL || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
const output = process.env.DESIGN_AUDIT_OUTPUT || ".superloopy/evidence/frontend/2026-09-15-points-mobile";
fs.mkdirSync(output, { recursive: true });
const design = fs.readFileSync("DESIGN.md", "utf8");
const consoleScript = (heading) => {
  const section = design.slice(design.indexOf(heading));
  const match = section.match(/```js\s*([\s\S]*?)```/);
  assert.ok(match, `Missing console check: ${heading}`);
  return match[1];
};
const results = [];
const routes = (process.env.DESIGN_LIST_ROUTES || "points").split(",");
const widths = (process.env.DESIGN_AUDIT_WIDTHS || "390,768,1280").split(",").map(Number);
assert.ok(widths.every((width) => [390, 768, 1280, 1600].includes(width)));
assert.ok(routes.every((route) => /^[a-z0-9/-]+$/.test(route) && !route.includes("..")));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const contexts = new Map();
try {
  for (const width of widths) {
    for (const routeName of routes) {
    const assistant = routeName.startsWith("assistant/");
    const superAdmin = routeName.startsWith("super-admin/");
    const studentPortal = routeName.startsWith("student/");
    const home = routeName === "home" || routeName.endsWith("/home");
    const contextKey = `${width}:${superAdmin ? "super" : assistant ? "assistant" : studentPortal ? "student" : "admin"}`;
    let context = contexts.get(contextKey);
    if (!context) {
      context = await browser.newContext({ baseURL, viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce" });
      contexts.set(contextKey, context);
      const login = await context.request.post("/api/auth/login", { timeout: 90000, data: { email: superAdmin ? "super@mock.local" : assistant ? "assistant-police@mock.local" : "admin-police@mock.local", password: "test1234" } });
      assert.ok(login.ok(), "Mock login failed");
    }
    let target = routeName;
    if (studentPortal || routeName.endsWith("/current")) {
      const cookie = (await context.cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
      const response = await context.request.get("/api/police/students", { headers: { Cookie: cookie } });
      assert.ok(response.ok());
      const payload = await response.json();
      const students = Array.isArray(payload) ? payload : payload.students;
      const student = students.find((entry) => entry.studentNumber === "90001") ?? students[0];
      assert.ok(student?.id);
      if (studentPortal) {
        const auth = await context.request.post("/api/auth/student-login", { data: { division: "police", studentNumber: student.studentNumber, name: student.name } });
        assert.ok(auth.ok());
      } else target = routeName.replace(/current$/, student.id);
    }
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const targetPath = superAdmin ? `/${target}` : assistant || studentPortal ? `/police/${target}` : `/police/admin/${target}`;
    await page.goto(home ? targetPath.replace(/\/home$/, "") : targetPath, { waitUntil: "load", timeout: 90000 });
    await page.waitForLoadState("networkidle", { timeout: 1000 }).catch(() => {});
    await page.waitForFunction(() => ![...document.querySelectorAll(".admin-main .admin-skeleton")].some((el) => el.getBoundingClientRect().height > 0), null, { timeout: 60000 });
    await page.getByText("개인 성적을 불러오는 중입니다.", { exact: true }).waitFor({ state: "hidden", timeout: 60000 });
    await page.waitForFunction(() => ![...document.querySelectorAll(".admin-main .animate-spin")].some((el) => el.getBoundingClientRect().height > 0), null, { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.locator(".admin-main").isVisible());
    const tokens = process.env.DESIGN_TOKEN_CHECK === "1" && routeName === "warnings" ? await page.evaluate(() => {
      const fixture = document.createElement("section");
      fixture.className = "admin-shell";
      document.body.append(fixture);
      const results = [];
      const value = (name) => {
        const rgb = getComputedStyle(fixture).getPropertyValue(`${name}-rgb`).trim().split(/\s+/);
        if (rgb.length !== 3 || rgb.some((v) => !/^\d+$/.test(v))) throw new Error(`Missing RGB token ${name}`);
        return `rgb(${rgb.join(", ")})`;
      };
      try {
        for (const stage of ["1", "2", "interview", "withdraw"]) {
          const badge = document.createElement("span");
          badge.className = `border border-warn-${stage}-line bg-warn-${stage}-soft text-warn-${stage}`;
          badge.textContent = stage;
          fixture.append(badge);
          const actual = () => { const s = getComputedStyle(badge); return [s.color, s.backgroundColor, s.borderTopColor]; };
          const expected = [value(`--admin-warn-${stage}`), value(`--admin-warn-${stage}-soft`), value(`--admin-warn-${stage}-line`)];
          if (JSON.stringify(actual()) !== JSON.stringify(expected)) throw new Error(`Warning token class ${stage}: ${JSON.stringify({ actual: actual(), expected })}`);
          fixture.style.setProperty("--admin-accent", "#ff00ff");
          fixture.style.setProperty("--admin-accent-rgb", "255 0 255");
          if (getComputedStyle(fixture).getPropertyValue("--admin-accent-rgb").trim() !== "255 0 255") throw new Error("Theme probe did not apply");
          if (JSON.stringify(actual()) !== JSON.stringify(expected)) throw new Error(`Accent leaked into warning ${stage}`);
          results.push({ stage, colors: actual() });
        }
        const input = document.createElement("input");
        input.className = "border-admin-danger-line";
        fixture.append(input);
        const danger = value("--admin-danger");
        if (getComputedStyle(input).borderTopColor !== danger) throw new Error("Invalid border token");
        input.focus();
        if (getComputedStyle(input).borderTopColor !== danger) throw new Error("Focused invalid border token");
        return results;
      } finally { fixture.remove(); }
    }) : undefined;
    const check = async (state) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const layout = await page.evaluate(consoleScript("### 레이아웃 점검"));
      const typography = await page.evaluate(consoleScript("### 계산값 점검"));
      let mobileAudit;
      if (width === 390 && process.env.DESIGN_MOBILE_CHECK === "1") {
        await page.evaluate(fs.readFileSync("scripts/mobile-audit.js", "utf8"));
        mobileAudit = await page.evaluate((kind) => window.__mobileAudit({ kind }), home ? "home" : "sub");
      }
      const metrics = await page.evaluate(() => {
        const visible = (el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden";
        const first = [...document.querySelectorAll("table,.admin-list-row,.admin-record-card,.admin-choice-card[data-dragging],[data-list-empty],.admin-empty-state,.admin-metric-strip,.admin-metric-box,.admin-check-summary,.admin-dashboard-metric,.admin-portal-summary,.admin-panel")].filter(visible).filter((el) => !el.closest('[role="dialog"]')).map((el) => el.getBoundingClientRect().top);
        const small = [...document.querySelectorAll("button,a,input,select,textarea")].filter(visible).filter((el) => !el.closest("[role=dialog],nextjs-portal,.admin-overlay")).filter((el) => (el.matches('input[type="checkbox"],input[type="radio"]') ? (el.closest("label") ?? el) : el).getBoundingClientRect().height < 44 && !el.matches(".admin-choice-button"));
        const nodes = [...document.querySelectorAll(".admin-main *")].filter(visible).filter((el) => !el.closest('[role="dialog"],.admin-notice,.admin-action-menu-panel,nextjs-portal'));
        const tabs = [...document.querySelectorAll(".admin-tabs,.admin-subtabs")].filter(visible).filter((el) => !el.matches(".admin-portal-nav"));
        const shape = {
          padding: parseFloat(getComputedStyle(document.querySelector(".admin-main")).paddingLeft),
          cards: nodes.filter((el) => el.matches("div,section,article,dl,ul,ol") && parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 8 && parseFloat(getComputedStyle(el).borderLeftWidth) > 0 && parseFloat(getComputedStyle(el).borderTopWidth) > 0).length,
          shadows: nodes.filter((el) => getComputedStyle(el).boxShadow !== "none").length,
          tinyText: nodes.filter((el) => [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 13).length,
          wrappedTabs: tabs.filter((el) => new Set([...el.children].filter(visible).map((child) => Math.round(child.getBoundingClientRect().top))).size > 1).length,
          folderTabs: tabs.flatMap((el) => [...el.children].filter(visible)).filter((el) => parseFloat(getComputedStyle(el).borderTopWidth) > 0 || !["rgba(0, 0, 0, 0)", "transparent"].includes(getComputedStyle(el).backgroundColor)).length,
        };
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, firstDataTop: Math.min(...first), headerHeight: document.querySelector(".admin-mobile-topbar")?.getBoundingClientRect().height ?? null, smallTargets: small.map((el) => el.getAttribute("aria-label") || el.textContent.trim()), shape };
      });
      await page.screenshot({ path: path.join(output, `${routeName.replaceAll("/", "-")}-${width}-${state}.png`) });
      results.push({ routeName, width, state, layout, typography, metrics, tokens, mobileAudit, errors: [...errors], writes: [...writes] });
      fs.writeFileSync(path.join(output, "audit.json"), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ routeName, width, state, firstDataTop: metrics.firstDataTop, n: layout.n }));
      if (process.env.DESIGN_MEASURE_ONLY === "1") return;
      if (mobileAudit) assert.equal(mobileAudit.통과, mobileAudit.전체, JSON.stringify(mobileAudit));
      assert.equal(layout.n, 0, JSON.stringify(layout));
      assert.deepEqual(typography.offScale, []);
      assert.equal(typography.fonts.length, 1);
      assert.match(typography.fonts[0], /Pretendard/i);
      assert.equal(metrics.overflow, 0);
      if (width >= 768) assert.equal(await page.locator(".admin-mobile-tools-heading:visible").count(), 0, "Mobile tools chrome must not appear on desktop");
      if (width === 390) {
        assert.ok(metrics.firstDataTop <= (home ? 240 : 160), `First data: ${metrics.firstDataTop}`);
        assert.equal(metrics.headerHeight, 52);
        assert.deepEqual(metrics.smallTargets, []);
        assert.deepEqual(metrics.shape, { padding: 16, cards: 0, shadows: 0, tinyText: 0, wrappedTabs: 0, folderTabs: 0 });
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
    };
    await check("initial");
    if (process.env.DESIGN_SEAT_CHECK === "1" && ["seats", "attendance", "assistant/check", "phone-submissions"].includes(routeName) && !(routeName === "attendance" && width < 768)) {
      // The administrator mobile route intentionally supplies no seat layout; assistant/check covers that component at390.
      if (routeName !== "seats") await page.getByRole(routeName === "phone-submissions" ? "button" : "tab", { name: "좌석", exact: true }).click();
      const seat = page.locator(".admin-seat-card").filter({ hasText: "김지훈" }).first();
      await seat.waitFor();
      const appearance = () => seat.evaluate((el) => {
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        return { opacity: s.opacity, shadow: s.boxShadow, background: s.backgroundColor, border: s.borderTopColor, width: r.width, height: r.height, selected: el.dataset.selected };
      });
      await page.mouse.move(0, 0);
      const before = await appearance();
      await seat.hover();
      await page.waitForTimeout(200);
      const hovered = await appearance();
      assert.equal(hovered.opacity, before.opacity);
      assert.equal(hovered.shadow, "none");
      assert.equal(hovered.width, before.width);
      assert.equal(hovered.height, before.height);
      const expectedHover = await seat.evaluate((el) => {
        const token = el.style.backgroundColor.includes("--admin-seat-assigned-surface") ? "--admin-accent-hover" : "--admin-surface-soft";
        const hex = getComputedStyle(el).getPropertyValue(token).trim().replace("#", "");
        return `rgb(${[0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(", ")})`;
      });
      assert.equal(hovered.background, expectedHover);
      await seat.click();
      const dialog = page.getByRole("dialog").last();
      await dialog.waitFor();
      assert.equal((await appearance()).selected, "true");
      await page.waitForTimeout(200);
      const selectedBorder = await seat.evaluate((el) => getComputedStyle(el).borderTopColor);
      assert.equal(selectedBorder, "rgb(10, 10, 10)");
      await page.screenshot({ path: path.join(output, `${routeName.replaceAll("/", "-")}-${width}-seat-dialog.png`) });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await check("seat-view");
      results.at(-1).seatAppearance = { before, hovered, selectedBorder };
    }
    if (width === 390 && routeName === "reports") {
      const disclosure = page.locator(".admin-responsive-disclosure").first();
      await disclosure.locator("summary").click();
      const date = disclosure.locator('input[type="date"]');
      await date.fill("2026-06-01");
      await disclosure.locator("summary").click();
      assert.equal(await date.isVisible(), false);
      await page.setViewportSize({ width: 1280, height: 900 });
      await date.waitFor({ state: "visible" });
      assert.equal(await date.inputValue(), "2026-06-01");
      await page.setViewportSize({ width: 390, height: 844 });
      await date.waitFor({ state: "hidden" });
    }
    if (width === 390 && routeName === "points") {
      const trigger = page.getByRole("button", { name: "상벌점 조회·부여", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "상벌점 조회·부여", exact: true });
      await dialog.waitFor({ state: "visible" });
      const inputs = dialog.locator('input[type="date"]');
      await inputs.first().fill("2026-06-01");
      await inputs.nth(1).fill("2026-06-30");
      await page.screenshot({ path: path.join(output, `${width}-tools.png`) });
      await page.keyboard.press("Escape");
      assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
      await trigger.click();
      assert.equal(await inputs.first().inputValue(), "2026-06-01");
      await dialog.getByRole("button", { name: "개별 부여", exact: true }).click();
      const grant = page.getByRole("dialog", { name: "개별 상벌점 부여", exact: true });
      await grant.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await grant.waitFor({ state: "hidden" });
      assert.ok(await dialog.isVisible());
      await page.keyboard.press("Escape");
      await check("tools-closed");
    } else if (routeName === "points") {
      assert.ok(await page.getByRole("button", { name: "개별 부여", exact: true }).isVisible());
      assert.ok(await page.locator('.admin-mobile-tools input[type="date"]').first().isVisible());
    }
    if (width === 390 && routeName !== "points") {
      for (const trigger of await page.locator('.admin-mobile-topbar [aria-haspopup="dialog"]').all()) {
        const title = await trigger.getAttribute("aria-label");
        await trigger.click();
        const dialog = page.getByRole("dialog", { name: title, exact: true });
        await dialog.waitFor({ state: "visible" });
        assert.ok(await dialog.locator("input,select,button").count());
        await page.screenshot({ path: path.join(output, `${routeName.replaceAll("/", "-")}-${width}-${title}.png`) });
        await page.keyboard.press("Escape");
        assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
      }
      await check("tools-closed");
    }
    if (width === 390 && routeName === "exams/students/current") {
      await page.getByRole("button", { name: "개인 성적 보고서", exact: true }).click();
      const tools = page.getByRole("dialog", { name: "개인 성적 보고서", exact: true });
      const popupPromise = page.waitForEvent("popup");
      await tools.getByRole("button", { name: "A4 인쇄 / PDF 저장", exact: true }).click();
      const popup = await popupPromise;
      await popup.locator("table").first().waitFor({ timeout: 30000 });
      assert.ok(await popup.locator("[data-report-panel]").count() >= 5);
      assert.equal(await popup.locator(".admin-mobile-tools-heading,[data-report-navigation]").count(), 0);
      await popup.screenshot({ path: path.join(output, "personal-print.png") });
      await popup.pdf({ path: path.join(output, "personal-print.pdf"), format: "A4", printBackground: true });
      await popup.close();
      await page.keyboard.press("Escape");
      await check("print-closed");
    }
    await page.close();
    }
  }
} finally {
  fs.writeFileSync(path.join(output, "audit.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ snapshots: results.length, output }));
