import { readFileSync } from "node:fs";
import path from "node:path";
import { BonusType, ExamOperationPhase, ExamType, Prisma, PrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";

type JsonObject = Record<string, unknown>;
type RegionName = "대구" | "경북";
type PoliceExamType = (typeof ExamType.PUBLIC) | (typeof ExamType.CAREER);

const APP_DIR = process.cwd();
const POLICE_URL = "http://police.localhost:3200";
const FIRE_URL = "http://fire.localhost:3200";
const PASSWORD = "mock1234!";
const ADMIN_USERNAME = "010-0000-0000";
const ADMIN_PASSWORD = "PoliceAdmin!123";
const EXPECTED = {
  대구: { publicRecruit: 46, publicApplicants: 1045, careerRecruit: 3, careerApplicants: 45 },
  경북: { publicRecruit: 192, publicApplicants: 1595, careerRecruit: 9, careerApplicants: 56 },
} as const;
const EXPECTED_COUNTS = { PUBLIC: 220, CAREER: 40 } as const;
const EXPECTED_MODEL = "police-2026-2x-rank-first-v2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(name: string, detail: string) {
  console.log(`[PASS] ${name}: ${detail}`);
}

function loadLocalEnv() {
  const source = readFileSync(path.join(APP_DIR, ".env.docker.local"), "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

function tenantDatabaseUrl(schema: "score_predict_police" | "score_predict_fire") {
  const raw = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert(raw, "DIRECT_URL or DATABASE_URL is required.");
  const url = new URL(raw);
  assert(
    ["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname),
    `Refusing non-local database host ${url.hostname}.`
  );
  assert(url.port === "54332", `Refusing unexpected database port ${url.port}.`);
  if (url.hostname === "host.docker.internal") url.hostname = "127.0.0.1";
  url.searchParams.set("schema", schema);
  return url.toString();
}

function asObject(value: unknown, label: string): JsonObject {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value as JsonObject;
}

function asArray(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array.`);
  return value;
}

async function fetchJson(
  page: Page,
  route: string,
  options: { method?: "GET" | "PUT" | "POST"; body?: JsonObject } = {}
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(async ({ pathname, method, payload }) => {
        const response = await fetch(pathname, {
          method,
          cache: "no-store",
          ...(payload
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              }
            : {}),
        });
        const body = await response.json().catch(() => null);
        return { ok: response.ok, status: response.status, body };
      }, { pathname: route, method: options.method ?? "GET", payload: options.body });
    } catch (error) {
      const isTransientBrowserFetch =
        error instanceof Error &&
        (error.message.includes("Execution context was destroyed") || error.message.includes("Failed to fetch"));
      if (!isTransientBrowserFetch) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(750);
    }
  }
  throw new Error(`${route}: page kept navigating during API verification.`);
}

async function gotoWithRetry(page: Page, url: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      const isAborted = error instanceof Error && error.message.includes("ERR_ABORTED");
      if (!isAborted || attempt === 2) throw error;
      await page.waitForTimeout(500);
    }
  }
}

async function login(page: Page, baseUrl: string, username: string, password: string) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const authenticated = await page.evaluate(
    async ({ identity, secret }) => {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrf = (await csrfResponse.json()) as { csrfToken?: string };
      const body = new URLSearchParams({
        csrfToken: csrf.csrfToken ?? "",
        callbackUrl: window.location.origin,
        username: identity,
        password: secret,
        json: "true",
      });
      const response = await fetch("/api/auth/callback/credentials?json=true", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const payload = (await response.json()) as { url?: string };
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = (await sessionResponse.json()) as { user?: { id?: string; tenantType?: string } };
      return { status: response.status, payload, session };
    },
    { identity: username, secret: password }
  );
  assert(
    authenticated.status === 200 &&
      !authenticated.payload.url?.includes("error=") &&
      authenticated.session.user?.tenantType === "police",
    `Police authentication failed for ${username}.`
  );
}

async function assertMockLoginFlow(params: {
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  username: string;
  examId: number;
  submissionId: number;
  region: RegionName;
  examType: PoliceExamType;
  expectedRecruit: number;
  expectedApplicants: number;
}) {
  const context = await params.browser.newContext();
  try {
    const page = await context.newPage();
    await login(page, POLICE_URL, params.username, PASSWORD);

    const session = await fetchJson(page, "/api/auth/session");
    assert(session.ok, `${params.region} ${params.examType}: session API ${session.status}.`);
    const sessionUser = asObject(asObject(session.body, "session").user, "session.user");
    assert(sessionUser.tenantType === "police", `${params.region} ${params.examType}: wrong tenant session.`);

    const result = await fetchJson(page, `/api/result?optional=1&examId=${params.examId}`);
    assert(result.ok, `${params.region} ${params.examType}: result API ${result.status}.`);
    const submission = asObject(asObject(result.body, "result").submission, "result.submission");
    assert(submission.id === params.submissionId, `${params.region} ${params.examType}: wrong submission.`);
    assert(submission.regionName === params.region, `${params.region} ${params.examType}: wrong region.`);
    assert(submission.examType === params.examType, `${params.region} ${params.examType}: wrong exam type.`);
    assert(submission.examYear === 2026 && submission.examRound === 2, "Result did not use 2026 round 2.");

    const scores = asArray(asObject(result.body, "result").scores, "result.scores").map((item) =>
      asObject(item, "score")
    );
    const names = scores.map((item) => item.subjectName);
    const expectedSubjects =
      params.examType === ExamType.PUBLIC
        ? ["헌법", "형사법", "경찰학"]
        : ["범죄학", "형사법", "경찰학"];
    assert(JSON.stringify(names) === JSON.stringify(expectedSubjects), `${params.region} ${params.examType}: subject mix.`);

    const prediction = await fetchJson(page, `/api/prediction?submissionId=${params.submissionId}`);
    assert(prediction.ok, `${params.region} ${params.examType}: prediction API ${prediction.status}.`);
    const summary = asObject(asObject(prediction.body, "prediction").summary, "prediction.summary");
    assert(summary.regionName === params.region, `${params.region} ${params.examType}: prediction region mismatch.`);
    assert(summary.examType === params.examType, `${params.region} ${params.examType}: prediction type mismatch.`);
    assert(summary.recruitCount === params.expectedRecruit, `${params.region} ${params.examType}: recruit mismatch.`);
    assert(summary.applicantCount === params.expectedApplicants, `${params.region} ${params.examType}: applicants mismatch.`);
    assert(summary.passMultiple === 2, `${params.region} ${params.examType}: pass multiple is not 2.`);
    assert(summary.modelVersion === EXPECTED_MODEL, `${params.region} ${params.examType}: model mismatch.`);
    for (const key of ["predictionGrade", "sureMaxRank", "likelyMaxRank", "passCount", "passLineScore"] as const) {
      assert(summary[key] === null, `${params.region} ${params.examType}: ${key} must remain hidden.`);
    }
    assert(summary.isOneMultipleCutConfirmed === true, `${params.region} ${params.examType}: 1x sample point not confirmed.`);

    for (const route of [
      `/api/analysis/score-distribution?submissionId=${params.submissionId}`,
      `/api/analysis/subject-stats?submissionId=${params.submissionId}`,
      `/api/analysis/wrong-rate-top?submissionId=${params.submissionId}`,
      `/api/analysis/answer-change-impact?submissionId=${params.submissionId}`,
    ]) {
      const analysis = await fetchJson(page, route);
      assert(analysis.ok, `${params.region} ${params.examType}: ${route} returned ${analysis.status}.`);
    }

    record(
      `${params.region} ${params.examType}`,
      `로그인→결과→예측→4개 분석 API, 모집 ${params.expectedRecruit}명/출원 ${params.expectedApplicants}명`
    );
  } finally {
    await context.close();
  }
}

async function assertRejectedPrediction(params: {
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  username: string;
  label: string;
  expectedText: string;
}) {
  const context = await params.browser.newContext();
  try {
    const page = await context.newPage();
    await login(page, POLICE_URL, params.username, PASSWORD);
    const result = await fetchJson(page, "/api/result?optional=1");
    assert(result.ok, `${params.label}: result must remain available.`);
    const prediction = await fetchJson(page, "/api/prediction");
    const error = asObject(prediction.body, `${params.label} prediction`).error;
    assert(
      prediction.status === 400,
      `${params.label}: prediction must return 400, got ${prediction.status} (${String(error)}).`
    );
    assert(typeof error === "string" && error.includes(params.expectedText), `${params.label}: wrong error ${String(error)}.`);
    record(params.label, "성적 결과는 제공하고 합격예측 모수·등수에서는 제외");
  } finally {
    await context.close();
  }
}

async function main() {
  loadLocalEnv();
  const policeUrl = tenantDatabaseUrl("score_predict_police");
  const fireUrl = tenantDatabaseUrl("score_predict_fire");
  process.env.DATABASE_URL = policeUrl;
  process.env.DIRECT_URL = policeUrl;

  const police = new PrismaClient({ datasources: { db: { url: policeUrl } } });
  const fire = new PrismaClient({ datasources: { db: { url: fireUrl } } });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let operationBaseline: {
    id: number;
    phase: ExamOperationPhase;
    activeCampaignId: number | null;
    featureOverrides: Prisma.JsonValue | null;
    version: number;
    updatedBy: number | null;
    updatedAt: Date;
  } | null = null;

  try {
    const fireBaseline = {
      users: await fire.user.count(),
      submissions: await fire.submission.count(),
      exams: await fire.exam.count(),
    };
    // 반복 실행 가능한 로컬 E2E를 위해 이 테스트가 사용하는 로그인 버킷만 비운다.
    await police.authRateLimitBucket.deleteMany({
      where: { namespace: { startsWith: "auth-login-" } },
    });

    const exams = await police.exam.findMany({ where: { isActive: true } });
    assert(exams.length === 1, `Police active exam count must be 1, got ${exams.length}.`);
    const exam = exams[0];
    assert(exam.year === 2026 && exam.round === 2, "Active police exam is not 2026 round 2.");
    assert(exam.examDate.toISOString().startsWith("2026-08-22"), "Police exam date is not 2026-08-22.");
    assert(exam.policeWrittenPassMultiple === 2, "Stored police pass multiple is not 2.");
    assert(exam.policePredictionModelVersion === EXPECTED_MODEL, "Stored police model version mismatch.");

    operationBaseline = await police.examOperationState.findUnique({
      where: { examId: exam.id },
      select: { id: true, phase: true, activeCampaignId: true, featureOverrides: true, version: true, updatedBy: true, updatedAt: true },
    });
    assert(operationBaseline, "Active police exam operation state is missing.");
    await police.examOperationState.update({
      where: { id: operationBaseline.id },
      data: { phase: ExamOperationPhase.ANALYSIS_OPEN, featureOverrides: {} },
    });

    const allRegions = await police.region.findMany({ orderBy: { name: "asc" } });
    const regions = allRegions.filter((region) => region.isActive);
    assert(JSON.stringify(regions.map((item) => item.name)) === JSON.stringify(["경북", "대구"]), "Active police regions are not exactly Daegu/Gyeongbuk.");
    record("회차·서비스 범위", `${exam.name}, 2026-08-22, 대구·경북만 활성`);
    const unsupportedRegion = allRegions.find((region) => !region.isActive) ?? null;

    const subjects = await police.subject.findMany({
      where: { examType: { in: [ExamType.PUBLIC, ExamType.CAREER] } },
      orderBy: [{ examType: "desc" }, { id: "asc" }],
    });
    const subjectSignature = (type: ExamType) =>
      subjects
        .filter((item) => item.examType === type)
        .map((item) => `${item.name}:${item.questionCount}:${item.maxScore}`);
    assert(JSON.stringify(subjectSignature(ExamType.PUBLIC)) === JSON.stringify(["헌법:20:50", "형사법:40:100", "경찰학:40:100"]), "Public subjects mismatch official notice.");
    assert(JSON.stringify(subjectSignature(ExamType.CAREER)) === JSON.stringify(["범죄학:20:50", "형사법:40:100", "경찰학:40:100"]), "Career subjects mismatch official notice.");
    record("과목", "공채 헌법·형사법·경찰학 / 경행경채 범죄학·형사법·경찰학, 총점 각 250점");

    const cohorts: Array<{
      region: RegionName;
      examType: PoliceExamType;
      regionId: number;
      expectedRecruit: number;
      expectedApplicants: number;
    }> = [];

    for (const region of regions) {
      const name = region.name as RegionName;
      const expected = EXPECTED[name];
      assert(expected, `Unexpected active region ${region.name}.`);
      const quota = await police.examRegionQuota.findUnique({
        where: { examId_regionId: { examId: exam.id, regionId: region.id } },
      });
      assert(quota, `${name}: quota missing.`);
      assert(quota.recruitCount === expected.publicRecruit, `${name}: public recruit mismatch.`);
      assert(quota.applicantCount === expected.publicApplicants, `${name}: public applicants mismatch.`);
      assert(quota.recruitCountCareer === expected.careerRecruit, `${name}: career recruit mismatch.`);
      assert(quota.applicantCountCareer === expected.careerApplicants, `${name}: career applicants mismatch.`);
      cohorts.push(
        { region: name, examType: ExamType.PUBLIC, regionId: region.id, expectedRecruit: expected.publicRecruit, expectedApplicants: expected.publicApplicants },
        { region: name, examType: ExamType.CAREER, regionId: region.id, expectedRecruit: expected.careerRecruit, expectedApplicants: expected.careerApplicants }
      );
    }
    record("공식 모집·출원", "대구 공채 46/1,045·경행 3/45, 경북 공채 192/1,595·경행 9/56");

    const representative: Array<{
      username: string;
      submissionId: number;
      region: RegionName;
      examType: PoliceExamType;
      expectedRecruit: number;
      expectedApplicants: number;
    }> = [];
    let cutoffUsername = "";
    let suspiciousUsername = "";

    for (const cohort of cohorts) {
      const where = {
        examId: exam.id,
        regionId: cohort.regionId,
        examType: cohort.examType,
        examNumber: { startsWith: "MOCK-" },
      } as const;
      const count = await police.submission.count({ where });
      assert(count === EXPECTED_COUNTS[cohort.examType], `${cohort.region} ${cohort.examType}: count ${count}.`);

      const [cutoffCount, suspiciousCount, bonusCounts, validCount, ties] = await Promise.all([
        police.submission.count({ where: { ...where, subjectScores: { some: { isFailed: true } } } }),
        police.submission.count({ where: { ...where, isSuspicious: true } }),
        police.submission.groupBy({ by: ["bonusType"], where, _count: { _all: true } }),
        police.submission.count({ where: { ...where, isSuspicious: false, subjectScores: { some: {}, none: { isFailed: true } } } }),
        police.submission.groupBy({ by: ["finalScore"], where: { ...where, isSuspicious: false }, _count: { _all: true }, having: { finalScore: { _count: { gt: 1 } } } }),
      ]);
      assert(cutoffCount >= 1, `${cohort.region} ${cohort.examType}: cutoff case missing.`);
      assert(suspiciousCount >= 1, `${cohort.region} ${cohort.examType}: suspicious case missing.`);
      assert(ties.length >= 1, `${cohort.region} ${cohort.examType}: tie case missing.`);
      assert(validCount >= cohort.expectedRecruit, `${cohort.region} ${cohort.examType}: insufficient valid sample for 1x point.`);
      const bonusMap = new Map(bonusCounts.map((row) => [row.bonusType, row._count._all]));
      assert((bonusMap.get(BonusType.VETERAN_5) ?? 0) >= 1, `${cohort.region} ${cohort.examType}: VETERAN_5 missing.`);
      assert((bonusMap.get(BonusType.VETERAN_10) ?? 0) >= 1, `${cohort.region} ${cohort.examType}: VETERAN_10 missing.`);
      if (cohort.examType === ExamType.PUBLIC) {
        assert((bonusMap.get(BonusType.HERO_3) ?? 0) >= 1 && (bonusMap.get(BonusType.HERO_5) ?? 0) >= 1, `${cohort.region} PUBLIC: hero bonus cases missing.`);
      } else {
        assert((bonusMap.get(BonusType.HERO_3) ?? 0) === 0 && (bonusMap.get(BonusType.HERO_5) ?? 0) === 0, `${cohort.region} CAREER: hero bonus must be disabled below 10 recruits.`);
      }

      const sample = await police.submission.findFirst({
        // 예측 API는 운영 판정과 동일하게 명시적인 CLEAR 상태만 허용한다.
        // isSuspicious=false만으로는 과거 REVIEW 행이 섞일 수 있다.
        where: {
          ...where,
          isSuspicious: false,
          suspicionStatus: "CLEAR",
          subjectScores: { some: {}, none: { isFailed: true } },
        },
        orderBy: [{ finalScore: "desc" }, { id: "asc" }],
        select: { id: true, user: { select: { phone: true } } },
      });
      assert(sample, `${cohort.region} ${cohort.examType}: representative missing.`);
      representative.push({ ...cohort, username: sample.user.phone, submissionId: sample.id });

      if (!cutoffUsername) {
        const cutoff = await police.submission.findFirst({
          where: { ...where, subjectScores: { some: { isFailed: true } } },
          select: { user: { select: { phone: true } } },
        });
        assert(cutoff, "Cutoff account missing.");
        cutoffUsername = cutoff.user.phone;
      }
      if (!suspiciousUsername) {
        const suspicious = await police.submission.findFirst({
          where: {
            ...where,
            isSuspicious: true,
            subjectScores: { some: {}, none: { isFailed: true } },
          },
          select: { user: { select: { phone: true } } },
        });
        assert(suspicious, "Suspicious account missing.");
        suspiciousUsername = suspicious.user.phone;
      }
      record(`${cohort.region} ${cohort.examType} 목업`, `총 ${count}, 유효 ${validCount}, 동점·과락·의심·가산점 검증`);
    }

    const unsupportedMockCount = await police.submission.count({
      where: {
        examId: exam.id,
        examNumber: { startsWith: "MOCK-" },
        region: { name: { notIn: ["대구", "경북"] } },
      },
    });
    assert(unsupportedMockCount === 0, `Unsupported-region mock submissions found: ${unsupportedMockCount}.`);

    const publicOverview = await fetch("http://127.0.0.1:3200/api/public/overview", {
      headers: { "x-forwarded-host": "police.localhost:3200" },
    });
    assert(publicOverview.ok, `Public overview returned ${publicOverview.status}.`);
    const overviewBody = asObject(await publicOverview.json(), "public overview");
    const overviewRows = asArray(overviewBody.rows, "public overview rows").map((item) => asObject(item, "overview row"));
    assert(overviewRows.length === 4, `Public overview must expose 4 cohorts, got ${overviewRows.length}.`);
    assert(overviewRows.every((row) => row.regionName === "대구" || row.regionName === "경북"), "Public overview leaked unsupported region.");
    record("비로그인 공개 API", "대구·경북 4개 셀만 노출, 개인정보 없는 발표 스냅샷 응답");

    browser = await chromium.launch({ headless: true });
    for (const item of representative) {
      await assertMockLoginFlow({ browser, examId: exam.id, ...item });
    }
    record("예측 계산", "4개 모집 셀 각각 독립 모수·2배수·등급 비공개·passLine 영구 차단");
    await assertRejectedPrediction({ browser, username: cutoffUsername, label: "과락 사례", expectedText: "과락" });
    await assertRejectedPrediction({ browser, username: suspiciousUsername, label: "의심 제출 사례", expectedText: "통계 제외" });

    if (unsupportedRegion) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await login(page, POLICE_URL, representative[0].username, PASSWORD);
        const rejected = await fetchJson(
          page,
          `/api/pass-cut-history?examId=${exam.id}&regionId=${unsupportedRegion.id}&examType=PUBLIC`
        );
        assert(rejected.status === 400, `Unsupported pass-cut region returned ${rejected.status}.`);
        record("비활성 지역 차단", `${unsupportedRegion.name} 합격컷 직접 호출 400`);
      } finally {
        await context.close();
      }
    }

    const adminContext = await browser.newContext();
    try {
      const page = await adminContext.newPage();
      await page.goto(`${POLICE_URL}/admin-login`, { waitUntil: "domcontentloaded" });
      const auth = await page.evaluate(
        async ({ identity, secret }) => {
          const csrf = (await (await fetch("/api/auth/csrf", { cache: "no-store" })).json()) as {
            csrfToken?: string;
          };
          const body = new URLSearchParams({
            csrfToken: csrf.csrfToken ?? "",
            callbackUrl: window.location.origin,
            username: identity,
            password: secret,
            adminOnly: "true",
            json: "true",
          });
          const response = await fetch("/api/auth/callback/credentials?json=true", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
          const session = (await (await fetch("/api/auth/session", { cache: "no-store" })).json()) as {
            user?: { role?: string; tenantType?: string };
          };
          return { status: response.status, session };
        },
        { identity: ADMIN_USERNAME, secret: ADMIN_PASSWORD }
      );
      assert(auth.status === 200 && auth.session.user?.role === "ADMIN", "Police admin API authentication failed.");

      const adminRegions = await fetchJson(page, `/api/admin/regions?examId=${exam.id}`);
      assert(adminRegions.ok, `Admin regions returned ${adminRegions.status}.`);
      const adminRegionRows = asArray(asObject(adminRegions.body, "admin regions").regions, "admin regions.rows")
        .map((item) => asObject(item, "admin region"));
      assert(adminRegionRows.length === allRegions.length, "Admin regions must expose the full region catalog.");
      const activeAdminRegionNames = adminRegionRows
        .filter((row) => row.isActive === true)
        .map((row) => String(row.name))
        .sort();
      assert(
        JSON.stringify(activeAdminRegionNames) === JSON.stringify(["경북", "대구"]),
        "Admin active-region state does not match the database."
      );

      if (unsupportedRegion) {
        const targetRow = adminRegionRows.find((row) => row.id === unsupportedRegion.id);
        assert(targetRow, `Admin region row missing for ${unsupportedRegion.name}.`);
        const originalQuota = await police.examRegionQuota.findUnique({
          where: { examId_regionId: { examId: exam.id, regionId: unsupportedRegion.id } },
        });
        const activationPayload = {
          // 배포 전에 열린 관리자 탭이 보내던 id 형식도 계속 허용해야 한다.
          id: unsupportedRegion.id,
          isActive: true,
          recruitCount: 2,
          recruitCountCareer: 1,
          applicantCount: 20,
          applicantCountCareer: 10,
          examNumberStart: "90001",
          examNumberEnd: "90099",
          examNumberStartCareer: "91001",
          examNumberEndCareer: "91099",
        };
        const restorePayload = {
          regionId: unsupportedRegion.id,
          isActive: false,
          recruitCount: Number(targetRow.recruitCount ?? 0),
          recruitCountCareer: Number(targetRow.recruitCountCareer ?? 0),
          applicantCount: targetRow.applicantCount ?? null,
          applicantCountCareer: targetRow.applicantCountCareer ?? null,
          examNumberStart: targetRow.examNumberStart ?? null,
          examNumberEnd: targetRow.examNumberEnd ?? null,
          examNumberStartCareer: targetRow.examNumberStartCareer ?? null,
          examNumberEndCareer: targetRow.examNumberEndCareer ?? null,
        };

        try {
          await gotoWithRetry(page, `${POLICE_URL}/admin/regions`);
          const toggle = page.getByLabel(`${unsupportedRegion.name} 지역 활성화`);
          await toggle.waitFor({ state: "visible" });
          assert((await toggle.count()) === 1, "Admin active-region checkbox is missing.");

          const activated = await fetchJson(page, "/api/admin/regions", {
            method: "PUT",
            body: { examId: exam.id, regions: [activationPayload] },
          });
          assert(activated.ok, `Admin region activation returned ${activated.status}.`);

          const activeExamPayload = await fetchJson(page, "/api/exams?active=true");
          assert(activeExamPayload.ok, `Active exam API returned ${activeExamPayload.status}.`);
          const activeRegionNames = asArray(
            asObject(activeExamPayload.body, "active exam payload").regions,
            "active exam regions"
          ).map((item) => String(asObject(item, "active exam region").name));
          assert(activeRegionNames.includes(unsupportedRegion.name), "Newly activated region is missing from the student region API.");

          const activeOverview = await fetchJson(page, "/api/public/overview");
          assert(activeOverview.ok, `Public overview after activation returned ${activeOverview.status}.`);
          const activeOverviewRows = asArray(
            asObject(activeOverview.body, "active overview").rows,
            "active overview rows"
          ).map((item) => asObject(item, "active overview row"));
          assert(
            activeOverviewRows.some((row) => row.regionName === unsupportedRegion.name),
            "Newly activated region is missing from the public overview."
          );

          const examNumberCheck = await fetchJson(
            page,
            `/api/exam-number/check?examId=${exam.id}&regionId=${unsupportedRegion.id}&examType=PUBLIC&examNumber=90001`
          );
          assert(examNumberCheck.ok, `Exam-number check after activation returned ${examNumberCheck.status}.`);
          assert(
            asObject(examNumberCheck.body, "exam-number check").available === true,
            "Newly activated region did not accept its configured exam-number range."
          );

          const activePassCut = await fetchJson(
            page,
            `/api/pass-cut-history?examId=${exam.id}&regionId=${unsupportedRegion.id}&examType=PUBLIC`
          );
          assert(activePassCut.status !== 400, "Activated region is still blocked from pass-cut calculation.");

          const restored = await fetchJson(page, "/api/admin/regions", {
            method: "PUT",
            body: { examId: exam.id, regions: [restorePayload] },
          });
          assert(restored.ok, `Admin region deactivation returned ${restored.status}.`);

          const inactiveExamPayload = await fetchJson(page, "/api/exams?active=true");
          const inactiveRegionNames = asArray(
            asObject(inactiveExamPayload.body, "inactive exam payload").regions,
            "inactive exam regions"
          ).map((item) => String(asObject(item, "inactive exam region").name));
          assert(!inactiveRegionNames.includes(unsupportedRegion.name), "Deactivated region remains in the student region API.");
          record("관리자 지역 활성화", `${unsupportedRegion.name} 활성→학생 API·공개 현황·수험번호·합격컷 반영→비활성 복원`);
        } finally {
          await police.$transaction(async (tx) => {
            await tx.region.update({
              where: { id: unsupportedRegion.id },
              data: { isActive: false },
            });
            if (originalQuota) {
              await tx.examRegionQuota.update({
                where: { id: originalQuota.id },
                data: {
                  recruitCount: originalQuota.recruitCount,
                  recruitCountCareer: originalQuota.recruitCountCareer,
                  applicantCount: originalQuota.applicantCount,
                  applicantCountCareer: originalQuota.applicantCountCareer,
                  examNumberStart: originalQuota.examNumberStart,
                  examNumberEnd: originalQuota.examNumberEnd,
                  examNumberStartCareer: originalQuota.examNumberStartCareer,
                  examNumberEndCareer: originalQuota.examNumberEndCareer,
                },
              });
            } else {
              await tx.examRegionQuota.deleteMany({
                where: { examId: exam.id, regionId: unsupportedRegion.id },
              });
            }
          });
        }
      }

      const search = await fetchJson(page, "/api/admin/search-submission?q=MOCK");
      assert(search.ok, `Admin search returned ${search.status}.`);
      const searchRows = asArray(asObject(search.body, "admin search").results, "admin search.results")
        .map((item) => asObject(item, "admin search row"));
      assert(searchRows.length > 0 && searchRows.every((row) => row.regionName === "대구" || row.regionName === "경북"), "Admin search leaked unsupported region.");

      const preview = await fetchJson(page, "/api/prediction");
      assert(preview.ok, `Admin prediction preview returned ${preview.status}.`);
      const candidates = asArray(asObject(preview.body, "admin preview").adminPreviewCandidates, "admin preview candidates")
        .map((item) => asObject(item, "admin preview candidate"));
      assert(
        candidates.length > 0 && candidates.every((item) => {
          const label = String(item.label ?? "");
          return label.includes("대구") || label.includes("경북");
        }),
        "Admin prediction preview leaked unsupported region."
      );
      record("현재 활성 지역 격리", "학생·예측 미리보기는 활성 지역만 사용하고 관리자는 전국 지역을 관리");
    } finally {
      await adminContext.close();
    }

    const crossContext = await browser.newContext();
    try {
      const page = await crossContext.newPage();
      await page.goto(`${FIRE_URL}/login`, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        async ({ identity, secret }) => {
          const csrf = (await (await fetch("/api/auth/csrf", { cache: "no-store" })).json()) as {
            csrfToken?: string;
          };
          const body = new URLSearchParams({
            csrfToken: csrf.csrfToken ?? "",
            callbackUrl: window.location.origin,
            phone: identity,
            password: secret,
            json: "true",
          });
          await fetch("/api/auth/callback/credentials?json=true", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
        },
        { identity: representative[0].username, secret: PASSWORD }
      );
      const session = await fetchJson(page, "/api/auth/session");
      const body = asObject(session.body, "fire session");
      assert(!body.user, "Police mock account authenticated on the fire tenant.");
      record("회원·테넌트 격리", "경찰 목업 계정으로 소방 로그인 불가, 소방 DB 기준선 유지");
    } finally {
      await crossContext.close();
    }

    const fireAfter = {
      users: await fire.user.count(),
      submissions: await fire.submission.count(),
      exams: await fire.exam.count(),
    };
    assert(JSON.stringify(fireAfter) === JSON.stringify(fireBaseline), "Fire tenant data changed during police test.");

    console.log("\nPolice Daegu/Gyeongbuk regional scope E2E passed.");
  } finally {
    await browser?.close().catch(() => undefined);
    if (operationBaseline) {
      await police.examOperationState.update({
        where: { id: operationBaseline.id },
        data: {
          phase: operationBaseline.phase,
          activeCampaignId: operationBaseline.activeCampaignId,
          featureOverrides: operationBaseline.featureOverrides ?? Prisma.JsonNull,
          version: operationBaseline.version,
          updatedBy: operationBaseline.updatedBy,
          updatedAt: operationBaseline.updatedAt,
        },
      }).catch((error) => console.error("[RECOVERY] operation state restore failed", error));
    }
    await Promise.all([police.$disconnect(), fire.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
