import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";

const BASE_URL =
  process.env.SCORE_PREDICTION_QA_BASE_URL ?? "http://police.localhost:3200";
const ADMIN_USERNAME = process.env.SCORE_PREDICTION_QA_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.SCORE_PREDICTION_QA_ADMIN_PASSWORD;
const EVIDENCE_DIR = resolve(
  process.cwd(),
  process.env.SUPERLOOPY_EVIDENCE ??
    ".superloopy/evidence/frontend/20260822-admin-prediction-search"
);
const SCREENSHOT_DIR = resolve(EVIDENCE_DIR, "screenshots");
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
] as const;

type SearchResult = {
  submissionId: number;
  userName: string;
  examNumber: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function login(page: Page) {
  assert(
    ADMIN_USERNAME && ADMIN_PASSWORD,
    "SCORE_PREDICTION_QA_ADMIN_USERNAME과 SCORE_PREDICTION_QA_ADMIN_PASSWORD를 설정하세요."
  );
  await page.goto(`${BASE_URL}/admin-login`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(ADMIN_USERNAME);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "관리자 로그인", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 60_000 });
}

async function findSearchFixture(page: Page): Promise<{ term: string; result: SearchResult }> {
  for (const term of ["0", "MOCK", "local"]) {
    const response = await page.evaluate(async (query) => {
      const request = await fetch(
        `/api/admin/search-submission?q=${encodeURIComponent(query)}`,
        { cache: "no-store" }
      );
      return {
        ok: request.ok,
        status: request.status,
        data: (await request.json()) as { results?: SearchResult[] },
      };
    }, term);
    assert(response.ok, `관리자 학생 검색 API가 ${response.status}를 반환했습니다.`);
    for (const result of response.data.results ?? []) {
      const canLoadPrediction = await page.evaluate(async (submissionId) => {
        const prediction = await fetch(
          `/api/prediction?page=1&limit=20&submissionId=${submissionId}`,
          { cache: "no-store" }
        );
        return prediction.ok;
      }, result.submissionId);
      if (canLoadPrediction) return { term, result };
    }
  }

  throw new Error("검색 검증에 사용할 활성 시험 제출 데이터를 찾지 못했습니다.");
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.documentWidth <= dimensions.viewportWidth + 1,
    `${label}: 페이지 가로 넘침 ${dimensions.documentWidth}px > ${dimensions.viewportWidth}px`
  );
}

async function verifyViewport(
  page: Page,
  runtimeErrors: string[],
  width: number,
  height: number
) {
  runtimeErrors.length = 0;
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE_URL}/exam/prediction`, { waitUntil: "domcontentloaded" });

  const heading = page.getByRole("heading", { name: "관리자 학생 조회", exact: true });
  await heading.waitFor({ timeout: 60_000 });
  const searchInput = page.getByPlaceholder("학생 이름 또는 수험번호로 검색하세요.");
  await searchInput.waitFor();
  await page.getByText("학생 이름 또는 수험번호를 검색한 뒤 조회할 학생을 선택하세요.", {
    exact: true,
  }).waitFor();
  await assertNoHorizontalOverflow(page, `선택 전 ${width}px`);
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, `police-admin-prediction-empty-${width}.png`),
    fullPage: true,
  });

  const fixture = await findSearchFixture(page);
  await searchInput.fill(fixture.term);
  const resultButton = page
    .getByRole("button", {
      name: new RegExp(
        `${escapeRegExp(fixture.result.userName)}.*${escapeRegExp(fixture.result.examNumber)}`
      ),
    })
    .first();
  await resultButton.waitFor({ timeout: 30_000 });

  const predictionResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/prediction" &&
      url.searchParams.get("submissionId") === String(fixture.result.submissionId)
    );
  });
  await resultButton.click();
  const response = await predictionResponse;
  assert(response.ok(), `선택 학생 합격예측 API가 ${response.status()}를 반환했습니다.`);

  await page.getByRole("button", { name: "선택 해제", exact: true }).waitFor();
  await page.getByText("내 표본 순위", { exact: true }).waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    (userName) => document.body.innerText.includes(userName),
    fixture.result.userName
  );
  await assertNoHorizontalOverflow(page, `선택 후 ${width}px`);
  assert(runtimeErrors.length === 0, `${width}px 런타임 오류: ${runtimeErrors.join(" | ")}`);

  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, `police-admin-prediction-selected-${width}.png`),
    fullPage: true,
  });

  return {
    width,
    submissionId: fixture.result.submissionId,
    userName: fixture.result.userName,
    examNumber: fixture.result.examNumber,
  };
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1"],
  });

  try {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          !message.text().startsWith("Failed to load resource:") &&
          !message.text().includes("[next-auth][error][CLIENT_FETCH_ERROR]")
        ) {
          runtimeErrors.push(message.text());
        }
      });

      await login(page);
      await page.route("**/api/prediction?**", async (route) => {
        const url = new URL(route.request().url());
        if (!url.searchParams.has("submissionId")) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({
              error: "위 검색창에서 학생 이름 또는 수험번호를 입력하여 합격예측 데이터를 조회하세요.",
              isAdminPreview: true,
              adminPreviewCandidates: [],
            }),
          });
          return;
        }
        await route.continue();
      });

      const results = [];
      for (const viewport of VIEWPORTS) {
        results.push(
          await verifyViewport(page, runtimeErrors, viewport.width, viewport.height)
        );
      }

      console.log(JSON.stringify({ passed: true, evidenceDir: EVIDENCE_DIR, results }, null, 2));
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
