import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.DESIGN_AUDIT_URL || "http://127.0.0.1:3100";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Local mock UI audit only");
const output = process.env.DESIGN_AUDIT_OUTPUT || ".superloopy/evidence/frontend/2026-09-08-workflow-tabs/workflows";
const widths = (process.env.DESIGN_AUDIT_WIDTHS || "390,768,1280,1600").split(",").map(Number);
fs.mkdirSync(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });

try {
  for (const width of widths) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const login = await context.request.post("/api/auth/login", { data: { email: "admin-police@mock.local", password: "test1234" } });
    assert.ok(login.ok());
    const cookie = (await context.cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
    const studentResponse = await context.request.get("/api/police/students", { headers: { Cookie: cookie } });
    assert.ok(studentResponse.ok());
    const students = (await studentResponse.json()).students;
    const student = students[0];
    assert.ok(student?.id);
    let fixture = "";
    let settlementRequests = 0;
    const writeRequests = [];
    const pageErrors = [];
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        writeRequests.push(`${request.method()} ${url.pathname}`);
        return route.abort("blockedbyclient");
      }
      if (url.pathname.endsWith("/payments/settlement")) settlementRequests++;
      const identity = { studentId: student.id, studentName: student.name, studentNumber: student.studentNumber };
      if (fixture === "leave" && url.pathname.endsWith("/leave")) {
        const month = url.searchParams.get("month") || "2026-06";
        const permission = { id: "ui-only-leave", ...identity, type: "HOLIDAY", date: `${month}-15`, reason: "UI 검증용 사유. 병원 예약 일정과 이동 시간을 확인한 뒤 신청한 휴가입니다. ".repeat(3), approvedById: "ui-review", approvedByName: "UI 검증", status: "APPROVED", createdAt: `${month}-14T00:00:00.000Z` };
        return route.fulfill({ json: { permissions: [permission, { ...permission, id: "ui-only-outing", type: "OUTING", status: "USED" }] } });
      }
      if (fixture === "interview" && url.pathname.endsWith("/interviews")) {
        return route.fulfill({ json: { interviews: [{
          id: "ui-only-interview", ...identity, date: "2026-06-15", createdAt: "2026-06-15T05:00:00.000Z",
          trigger: "UI 검증용 기록", reason: "오전 자습 집중도 저하와 반복 지각에 대한 상담",
          content: "최근 수면 시간과 통학 동선을 확인했습니다.\n" + "학생의 학습 계획과 실제 수행 내역을 함께 검토하고 과목별 복습 시간을 조정했습니다. ".repeat(5),
          result: "다음 주 월요일 재면담 예정. 출석과 복습 수행 여부를 확인하고 조교 관찰 기록을 함께 검토합니다.",
          resultType: "INTERVIEW", createdById: "ui-review", createdByName: "UI 검증",
        }] } });
      }
      if (fixture === "points" && url.pathname.endsWith("/points/overview")) {
        const response = await route.fetch();
        assert.ok(response.ok());
        const data = await response.json();
        const record = {
          id: "ui-only-point", ...identity, ruleId: null, ruleName: "월간 학습 계획 이행",
          displayName: null, category: "REWARD", categoryLabel: "상점", points: 5,
          notes: "UI 검증용 메모. " + "지정 기간의 학습 목표 달성 여부를 확인한 뒤 적용한 기록입니다. ".repeat(5),
          recordedById: "ui-review", recordedByName: "UI 검증", date: "2026-06-15T00:00:00.000Z",
          createdAt: "2026-09-08T00:00:00.000Z", displayDateTime: "2026-06-15T00:00:00.000Z",
        };
        return route.fulfill({ json: { ...data, records: [record, { ...record, id: "ui-only-demerit", ruleName: "출결 확인", points: -2, category: "DEMERIT", categoryLabel: "벌점" }] } });
      }
      return route.continue();
    });

    async function settle() {
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    async function visit(route) {
      fixture = "";
      await page.goto(`/police/admin/${route}`, { waitUntil: "networkidle" });
      await settle();
    }
    async function tab(name) {
      await page.getByRole("tab", { name, exact: typeof name === "string" }).click();
      await settle();
      const selected = page.getByRole("tab", { name, exact: typeof name === "string" });
      assert.equal(await selected.getAttribute("aria-selected"), "true");
      const id = await selected.getAttribute("aria-controls");
      assert.ok(await page.locator(`[id="${id}"]`).isVisible());
    }
    async function capture(name, assertions) {
      await settle();
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        clippedActiveTabs: [...document.querySelectorAll('.admin-tabs [role="tab"][aria-selected="true"]')].filter((element) => element.getClientRects().length).filter((element) => {
          const tab = element.getBoundingClientRect();
          const list = element.closest('[role="tablist"]').getBoundingClientRect();
          return tab.left < list.left - 1 || tab.right > list.right + 1;
        }).length,
        cards: [...document.querySelectorAll(".admin-record-card")].filter((element) => element.getClientRects().length).map((element) => ({
          width: element.getBoundingClientRect().width,
          overflow: element.scrollWidth > element.clientWidth + 1,
          radius: getComputedStyle(element).borderTopLeftRadius,
        })),
      }));
      assert.equal(layout.overflow, false, `${name}: document overflow`);
      assert.equal(layout.clippedActiveTabs, 0, `${name}: active tab clipped`);
      assert.ok(layout.cards.every((card) => !card.overflow && card.radius === "8px"), `${name}: record cards`);
      assert.deepEqual(pageErrors, [], `${name}: runtime errors`);
      await page.screenshot({ path: path.join(output, `${width}-${name}.png`), fullPage: true });
      results.push({ width, name, assertions, layout, pageErrors: [...pageErrors] });
      fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
    }

    await visit("points");
    assert.equal(await page.getByRole("tab", { name: "부여 내역" }).getAttribute("aria-selected"), "true");
    await page.getByLabel("시작일", { exact: true }).fill("2026-06-01");
    await page.getByLabel("종료일", { exact: true }).fill("2026-06-30");
    await tab("학생별 순위");
    await page.getByRole("button", { name: "하위", exact: true }).click();
    await tab("부여 내역");
    assert.equal(await page.getByLabel("시작일", { exact: true }).inputValue(), "2026-06-01");
    fixture = "points";
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await page.locator("p:visible").filter({ hasText: /^월간 학습 계획 이행$/ }).waitFor();
    await capture("points-records-fixture", ["history default", "shared date draft persists", "past-month range", "long notes and positive/negative points"]);
    await tab("학생별 순위");
    assert.equal(await page.getByRole("button", { name: "하위", exact: true }).getAttribute("aria-pressed"), "true");
    await capture("points-ranking", ["ranking order persists"]);

    await visit("interviews");
    await tab(/^면담 권장 대상/);
    const recommended = page.locator("#interview-view-panel-recommended .admin-record-card").first();
    if (await recommended.count()) {
      const name = await recommended.locator("h3").textContent();
      await recommended.getByRole("button", { name: "바로 기록" }).click();
      await page.getByRole("dialog").waitFor();
      assert.ok((await page.getByRole("dialog").textContent()).includes(name));
      await page.keyboard.press("Escape");
    }
    await capture("interview-recommended", ["recommendation record action opens selected student"]);
    await tab("면담 이력");
    fixture = "interview";
    await page.getByLabel("조회 월", { exact: true }).fill("2026-06");
    await page.getByText("오전 자습 집중도 저하와 반복 지각에 대한 상담", { exact: true }).waitFor();
    await capture("interview-record-fixture", ["long reason/content/follow-up remain separate and readable"]);
    await tab(/^면담 권장 대상/);
    await tab("면담 이력");
    assert.equal(await page.getByLabel("조회 월", { exact: true }).inputValue(), "2026-06");

    await visit("leave");
    fixture = "leave";
    await page.getByLabel("조회 월", { exact: true }).fill("2026-06");
    await tab("학생별 사용 현황");
    await page.getByLabel("기준 월", { exact: true }).fill("2026-07");
    await capture("leave-usage", ["usage cards separate used/remaining/limit"]);
    await tab("미사용 휴가 정산");
    await page.getByLabel("정산 대상 월", { exact: true }).fill("2026-06");
    await page.getByRole("button", { name: "미리보기", exact: true }).click();
    await settle();
    await capture("leave-settlement", ["read-only settlement preview", "separate settlement month"]);
    await tab("학생별 사용 현황");
    assert.equal(await page.getByLabel("기준 월", { exact: true }).inputValue(), "2026-07");
    await page.getByRole("button", { name: "이 학생 내역 보기" }).click();
    await settle();
    assert.equal(await page.getByLabel("조회 월", { exact: true }).inputValue(), "2026-07");
    await capture("leave-history", ["usage to student history handoff preserves month and student"]);

    await visit("payments");
    const initiallyLoaded = settlementRequests;
    await page.getByLabel("기준 월", { exact: true }).fill("2026-06");
    await capture("payment-status", ["month summary belongs to status tab", "full-width comparison table"]);
    await tab("수납 내역");
    await page.getByLabel("검색", { exact: true }).fill(student.name);
    await page.getByLabel("시작일", { exact: true }).fill("2026-01-01");
    await tab("월별 수납 현황");
    assert.equal(await page.getByLabel("기준 월", { exact: true }).inputValue(), "2026-06");
    assert.equal(settlementRequests, initiallyLoaded, "hidden settlement does not load");
    await tab("수납 내역");
    assert.equal(await page.getByLabel("검색", { exact: true }).inputValue(), student.name);
    assert.equal(await page.getByLabel("시작일", { exact: true }).inputValue(), "2026-01-01");
    await page.getByLabel("검색", { exact: true }).fill("");
    await capture("payment-history", ["independent history filters persist", "amount/date/method/recorder columns"]);
    await tab("일일 정산");
    await page.getByRole("button", { name: "직접 선택", exact: true }).click();
    await page.locator('#payment-view-panel-settlement input[type="date"]').first().fill("2026-06-01");
    await settle();
    await tab("수납 내역");
    await tab("일일 정산");
    assert.equal(await page.locator('#payment-view-panel-settlement input[type="date"]').first().inputValue(), "2026-06-01");
    assert.ok(settlementRequests > initiallyLoaded);
    await capture("payment-settlement", ["custom range persists", "settlement refreshes on return"]);

    await visit("phone-submissions");
    const periods = page.getByRole("button", { name: /^2교시$/ });
    if (await periods.count()) await periods.click();
    const checkText = await page.locator("#phone-workspace-panel-check").textContent();
    await tab("이력 조회");
    await capture("phone-history", ["history is its own workflow"]);
    await tab("교시별 체크");
    assert.equal(await page.locator("#phone-workspace-panel-check").textContent(), checkText);
    await capture("phone-check", ["period/view/check state persists when returning from history"]);

    assert.deepEqual(writeRequests, [], "UI audit never submitted operating data");
    await context.close();
    console.log(JSON.stringify({ width, states: results.filter((result) => result.width === width).length, writes: 0, errors: pageErrors.length }));
  }
} finally {
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
