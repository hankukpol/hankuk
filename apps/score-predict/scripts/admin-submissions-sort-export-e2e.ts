import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { chromium, type Page } from "playwright";

type SubmissionRow = {
  id: number;
  finalScore: number;
};

type SubmissionResponse = {
  pagination: {
    totalCount: number;
  };
  submissions: SubmissionRow[];
};

const APP_DIR = process.cwd();
const BASE_URL = "http://police.localhost:3200";
const EVIDENCE_ROOT = path.resolve(
  APP_DIR,
  process.env.SUPERLOOPY_EVIDENCE ??
    ".superloopy/evidence/frontend/20260822-admin-submissions-sort-export"
);
const SCREENSHOT_DIR = path.join(EVIDENCE_ROOT, "screenshots");
const VIEWPORTS = [390, 768, 1280] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertScoresSorted(rows: SubmissionRow[], direction: "asc" | "desc") {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1].finalScore;
    const current = rows[index].finalScore;
    if (direction === "asc") {
      assert(previous <= current, `Ascending sort failed: ${previous} > ${current}`);
    } else {
      assert(previous >= current, `Descending sort failed: ${previous} < ${current}`);
    }
  }
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/admin-login`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill("010-0000-0000");
  await page.locator("#password").fill("PoliceAdmin!123");
  await page.getByRole("button", { name: "관리자 로그인", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 60_000 });
}

async function readSubmissionApi(
  page: Page,
  direction: "asc" | "desc"
): Promise<SubmissionResponse> {
  const result = await page.evaluate(async (sortDirection) => {
    const response = await fetch(
      `/api/admin/submissions?limit=50&sortBy=finalScore&sortOrder=${sortDirection}`,
      { cache: "no-store" }
    );
    return {
      ok: response.ok,
      status: response.status,
      body: (await response.json()) as SubmissionResponse,
    };
  }, direction);
  assert(result.ok, `Submission API ${direction} failed: ${result.status}`);
  return result.body;
}

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP police.localhost 127.0.0.1"],
  });
  const runtimeErrors: string[] = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 500) runtimeErrors.push(`${response.status()} ${response.url()}`);
    });

    await login(page);

    const descending = await readSubmissionApi(page, "desc");
    const ascending = await readSubmissionApi(page, "asc");
    assert(descending.submissions.length > 1, "Not enough local submissions to verify sorting.");
    assertScoresSorted(descending.submissions, "desc");
    assertScoresSorted(ascending.submissions, "asc");
    assert(
      descending.pagination.totalCount === ascending.pagination.totalCount,
      "Ascending and descending queries returned different totals."
    );

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto(`${BASE_URL}/admin/submissions`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "제출 현황", exact: true }).waitFor();
      const sortSelect = page.getByLabel("제출 현황 정렬");
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/admin/submissions?") &&
            response.url().includes("sortBy=finalScore") &&
            response.url().includes("sortOrder=desc") &&
            response.ok()
        ),
        sortSelect.selectOption("finalScore-desc"),
      ]);
      await page.getByRole("button", { name: /성적 엑셀 다운로드/ }).waitFor();
      const documentSize = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      assert(
        documentSize.documentWidth <= documentSize.viewportWidth + 1,
        `${viewport}px document overflow: ${documentSize.documentWidth}px`
      );
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `police-admin-submissions-${viewport}.png`),
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    const sortSelect = page.getByLabel("제출 현황 정렬");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/admin/submissions?") &&
          response.url().includes("sortBy=finalScore") &&
          response.url().includes("sortOrder=asc") &&
          response.ok()
      ),
      page.getByRole("button", { name: "최종점수", exact: true }).click(),
    ]);
    assert(
      (await sortSelect.inputValue()) === "finalScore-asc",
      "Final-score table header did not switch the sort control to ascending."
    );
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "성적 엑셀 다운로드", exact: true }).click();
    const download = await downloadPromise;
    const downloadPath = path.join(EVIDENCE_ROOT, "제출현황-화면다운로드.xlsx");
    await download.saveAs(downloadPath);
    assert((await download.failure()) === null, "Browser Excel download failed.");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(readFileSync(downloadPath) as never);
    const worksheet = workbook.getWorksheet("제출현황");
    assert(worksheet, "제출현황 worksheet is missing.");
    assert(
      worksheet.rowCount === ascending.pagination.totalCount + 1,
      `Excel row count mismatch: ${worksheet.rowCount - 1} !== ${ascending.pagination.totalCount}`
    );
    const excelScores: number[] = [];
    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
      const value = Number(worksheet.getRow(rowIndex).getCell(12).value);
      assert(Number.isFinite(value), `Invalid final score in Excel row ${rowIndex}.`);
      excelScores.push(value);
    }
    assertScoresSorted(
      excelScores.map((finalScore, index) => ({ id: index, finalScore })),
      "asc"
    );

    assert(runtimeErrors.length === 0, `Runtime errors: ${runtimeErrors.join(" | ")}`);
    const generatedAt = new Date().toISOString();
    writeFileSync(
      path.join(EVIDENCE_ROOT, "VISUAL_QA.md"),
      [
        "# 관리자 제출현황 정렬·엑셀 시각 QA",
        "",
        `- 실행 시각: ${generatedAt}`,
        "- 결과: PASS",
        "- 확인 화면폭: 390px, 768px, 1280px",
        "- 최종점수 높은순·낮은순 API 정렬: PASS",
        `- 엑셀 전체 행 수: ${ascending.pagination.totalCount}건`,
        "- 엑셀 최종점수 오름차순: PASS",
        "- 화면 다운로드 이벤트: PASS",
        "- 문서 가로 스크롤: 없음 (표 내부 스크롤 유지)",
        "- 브라우저 500 응답·런타임 오류: 없음",
        "",
        "## Anti-slop preflight",
        "",
        "- 기존 관리자 정보밀도와 직선형 표 스타일을 유지했고 장식용 카드·그라디언트·과도한 라운딩을 추가하지 않음",
        "- 정렬은 익숙한 셀렉트와 표 헤더 화살표를 함께 사용해 조작 의미가 명확함",
        "- 다운로드 버튼은 기능을 직접 설명하며 불필요한 홍보성 문구나 중복 제목이 없음",
        "- 768px에서는 사이드바를 제외한 실제 콘텐츠 폭을 기준으로 필터를 세로 배치해 압축·겹침을 방지함",
        "- 390px·768px·1280px 모두 문서 전체 가로 넘침이 없고 넓은 표만 내부 스크롤을 유지함",
        "",
      ].join("\n")
    );
    console.log(
      JSON.stringify(
        {
          result: "passed",
          generatedAt,
          totalCount: ascending.pagination.totalCount,
          viewports: VIEWPORTS,
          runtimeErrors,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
