import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.DESIGN_AUDIT_URL || "http://127.0.0.1:3100";
const output = process.env.DESIGN_AUDIT_OUTPUT || ".superloopy/evidence/frontend/2026-09-08-design-audit";
const widths = (process.env.DESIGN_AUDIT_WIDTHS || "390,768,1280,1600").split(",").map(Number);
const filter = process.env.DESIGN_AUDIT_FILTER;
fs.mkdirSync(output, { recursive: true });

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

function inspect() {
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const label = (el) => `${el.tagName}.${String(el.className).slice(0, 160)} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 70)}`;
  const issues = [];
  const add = (rule, el, actual) => issues.push({ rule, element: label(el), actual });
  const all = [...document.querySelectorAll("body *")].filter(visible);
  const root = document.documentElement;
  if (root.scrollWidth > innerWidth + 1) add("document-overflow", root, root.scrollWidth);
  const allowedSizes = ["13px", "15px", "16px", "20px", "32px"];
  for (const el of all) {
    if (el.closest("nextjs-portal, [data-sonner-toaster]")) continue;
    const style = getComputedStyle(el);
    if (el.matches("main.admin-main")) {
      const expectedPadding = innerWidth >= 1024 ? 32 : innerWidth >= 768 ? 24 : 16;
      if (parseFloat(style.paddingLeft) !== expectedPadding || style.paddingTop !== "24px") add("page-padding", el, [style.paddingTop, style.paddingLeft]);
    }
    if (!el.children.length && el.textContent?.trim() && !["STYLE", "SCRIPT", "OPTION", "TITLE"].includes(el.tagName)) {
      if (!allowedSizes.includes(style.fontSize)) add("type-size", el, style.fontSize);
      if (!["400", "600", "700"].includes(style.fontWeight)) add("type-weight", el, style.fontWeight);
    }
    if (el.matches(".admin-dialog-title") && style.fontSize !== "20px") add("dialog-title", el, style.fontSize);
    if (el.matches(".admin-tab") && (style.fontSize !== "16px" || el.getBoundingClientRect().height < 55)) add("primary-tab-size", el, [style.fontSize, el.getBoundingClientRect().height]);
    if (el.matches(".admin-dashboard-metric-value") && style.fontSize !== "32px") add("metric-size", el, style.fontSize);
    if (el.matches(".admin-dashboard-metric-unit") && style.fontSize !== "13px") add("metric-unit-size", el, style.fontSize);
    if (el.matches("button, .admin-button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]):not([type=color]), select, textarea")) {
      if (el.closest(".admin-seat-grid, .recharts-wrapper, .admin-overlay, .sr-only")) continue;
      if (el.matches("input") && el.closest(".admin-input-group")) continue;
      const height = el.getBoundingClientRect().height;
      if (height < (el.closest("table") ? 35 : 43)) add("control-height", el, height);
      const radius = parseFloat(style.borderTopLeftRadius);
      if (radius > 8) add("pill-control", el, radius);
      if (el.matches("input, select, textarea") && radius !== 8) add("input-radius", el, radius);
      if (el.matches("input, select, textarea") && parseFloat(style.paddingLeft) < 12) add("input-padding", el, style.paddingLeft);
    }
    if (el.matches(".admin-tabs, .admin-tab, .admin-subtabs, .admin-subtab, .admin-drawer, table, th, td") && parseFloat(style.borderTopLeftRadius) !== 0) add("square-surface", el, style.borderTopLeftRadius);
    if (el.matches("[role=tab][aria-selected=true][aria-controls]") && !document.getElementById(el.getAttribute("aria-controls"))) add("missing-tabpanel", el, el.getAttribute("aria-controls"));
    if (el.matches(".admin-dialog-close")) {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - 44) > 1 || Math.abs(r.height - 44) > 1) add("close-size", el, [r.width, r.height]);
    }
    if (el.matches(".admin-dialog-body button[type=submit]")) add("scrolling-submit", el, "inside body");
    if (el.matches(".admin-overlay > button") && el.getBoundingClientRect().height < innerHeight - 1) add("overlay-hit-area", el, el.getBoundingClientRect().height);
  }
  for (const el of document.querySelectorAll("[id]")) {
    if (visible(el) && document.querySelectorAll(`[id="${CSS.escape(el.id)}"]`).length > 1) add("duplicate-id", el, el.id);
  }
  const frame = document.querySelector(".admin-content-frame");
  const bordered = (el) => {
    const s = getComputedStyle(el);
    return parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) > 0;
  };
  frame?.querySelectorAll("section,article,div").forEach((el) => {
    if (!visible(el) || !bordered(el) || el.closest("table, [role=dialog], .admin-seat-grid")) return;
    let parent = el.parentElement;
    for (let depth = 0; parent && parent !== frame && depth < 3; depth++, parent = parent.parentElement) {
      if (bordered(parent)) { add("nested-card", el, { parent: label(parent), border: getComputedStyle(parent).border, transition: getComputedStyle(parent).transition }); break; }
    }
  });
  return { title: document.title, issues, dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(visible).map((el) => el.getAttribute("aria-label")), tabs: [...document.querySelectorAll('[role="tab"]')].filter(visible).map((el) => el.textContent.trim()) };
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
async function writeReport() {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.writeFileSync(path.join(output, "audit.json"), JSON.stringify(results, null, 2));
      return;
    } catch (error) {
      if (attempt >= 4 || !["UNKNOWN", "EBUSY", "EPERM", "EINTR"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}
const contexts = {};
try {
  for (const [role, email] of Object.entries({ admin: "admin-police@mock.local", fire: "admin-fire@mock.local", assistant: "assistant-police@mock.local", super: "super@mock.local", student: "admin-police@mock.local", public: "" })) {
    const context = await browser.newContext({ baseURL, reducedMotion: "reduce" });
    if (email) {
      const login = await context.request.post("/api/auth/login", { data: { email, password: "test1234" } });
      if (!login.ok()) throw new Error(`Login failed: ${role} ${login.status()}`);
    }
    contexts[role] = context;
  }
  // APIRequestContext does not send Secure cookies over HTTP loopback, unlike Chromium.
  const adminCookie = (await contexts.admin.cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
  const studentResponse = await contexts.admin.request.get("/api/police/students", { headers: { Cookie: adminCookie } });
  if (!studentResponse.ok()) throw new Error(`Student fixture read failed: ${studentResponse.status()}`);
  const studentData = await studentResponse.json();
  const students = Array.isArray(studentData) ? studentData : studentData.students;
  const student = students?.[0];
  if (!student) throw new Error("A mock student is needed for detail and student portal coverage.");
  const studentLogin = await contexts.student.request.post("/api/auth/student-login", { data: { division: "police", studentNumber: student.studentNumber, name: student.name } });
  if (!studentLogin.ok()) throw new Error(`Student login failed: ${studentLogin.status()}`);

  let routes = files("app").filter((file) => path.basename(file) === "page.tsx" && !file.includes("[...slug]"))
    .map((file) => "/" + path.dirname(file).replaceAll("\\", "/").replace(/^app\/?/, "").replace("[division]", "police").replace("[id]", student.id));
  routes.push("/fire/admin", "/fire/admin/points", "/fire/admin/settings");
  if (filter) routes = routes.filter((route) => new RegExp(filter).test(route));
  for (const route of routes) {
    const role = route.startsWith("/fire") ? "fire" : route.startsWith("/super-admin") ? "super" : route.includes("/assistant") ? "assistant" : route.includes("/student/") && !route.includes("/students/") && !route.endsWith("/login") || route.endsWith("/student") ? "student" : route.includes("/admin") ? "admin" : "public";
    const page = await contexts[role].newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (req) => ["GET", "HEAD", "OPTIONS"].includes(req.request().method()) ? req.continue() : req.abort());
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(route, { waitUntil: "networkidle", timeout: 90000 });
      await page.evaluate(() => document.fonts.ready);
      const capture = async (state) => {
        if (await page.locator('#payment-view-settlement[aria-selected="true"]').isVisible().catch(() => false)) {
          await page.locator('#payment-view-panel-settlement .admin-metric-box').first().waitFor({ timeout: 10000 }).catch(() => {});
        }
        await page.getByText("정산 정보를 불러오는 중입니다.", { exact: true }).waitFor({ state: "hidden" }).catch(() => {});
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].every((el) => {
          const transform = getComputedStyle(el).transform;
          return transform === "none" || Math.abs(new DOMMatrixReadOnly(transform).m41) < 1;
        }));
        const data = await page.evaluate(inspect);
        results.push({ route, width, state, status: response?.status(), finalUrl: page.url(), errors: [...new Set(errors)], ...data });
        const filename = `${route.replace(/[^a-z0-9-]/gi, "_") || "home"}-${width}-${state.replace(/[^a-z0-9-]/gi, "_")}`;
        await page.screenshot({ path: path.join(output, `${filename}.png`), fullPage: false });
      };
      await capture("page");
      if (await page.getByRole("dialog").count()) {
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
      }
      // Tab and dialog inspection never submits a form or changes persisted data.
      const visitNestedTabs = async (container, prefix, depth = 0) => {
        if (depth > 2) return;
        const children = container.getByRole("tab");
        for (let index = 0; index < await children.count() && index < 20; index++) {
          const child = children.nth(index);
          if (!await child.isVisible() || !await child.isEnabled()) continue;
          await child.click();
          await page.waitForLoadState("networkidle");
          await capture(`${prefix}-subtab-${index}`);
          const id = await child.getAttribute("aria-controls");
          if (id) await visitNestedTabs(page.locator(`[id="${id}"]`), `${prefix}-subtab-${index}`, depth + 1);
        }
      };
      for (let index = 0; index < await page.getByRole("tab").count() && index < 40; index++) {
        const tab = page.getByRole("tab").nth(index);
        if (!await tab.isVisible() || !await tab.isEnabled()) continue;
        await tab.click();
        await page.waitForLoadState("networkidle");
        await capture(`tab-${index}`);
        const panelId = await tab.getAttribute("aria-controls");
        if (panelId) await visitNestedTabs(page.locator(`[id="${panelId}"]`), `tab-${index}`);
      }
      const openers = [/^학생 등록$/, /^개별 부여$/, /^일괄 부여$/, /^휴대폰 일괄 대여$/, /^일괄 대여$/, /^일반 수납$/, /^신규 등록(?: 수납)?$/, /^면담 기록$/, /^공지 (작성|등록)$/, /^외출.*등록$/, /^휴가.*등록$/, /출석 일괄 적용 열기$/, /^(연장 등록|연장 수납)$/, /^환불 처리$/, /^경고 조정$/, /^퇴실 처리$/];
      for (let index = 0; index < openers.length; index++) {
        if (await page.getByRole("dialog").count()) break;
        const opener = page.getByRole("button", { name: openers[index] }).first();
        if (!await opener.isVisible().catch(() => false) || !await opener.isEnabled()) continue;
        await opener.click();
        await page.waitForLoadState("networkidle");
        if (await page.getByRole("dialog").count()) {
          await capture(`dialog-${index}`);
          await visitNestedTabs(page.getByRole("dialog").last(), `dialog-${index}`);
          await page.keyboard.press("Escape");
          await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
        }
      }
      await writeReport();
      console.log(JSON.stringify({ route, width, snapshots: results.filter((r) => r.route === route && r.width === width).length, issues: results.filter((r) => r.route === route && r.width === width).reduce((n, r) => n + r.issues.length, 0), errors: [...new Set(errors)] }));
    }
    await page.close();
  }
} finally {
  await browser.close();
  await writeReport();
}
