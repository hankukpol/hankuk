import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
const baseURL = process.env.DESIGN_AUDIT_URL || "http://127.0.0.1:3100";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
const output = process.env.DESIGN_AUDIT_OUTPUT || ".superloopy/evidence/frontend/2026-09-08-workflow-tabs/drafts";
fs.mkdirSync(output, { recursive: true });
const bundle = await build({ entryPoints: ["scripts/fixtures/design-morning-workspace.tsx"], bundle: true, format: "iife", write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const width of [390, 768, 1280, 1600]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      if (route.request().method() !== "GET") { writes.push(route.request().url()); return route.abort(); }
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/morning-exams/weekly")) return route.fulfill({ json: {
        examTypeId: "ui-morning", examTypeName: "UI 검증용 아침 모의고사", weekYear: 2026, weekNumber: 37,
        weekDateRange: { start: "2026-09-07", end: "2026-09-13" }, totalSubjectCount: 1,
        dailyEntries: [{ date: "2026-09-08", dayOfWeek: "화", subjectId: "ui-subject", subjectName: "형사법" }],
        rankings: [{ studentId: "ui-student", studentName: "김지훈", studentNumber: "UI-001", dailyScores: { "2026-09-08": { subjectName: "형사법", score: 80 } }, weeklyTotal: 80, weeklyAverage: 80, weeklyRank: 1 }],
      } });
      if (url.pathname.endsWith("/morning-exams")) return route.fulfill({ json: {
        examTypeId: "ui-morning", examTypeName: "UI 검증용 아침 모의고사", subjectId: "ui-subject", subjectName: "형사법", maxScore: 100, date: "2026-09-08",
        rows: [{ studentId: "ui-student", studentName: "김지훈", studentNumber: "UI-001", score: 80, notes: null }],
      } });
      return route.continue();
    });
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByLabel("김지훈 점수").fill("88");
    await page.getByLabel("김지훈 비고").fill("미저장 초안 유지");
    await page.getByRole("tab", { name: "주간 성적 현황", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await page.getByText("2026년 37주차", { exact: false }).waitFor();
    await page.screenshot({ path: path.join(output, `${width}-morning-weekly-fixture.png`), fullPage: true });
    await page.getByRole("tab", { name: "일일 성적 입력", exact: true }).click();
    assert.equal(await page.getByLabel("김지훈 점수").inputValue(), "88");
    await page.getByRole("tab", { name: "정기 모의고사", exact: true }).click();
    await page.getByRole("tab", { name: "아침 모의고사", exact: true }).click();
    assert.equal(await page.getByLabel("김지훈 비고").inputValue(), "미저장 초안 유지");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(output, `${width}-morning-draft-fixture.png`), fullPage: true });

    const login = await context.request.post("/api/auth/login", { data: { email: "super@mock.local", password: "test1234" } });
    assert.ok(login.ok());
    await page.goto("/super-admin/manage", { waitUntil: "networkidle" });
    const original = await page.getByLabel("지점 이름", { exact: true }).inputValue();
    await page.getByLabel("지점 이름", { exact: true }).fill("저장하지 않는 탭 초안");
    await page.getByRole("tab", { name: "운영 계정 관리", exact: true }).click();
    await page.screenshot({ path: path.join(output, `${width}-accounts.png`), fullPage: true });
    await page.getByRole("tab", { name: "지점 관리", exact: true }).click();
    assert.equal(await page.getByLabel("지점 이름", { exact: true }).inputValue(), "저장하지 않는 탭 초안");
    await page.getByLabel("지점 이름", { exact: true }).fill(original);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    results.push({ width, morningNestedDraftPreserved: true, superAdminDraftPreserved: true, writes: 0, errors });
    await context.close();
    console.log(`Nested workspace drafts passed at ${width}px`);
  }
} finally {
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
}
