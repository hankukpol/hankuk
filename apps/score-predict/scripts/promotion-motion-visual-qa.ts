import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Frame, type Page } from "playwright";

const baseUrl = process.env.PROMOTION_VISUAL_BASE_URL ?? "http://police.localhost:3200";
const evidenceDir = resolve(
  process.cwd(),
  "../../.superloopy/evidence/frontend/20260814-promotion-motion-restoration",
);
const screenshotsDir = resolve(evidenceDir, "screenshots");
const viewports = [390, 768, 1280] as const;

type MotionSnapshot = {
  total: number;
  visible: number;
  hidden: number;
  horizontalOverflow: boolean;
  floatAnimationName: string | null;
  floatTransform: string | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function promotionFrame(page: Page) {
  const iframe = page.locator('iframe[title="프로모션 랜딩"]');
  await iframe.waitFor({ state: "visible", timeout: 30_000 });
  const frame = await iframe.elementHandle().then((handle) => handle?.contentFrame());
  assert(frame, "프로모션 iframe 문서를 찾지 못했습니다.");
  await frame.waitForLoadState("domcontentloaded");
  return frame;
}

async function snapshot(frame: Frame): Promise<MotionSnapshot> {
  return frame.evaluate(() => {
    const animated = Array.from(document.querySelectorAll<HTMLElement>("[data-aos], [data-reveal]"));
    const floating = document.querySelector<HTMLElement>(
      '[data-motion~="float"], [data-promotion-float], [class*="heroFloat"]',
    );
    const overflowX = getComputedStyle(document.body).overflowX;
    return {
      total: animated.length,
      visible: animated.filter((element) => element.classList.contains("aos-animate")).length,
      hidden: animated.filter((element) => getComputedStyle(element).opacity === "0").length,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 &&
        overflowX !== "hidden" && overflowX !== "clip",
      floatAnimationName: floating ? getComputedStyle(floating).animationName : null,
      floatTransform: floating ? getComputedStyle(floating).transform : null,
    };
  });
}

async function verifyViewport(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  width: (typeof viewports)[number],
) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  const frame = await promotionFrame(page);
  await page.waitForTimeout(250);

  const before = await snapshot(frame);
  assert(before.total >= 10, `${width}px: 진입 애니메이션 대상이 충분하지 않습니다 (${before.total}).`);
  assert(before.visible >= 1, `${width}px: 첫 화면 요소가 표시되지 않았습니다.`);
  assert(before.hidden >= 1, `${width}px: 아래 섹션이 진입 전에 모두 노출됐습니다.`);
  assert(
    before.floatAnimationName && before.floatAnimationName !== "none",
    `${width}px: 히어로 휴대폰 부유 애니메이션이 없습니다.`,
  );
  assert(!before.horizontalOverflow, `${width}px: 프로모션 iframe에 가로 스크롤이 있습니다.`);
  const pageOverflow = await page.evaluate(() => {
    const overflowX = getComputedStyle(document.body).overflowX;
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 &&
      overflowX !== "hidden" && overflowX !== "clip";
  });
  assert(!pageOverflow, `${width}px: 공개 페이지에 가로 스크롤이 있습니다.`);

  await page.waitForTimeout(700);
  const floatAfterDelay = await snapshot(frame);
  assert(
    before.floatTransform !== floatAfterDelay.floatTransform,
    `${width}px: 휴대폰 이미지 transform이 시간에 따라 변하지 않습니다.`,
  );

  const targetTop = await frame.evaluate(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-aos], [data-reveal]"));
    const target = targets.find((element) => !element.classList.contains("aos-animate"));
    return target?.getBoundingClientRect().top ?? 0;
  });
  const iframeTop = await page.locator('iframe[title="프로모션 랜딩"]').evaluate((element) =>
    element.getBoundingClientRect().top + window.scrollY,
  );
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), Math.max(0, iframeTop + targetTop - 320));
  await page.waitForTimeout(1_000);

  const after = await snapshot(frame);
  assert(after.visible > before.visible, `${width}px: 스크롤 후 새 섹션이 나타나지 않았습니다.`);
  assert(runtimeErrors.length === 0, `${width}px 런타임 오류: ${runtimeErrors.join(" | ")}`);
  await page.screenshot({
    path: resolve(screenshotsDir, `promotion-motion-${width}.png`),
    fullPage: false,
  });
  await context.close();
  return { width, before, after };
}

async function verifyReducedMotion(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  const frame = await promotionFrame(page);
  const result = await frame.evaluate(() => {
    const animated = Array.from(document.querySelectorAll<HTMLElement>("[data-aos], [data-reveal]"));
    const floating = document.querySelector<HTMLElement>(
      '[data-motion~="float"], [data-promotion-float], [class*="heroFloat"]',
    );
    return {
      total: animated.length,
      hidden: animated.filter((element) => getComputedStyle(element).opacity === "0").length,
      animationName: floating ? getComputedStyle(floating).animationName : null,
      transitionDuration: animated[0] ? getComputedStyle(animated[0]).transitionDuration : null,
    };
  });
  assert(result.total >= 10, "모션 줄이기 검증 대상이 없습니다.");
  assert(result.hidden === 0, "모션 줄이기 환경에서 숨은 콘텐츠가 남았습니다.");
  assert(result.animationName === "none", "모션 줄이기 환경에서 부유 애니메이션이 정지하지 않았습니다.");
  await context.close();
  return result;
}

async function main() {
  mkdirSync(screenshotsDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const viewportResults = [];
    for (const width of viewports) viewportResults.push(await verifyViewport(browser, width));
    const reducedMotion = await verifyReducedMotion(browser);
    const evidence = {
      checkedAt: new Date().toISOString(),
      baseUrl,
      viewportResults,
      reducedMotion,
    };
    writeFileSync(resolve(evidenceDir, "motion-results.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
