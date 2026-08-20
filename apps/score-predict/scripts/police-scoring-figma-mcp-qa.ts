import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { buildPolice2026SecondScoringPromotionHtml } from "@/lib/promotions/police-2026-second-scoring";

const baseUrl = process.env.SCORE_PREDICT_LOCAL_URL ?? "http://localhost:3200";
const parsedBaseUrl = new URL(baseUrl);
assert(
  parsedBaseUrl.hostname === "localhost" || parsedBaseUrl.hostname === "127.0.0.1",
  `로컬 주소만 허용됩니다: ${baseUrl}`,
);

const evidenceDirectory = path.resolve(
  process.cwd(),
  "../../.superloopy/evidence/frontend/20260818-figma-mcp-landing",
);
const screenshotPath = path.join(evidenceDirectory, "actual-standalone-1920.png");
const assetBase = `${baseUrl}/promotions/police/2026-second-scoring`;

interface ExpectedRect {
  selector: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const expectedRects: ExpectedRect[] = [
  { selector: ".score-landing", left: 0, top: 0, width: 1920, height: 4506 },
  { selector: ".score-hero", left: 0, top: 0, width: 1920, height: 852 },
  { selector: ".score-hero__visual", left: 998, top: 263, width: 492, height: 401 },
  { selector: ".score-section--features", left: 0, top: 852, width: 1920, height: 1052 },
  { selector: ".score-feature:nth-child(1)", left: 430, top: 1278, width: 520, height: 200 },
  { selector: ".score-feature:nth-child(2)", left: 970, top: 1278, width: 520, height: 200 },
  { selector: ".score-feature:nth-child(3)", left: 430, top: 1498, width: 520, height: 200 },
  { selector: ".score-feature:nth-child(4)", left: 970, top: 1498, width: 520, height: 200 },
  { selector: ".score-section--how", left: 0, top: 1904, width: 1920, height: 1181 },
  { selector: ".score-how__preview", left: 411, top: 2316, width: 1090, height: 489 },
  { selector: ".score-event--one", left: 0, top: 3085, width: 1920, height: 708 },
  { selector: ".score-event--one .score-prizes", left: 1037, top: 3305, width: 445, height: 362 },
  { selector: ".score-event--two", left: 0, top: 3793, width: 1920, height: 713 },
  { selector: ".score-event--two .score-event__teacher", left: 1040, top: 3888, width: 473, height: 618 },
];

function assertClose(actual: number, expected: number, label: string) {
  assert(Math.abs(actual - expected) <= 0.1, `${label}: expected ${expected}, actual ${actual}`);
}

async function main() {
  await mkdir(evidenceDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.setContent(buildPolice2026SecondScoringPromotionHtml(assetBase), {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map(
          (image) =>
            image.complete && image.naturalWidth > 0
              ? Promise.resolve()
              : new Promise<void>((resolve, reject) => {
                  image.addEventListener("load", () => resolve(), { once: true });
                  image.addEventListener("error", () => reject(new Error(image.currentSrc)), {
                    once: true,
                  });
                }),
        ),
      );
    });

    for (const expected of expectedRects) {
      const rect = await page.locator(expected.selector).evaluate((element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, top: value.top, width: value.width, height: value.height };
      });
      assertClose(rect.left, expected.left, `${expected.selector} left`);
      assertClose(rect.top, expected.top, `${expected.selector} top`);
      assertClose(rect.width, expected.width, `${expected.selector} width`);
      assertClose(rect.height, expected.height, `${expected.selector} height`);
    }

    const textEvidence = await page.evaluate(() => ({
      howTo: document.querySelector(".score-section--how .score-kicker")?.textContent ?? "",
      eventOne: document.querySelector(".score-event--one .score-event__label")?.textContent ?? "",
      eventTwo: document.querySelector(".score-event--two .score-event__label")?.textContent ?? "",
      brokenImages: Array.from(document.images)
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.currentSrc),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    assert.equal(textEvidence.howTo, "HOW TO  USE");
    assert.equal(textEvidence.eventOne, "대구, 경북 합격예측  풀서비스 EVENT 01");
    assert.equal(textEvidence.eventTwo, "대구, 경북 합격예측  풀서비스 EVENT 02");
    assert.deepEqual(textEvidence.brokenImages, []);
    assert.equal(textEvidence.scrollWidth, textEvidence.clientWidth);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.close();
    console.log(`police-scoring-figma-mcp-qa: Figma 158:2 좌표·크기·원문·자산 검증 통과 (${screenshotPath})`);
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
