import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ExamType, PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

const BASE_URL = "http://police.localhost:3200";
const PASSWORD = "mock1234!";

function getLocalPoliceDatabaseUrl() {
  const envText = readFileSync(resolve(process.cwd(), ".env.docker.local"), "utf8");
  const line = envText.split(/\r?\n/).find((candidate) => candidate.startsWith("DATABASE_URL="));
  assert(line, "로컬 Docker DATABASE_URL이 필요합니다.");
  const raw = line.slice("DATABASE_URL=".length).trim().replace(/^['\"]|['\"]$/g, "");
  const url = new URL(raw);
  assert(!/\.supabase\.(?:co|com)$/i.test(url.hostname), "운영 Supabase에서는 실행할 수 없습니다.");
  assert(["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname));
  assert.equal(url.port, "54332");
  if (url.hostname === "host.docker.internal") url.hostname = "127.0.0.1";
  url.searchParams.set("schema", "score_predict_police");
  return url.toString();
}

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: getLocalPoliceDatabaseUrl() } } });
  const browser = await chromium.launch({ headless: true });
  let pendingSubmissionId: number | null = null;
  try {
    const submission = await db.submission.findFirst({
      where: {
        exam: { isActive: true },
        examType: ExamType.CAREER,
        region: { name: "대구" },
        examNumber: { startsWith: "MOCK-" },
        scoringStatus: "SCORED",
      },
      orderBy: [{ finalScore: "desc" }, { id: "asc" }],
      select: { id: true, user: { select: { phone: true } } },
    });
    assert(submission, "대구 경행경채 로컬 목업 제출이 필요합니다.");

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const element = document.querySelector("#username");
      return Boolean(element && Object.keys(element).some(
        (key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"),
      ));
    });
    await page.locator("#username").fill(submission.user.phone);
    await page.locator("#password").fill(PASSWORD);
    await page.locator("main button[type='submit']").click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });

    const readJson = (path: string) => page.evaluate(async (target) => {
      const response = await fetch(target, { cache: "no-store" });
      return { status: response.status, body: await response.json() };
    }, path);
    const [result, prediction] = await Promise.all([
      readJson("/api/result"),
      readJson("/api/prediction"),
    ]);

    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(prediction.status, 200, JSON.stringify(prediction.body));
    assert.equal(result.body.submission.examType, "CAREER");
    assert.equal(result.body.statistics.hasCutoff, false);
    assert(result.body.scores.every((score: { isCutoff: boolean }) => score.isCutoff === false));
    assert.equal(prediction.body.summary.recruitCount, 3);
    assert.equal(prediction.body.summary.writtenPassCount, 8);
    assert.equal(prediction.body.summary.passMultiple, 2.67);
    assert.equal(prediction.body.summary.predictionGrade, null);
    assert.equal(prediction.body.summary.passLineScore, null);

    pendingSubmissionId = submission.id;
    await db.submission.update({
      where: { id: submission.id },
      data: { scoringStatus: "PENDING" },
    });
    await page.goto(`${BASE_URL}/exam/result`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "채점 대기 중입니다", exact: true }).waitFor({ timeout: 30_000 });
    assert.equal(
      await page.getByRole("heading", { name: "전체 성적 요약", exact: true }).count(),
      0,
      "채점 대기 제출에 성적 요약을 노출합니다."
    );
    await db.submission.update({
      where: { id: submission.id },
      data: { scoringStatus: "SCORED" },
    });
    pendingSubmissionId = null;

    console.log(JSON.stringify({
      passed: true,
      examType: result.body.submission.examType,
      totalScore: result.body.submission.totalScore,
      hasCutoff: result.body.statistics.hasCutoff,
      recruitCount: prediction.body.summary.recruitCount,
      writtenPassCount: prediction.body.summary.writtenPassCount,
      passMultiple: prediction.body.summary.passMultiple,
      predictionGrade: prediction.body.summary.predictionGrade,
      passLineScore: prediction.body.summary.passLineScore,
    }, null, 2));
  } finally {
    if (pendingSubmissionId) {
      await db.submission.update({
        where: { id: pendingSubmissionId },
        data: { scoringStatus: "SCORED" },
      }).catch(() => undefined);
    }
    await browser.close();
    await db.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
