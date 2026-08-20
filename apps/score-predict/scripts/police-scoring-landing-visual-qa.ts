import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.SCORE_PREDICT_LOCAL_URL ?? "http://localhost:3200";
const parsedBaseUrl = new URL(baseUrl);
const expectActiveScoringCampaign =
  process.env.EXPECT_ACTIVE_POLICE_SCORING_PROMOTION === "1";
assert(
  parsedBaseUrl.hostname === "localhost" || parsedBaseUrl.hostname === "127.0.0.1",
  `로컬 주소만 허용됩니다: ${baseUrl}`,
);

const previewPath = "/police/local-preview/police-scoring";
const evidenceDirectory = path.resolve(
  process.cwd(),
  "../../.superloopy/evidence/frontend/20260817-police-scoring-landing/screenshots",
);
const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 },
];

async function main() {
  await mkdir(evidenceDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${baseUrl}${previewPath}`, { waitUntil: "domcontentloaded" });

    const topFrame = page.frameLocator("iframe[title='경찰 가채점 랜딩 로컬 미리보기']");
    const eventFrame = page.frameLocator("iframe[title='경찰 가채점 랜딩 로컬 미리보기 이벤트']");
    await topFrame.locator(".score-landing").waitFor();
    await eventFrame.locator(".score-event--one").waitFor();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("iframe")).every((frame) =>
        Array.from(frame.contentDocument?.images ?? []).every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      ),
    );
    const examFunctions = page.locator("[data-promotion-exam-functions='true'] #exam-functions");
    const examFunctionsFrame = page.locator("[data-promotion-exam-functions-frame='true']");
    await examFunctions.waitFor();
    await examFunctionsFrame.waitFor();

    const topMetrics = await topFrame.locator(".score-landing").evaluate((element) => {
      const documentElement = element.ownerDocument.documentElement;
      const brokenImages = Array.from(element.querySelectorAll<HTMLImageElement>("img"))
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.getAttribute("src"));
      const featureCards = Array.from(element.querySelectorAll<HTMLElement>(".score-feature"));
      const featureCardRects = featureCards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });
      const featureBodyLineCounts = featureCards.map((card) => {
        const paragraph = card.querySelector("p");
        if (!paragraph) return 0;
        const range = paragraph.ownerDocument.createRange();
        range.selectNodeContents(paragraph);
        return new Set(
          Array.from(range.getClientRects())
            .filter((rect) => rect.width > 0)
            .map((rect) => Math.round(rect.top * 10) / 10),
        ).size;
      });
      return {
        clientWidth: documentElement.clientWidth,
        scrollWidth: documentElement.scrollWidth,
        legacyEntryCount: element.querySelectorAll(".score-entry").length,
        brokenImages,
        featureCardRects,
        featureBodyLineCounts,
      };
    });
    const eventMetrics = await eventFrame.locator(".score-landing").evaluate((element) => {
      const documentElement = element.ownerDocument.documentElement;
      const brokenImages = Array.from(element.querySelectorAll<HTMLImageElement>("img"))
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.getAttribute("src"));
      const teacher = element.querySelector<HTMLElement>(".score-event--two .score-event__teacher");
      const teacherImage = teacher?.querySelector<HTMLImageElement>("img") ?? null;
      const teacherRect = teacher?.getBoundingClientRect() ?? null;
      const teacherImageRect = teacherImage?.getBoundingClientRect() ?? null;
      return {
        clientWidth: documentElement.clientWidth,
        scrollWidth: documentElement.scrollWidth,
        brokenImages,
        teacherCrop:
          teacher && teacherRect && teacherImageRect
            ? {
                overflow: window.getComputedStyle(teacher).overflow,
                widthRatio: teacherImageRect.width / teacherRect.width,
                heightRatio: teacherImageRect.height / teacherRect.height,
                leftRatio: (teacherImageRect.left - teacherRect.left) / teacherRect.width,
                topRatio: (teacherImageRect.top - teacherRect.top) / teacherRect.height,
              }
            : null,
      };
    });
    const outerMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const examFunctionsFrameRect = await examFunctionsFrame.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    const layoutOrder = await page.evaluate(() => {
      const top = document.querySelector<HTMLIFrameElement>(
        "iframe[title='경찰 가채점 랜딩 로컬 미리보기']",
      );
      const functions = document.querySelector<HTMLElement>("[data-promotion-exam-functions='true']");
      const events = document.querySelector<HTMLIFrameElement>(
        "iframe[title='경찰 가채점 랜딩 로컬 미리보기 이벤트']",
      );
      return {
        topBottom: top?.getBoundingClientRect().bottom ?? -1,
        functionsTop: functions?.getBoundingClientRect().top ?? -1,
        functionsBottom: functions?.getBoundingClientRect().bottom ?? -1,
        eventsTop: events?.getBoundingClientRect().top ?? -1,
      };
    });

    assert.equal(topMetrics.scrollWidth, topMetrics.clientWidth, `${viewport.width}px 상단 iframe 가로 넘침`);
    assert.equal(eventMetrics.scrollWidth, eventMetrics.clientWidth, `${viewport.width}px 이벤트 iframe 가로 넘침`);
    assert.equal(outerMetrics.scrollWidth, outerMetrics.clientWidth, `${viewport.width}px 페이지 가로 넘침`);
    const expectedExamFunctionsWidth = Math.min(1060, viewport.width - 32);
    assert.equal(
      examFunctionsFrameRect.width,
      expectedExamFunctionsWidth,
      `${viewport.width}px 실제 기능 카드 폭이 1060px 기준과 다릅니다.`,
    );
    assert.equal(
      examFunctionsFrameRect.left,
      (viewport.width - expectedExamFunctionsWidth) / 2,
      `${viewport.width}px 실제 기능 카드가 가운데 정렬되지 않았습니다.`,
    );
    assert.equal(
      examFunctionsFrameRect.right,
      viewport.width - examFunctionsFrameRect.left,
      `${viewport.width}px 실제 기능 카드의 좌우 여백이 다릅니다.`,
    );
    assert.equal(topMetrics.legacyEntryCount, 0, `${viewport.width}px 임시 가채점 안내 카드가 남아 있습니다.`);
    assert(layoutOrder.topBottom <= layoutOrder.functionsTop + 1, `${viewport.width}px 실제 기능 UI가 상단 랜딩 뒤에 있지 않습니다.`);
    assert(layoutOrder.functionsBottom <= layoutOrder.eventsTop + 1, `${viewport.width}px 실제 기능 UI가 EVENT 01 앞에 있지 않습니다.`);
    assert.deepEqual(topMetrics.brokenImages, [], `${viewport.width}px 상단 이미지 로딩 실패`);
    assert.deepEqual(eventMetrics.brokenImages, [], `${viewport.width}px 이벤트 이미지 로딩 실패`);
    if (viewport.width === 1920) {
      assert.deepEqual(
        topMetrics.featureCardRects.map(({ left, width, height }) => ({ left, width, height })),
        [
          { left: 430, width: 520, height: 200 },
          { left: 970, width: 520, height: 200 },
          { left: 430, width: 520, height: 200 },
          { left: 970, width: 520, height: 200 },
        ],
        "1920px 기능 카드 크기와 가로 배치가 Figma 원본과 다릅니다.",
      );
    }
    if (viewport.width >= 1280) {
      assert.deepEqual(
        topMetrics.featureBodyLineCounts,
        [2, 2, 2, 2],
        `${viewport.width}px 기능 카드 본문 줄바꿈이 Figma 원본과 다릅니다.`,
      );
    }
    assert(eventMetrics.teacherCrop, `${viewport.width}px EVENT 02 강사 이미지가 없습니다.`);
    assert.equal(eventMetrics.teacherCrop.overflow, "hidden", `${viewport.width}px 강사 이미지 크롭이 적용되지 않았습니다.`);
    assert(
      eventMetrics.teacherCrop.widthRatio > 2.8 && eventMetrics.teacherCrop.widthRatio < 2.9,
      `${viewport.width}px 강사 이미지의 PC 기준 확대 비율이 유지되지 않습니다.`,
    );
    assert(
      eventMetrics.teacherCrop.heightRatio > 2.7 && eventMetrics.teacherCrop.heightRatio < 2.85,
      `${viewport.width}px 강사 이미지의 PC 기준 세로 크롭이 유지되지 않습니다.`,
    );
    assert(
      eventMetrics.teacherCrop.leftRatio < -0.9 && eventMetrics.teacherCrop.leftRatio > -1,
      `${viewport.width}px 강사 이미지의 PC 기준 가로 위치가 유지되지 않습니다.`,
    );
    assert(
      eventMetrics.teacherCrop.topRatio < -0.15 && eventMetrics.teacherCrop.topRatio > -0.25,
      `${viewport.width}px 강사 이미지의 PC 기준 세로 위치가 유지되지 않습니다.`,
    );
    for (const tabName of ["응시정보 입력", "내 성적 분석", "공지사항", "FAQ"]) {
      await page.getByRole("button", { name: tabName, exact: true }).waitFor();
    }
    await page.getByRole("button", { name: "내 성적 분석", exact: true }).click();
    await examFunctions.getByRole("heading", { name: "내 성적 분석 이용 안내", exact: true }).waitFor();
    await examFunctions.getByRole("link", { name: "로그인", exact: true }).waitFor();
    await examFunctions.getByRole("link", { name: "회원가입", exact: true }).waitFor();

    await page.screenshot({
      path: path.join(evidenceDirectory, `police-scoring-${viewport.width}.png`),
      fullPage: true,
    });
    await context.close();
    }

    const interactionContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const interactionPage = await interactionContext.newPage();
    await interactionPage.goto(`${baseUrl}${previewPath}`, { waitUntil: "domcontentloaded" });
    const interactionTopFrame = interactionPage.frameLocator(
      "iframe[title='경찰 가채점 랜딩 로컬 미리보기']",
    );
    const interactionExamFunctions = interactionPage.locator(
      "[data-promotion-exam-functions='true'] #exam-functions",
    );
    await interactionExamFunctions.waitFor();
    await interactionPage.waitForTimeout(500);

    await interactionTopFrame.getByRole("link", {
      name: /바로 채점하고 합격여부 확인 하기/,
    }).click();
    await interactionPage.waitForFunction(() => {
      const section = document.querySelector("[data-promotion-exam-functions='true'] #exam-functions");
      return section instanceof HTMLElement && Math.abs(section.getBoundingClientRect().top) < 120;
    });
    assert(
      (await interactionPage.evaluate(() => window.scrollY)) > 500,
      "히어로 CTA가 실제 시험 기능 UI로 이동하지 않았습니다.",
    );

    const noticesTab = interactionPage.getByRole("button", { name: "공지사항", exact: true });
    await noticesTab.click();
    await interactionPage.getByText("공지사항 검색", { exact: true }).waitFor();
    await interactionContext.close();

    const isolationContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const isolationPage = await isolationContext.newPage();
    const fireResponse = await isolationPage.goto(
      `${baseUrl}/fire/local-preview/police-scoring`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(fireResponse?.status(), 404, "소방 경로에서 경찰 가채점 미리보기가 노출됩니다.");

    await isolationPage.goto(`${baseUrl}/police`, { waitUntil: "domcontentloaded" });
    const activeScoringTemplateCount = await isolationPage
      .frameLocator("iframe")
      .locator('[data-promotion-template="police-2026-second-scoring"]')
      .count();
    assert.equal(
      activeScoringTemplateCount,
      expectActiveScoringCampaign ? 1 : 0,
      expectActiveScoringCampaign
        ? "현재 경찰 홈에 가채점 랜딩이 노출되지 않습니다."
        : "현재 경찰 홈이 새 가채점 랜딩으로 바뀌었습니다.",
    );
    if (expectActiveScoringCampaign) {
      assert.equal(
        await isolationPage.getByRole("navigation", { name: "공개 서비스 메뉴" }).count(),
        0,
        "가채점 랜딩 위에 중복 공개 메뉴가 노출됩니다.",
      );
    }
    await isolationContext.close();

    console.log(
      `police-scoring-landing-visual-qa: 390/768/1280/1920, 실제 기능 UI, CTA, 테넌트 격리, 경찰 홈 ${expectActiveScoringCampaign ? "가채점 캠페인 활성" : "기존 캠페인 유지"} 통과`,
    );
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
