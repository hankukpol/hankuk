import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const baseUrl = "http://police.localhost:3200";
const evidenceDir = resolve(
  process.cwd(),
  ".superloopy/evidence/frontend/20260821-korean-chart-tooltips"
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function login(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
    const csrf = (await csrfResponse.json()) as { csrfToken?: string };
    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken ?? "",
      callbackUrl: window.location.origin,
      username: "010-9000-0000",
      password: "PoliceLocal!123",
      json: "true",
    });
    const response = await fetch("/api/auth/callback/credentials?json=true", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return response.status;
  });
  assert(result === 200, `로그인 실패: ${result}`);
  await page.close();
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  assert(!hasOverflow, `${label}: 가로 스크롤이 발생했습니다.`);
}

async function hoverBarAndReadTooltip(page: Page, index: number) {
  const bars = page.locator(".recharts-bar-rectangle:visible, .recharts-rectangle:visible");
  const barCount = await bars.count();
  assert(barCount > index, `${index + 1}번째 차트 막대를 찾지 못했습니다. 현재 ${barCount}개`);
  await bars.nth(index).hover();
  const tooltip = page.locator(".recharts-tooltip-wrapper:visible").first();
  await tooltip.waitFor({ state: "visible" });
  return (await tooltip.innerText()).replace(/\s+/g, " ").trim();
}

async function verifyResultViewport(context: BrowserContext, width: number, height: number) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/exam/result`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "문항 분석" }).click();
  await page.getByRole("heading", { name: "문항별 정답률 분포" }).waitFor();
  // Recharts 막대가 진입 애니메이션을 끝낸 뒤 실제 hover target을 검증합니다.
  await page.waitForTimeout(1_200);
  await assertNoHorizontalOverflow(page, `경찰 성적 분석 ${width}px`);

  let tooltip = "모바일 목록형 화면";
  if (width >= 1000) {
    tooltip = await hoverBarAndReadTooltip(page, 9);
    assert(/\d+번 문항/.test(tooltip), `${width}px: 문항 번호 한글 문구가 없습니다. ${tooltip}`);
    assert(tooltip.includes("정답률"), `${width}px: 정답률 한글 문구가 없습니다. ${tooltip}`);
    assert(!tooltip.includes("correctRate"), `${width}px: 내부 필드명이 노출됐습니다. ${tooltip}`);
  }

  await page.screenshot({
    path: resolve(evidenceDir, `police-result-${width}-tooltip.png`),
    fullPage: false,
  });
  console.log(`[PASS] police result ${width}px: ${tooltip}`);
  await page.close();
}

async function verifyMainTooltips(context: BrowserContext) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}/exam/main`, { waitUntil: "networkidle" });

  const difficultySection = page
    .getByRole("heading", { name: "과목별 체감난이도 설문 결과" })
    .locator("xpath=ancestor::section[1]");
  const difficultyBar = difficultySection
    .locator(".recharts-bar-rectangle path:visible, .recharts-bar-rectangle rect:visible")
    .nth(2);
  await difficultyBar.hover();
  const difficultyTooltip = (
    await difficultySection.locator(".recharts-tooltip-wrapper:visible").first().innerText()
  ).replace(/\s+/g, " ").trim();
  assert(difficultyTooltip.includes("응답 비율"), `체감 난이도 툴팁 오류: ${difficultyTooltip}`);
  assert(!difficultyTooltip.includes("value"), `체감 난이도 내부 필드 노출: ${difficultyTooltip}`);
  await page.mouse.move(0, 0);

  const scoreSection = page
    .getByRole("heading", { name: "채점자 성적분포도" })
    .locator("xpath=ancestor::section[1]");
  const visibleScoreBar = scoreSection
    .locator(".recharts-bar-rectangle path:visible, .recharts-bar-rectangle rect:visible")
    .nth(2);
  await visibleScoreBar.hover();
  const visibleScoreTooltip = scoreSection
    .locator(".recharts-tooltip-wrapper:visible")
    .filter({ hasText: "채점자 수" })
    .first();
  await visibleScoreTooltip.waitFor({ state: "visible" });
  const scoreTooltip = (
    await visibleScoreTooltip.innerText()
  ).replace(/\s+/g, " ").trim();
  assert(scoreTooltip.includes("채점자 수"), `성적 분포 툴팁 오류: ${scoreTooltip}`);
  assert(!scoreTooltip.includes("count"), `성적 분포 내부 필드 노출: ${scoreTooltip}`);

  await assertNoHorizontalOverflow(page, "경찰 풀서비스 메인 1280px");
  console.log(`[PASS] police main: ${difficultyTooltip} / ${scoreTooltip}`);
  await page.close();
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1"],
  });
  const context = await browser.newContext();
  try {
    await login(context);
    await verifyMainTooltips(context);
    await verifyResultViewport(context, 390, 844);
    await verifyResultViewport(context, 768, 1024);
    await verifyResultViewport(context, 1280, 900);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
