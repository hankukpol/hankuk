import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

const BASE_URL = "http://police.localhost:3200";
const ADMIN_USERNAME = "010-0000-0000";
const ADMIN_PASSWORD = "PoliceAdmin!123";
const RUN_DIGITS = Date.now().toString().slice(-8);
const USERNAME = `workflow${RUN_DIGITS}`;
const USER_CONTACT_PHONE = `010${RUN_DIGITS}`;
const USER_EMAIL = `${USERNAME}@local.invalid`;
const USER_PASSWORD = "Workflow!123";

type FeatureKey =
  | "preRegistration"
  | "answerInput"
  | "result"
  | "analysis"
  | "finalPrediction"
  | "comments"
  | "notices"
  | "faq";

type Phase = "PRE_REGISTRATION" | "SCORING_OPEN" | "ANALYSIS_OPEN" | "FINAL_OPEN" | "CLOSED";

interface OperationPayload {
  operation: {
    phase: Phase;
    features: Record<FeatureKey, boolean>;
    state: {
      version: number;
      activeCampaignId: number | null;
      featureOverrides: Partial<Record<FeatureKey, boolean>>;
    } | null;
  };
  campaigns: Array<{ id: number; name: string; publishedVersion: number }>;
}

interface ExamSubject {
  name: string;
  questionCount: number;
}

interface ExamMetadata {
  activeExam: { id: number };
  regions: Array<{ id: number; name: string; isActive: boolean; recruitCount: number }>;
  subjectGroups: { PUBLIC: ExamSubject[] };
}

async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction(
    (target) => {
      const element = document.querySelector(target);
      return Boolean(element && Object.keys(element).some(
        (key) => key.startsWith("__reactProps$") || key.startsWith("__reactFiber$"),
      ));
    },
    selector,
    { timeout: 30_000 },
  );
}

async function loginAdmin(page: Page) {
  await page.goto(`${BASE_URL}/admin-login`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page, "#username");
  await page.locator("#username").fill(ADMIN_USERNAME);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "관리자 로그인", exact: true }).click();
  try {
    await page.waitForURL((url) => url.pathname === "/admin", { timeout: 60_000 });
  } catch (error) {
    const session = await requestJson(page, "/api/auth/session");
    const cookies = await page.context().cookies();
    throw new Error(`관리자 로그인 후 서버 세션 확인 실패: ${JSON.stringify({ url: page.url(), session: session.body, cookies: cookies.map(({ name, domain, path }) => ({ name, domain, path })) })}`, { cause: error });
  }
  await page.waitForFunction(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const session = await response.json();
    return session?.user?.role === "ADMIN" && session?.user?.tenantType === "police";
  }, undefined, { timeout: 60_000 });
}

async function loginUser(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page, "#username");
  await page.locator("#username").fill(USERNAME);
  await page.locator("#password").fill(USER_PASSWORD);
  await page.locator("main button[type='submit']").click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
  await page.waitForFunction(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const session = await response.json();
    return session?.user?.role === "USER" && session?.user?.tenantType === "police";
  }, undefined, { timeout: 60_000 });
}

async function registerUser(page: Page) {
  await page.goto(`${BASE_URL}/register`, { waitUntil: "domcontentloaded" });
  const response = await requestJson(page, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "운영검증",
      username: USERNAME,
      contactPhone: USER_CONTACT_PHONE,
      email: USER_EMAIL,
      password: USER_PASSWORD,
      agreeToTerms: true,
      agreeToPrivacy: true,
    }),
  });
  assert.equal(response.status, 201, `운영 검증 회원가입 실패: ${JSON.stringify(response.body)}`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} 응답 형식이 잘못됐습니다.`);
  return value as Record<string, unknown>;
}

async function requestJson(page: Page, path: string, init?: RequestInit) {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  }, { path, init });
}

async function readOperation(page: Page) {
  const response = await requestJson(page, "/api/admin/exam-operation");
  const sessionResponse = response.status === 200
    ? null
    : await requestJson(page, "/api/auth/session");
  assert.equal(
    response.status,
    200,
    `관리자 운영 상태 조회에 실패했습니다: ${JSON.stringify({ body: response.body, session: sessionResponse?.body })}`,
  );
  return response.body as OperationPayload;
}

async function applyOperation(params: {
  page: Page;
  phase: Phase;
  activeCampaignId: number | null;
  featureOverrides?: Partial<Record<FeatureKey, boolean>>;
}) {
  const current = await readOperation(params.page);
  assert.ok(current.operation.state, "회차 운영 상태가 필요합니다.");
  const response = await requestJson(params.page, "/api/admin/exam-operation", {
    method: "POST",
    body: JSON.stringify({
      phase: params.phase,
      activeCampaignId: params.activeCampaignId,
      featureOverrides: params.featureOverrides ?? {},
      expectedVersion: current.operation.state.version,
      note: "로컬 경찰 운영 단계 E2E 검증",
    }),
  });
  assert.equal(response.status, 200, `${params.phase} 적용에 실패했습니다: ${JSON.stringify(response.body)}`);
  return readOperation(params.page);
}

function assertFeatureSet(
  actual: Record<FeatureKey, boolean>,
  expected: Partial<Record<FeatureKey, boolean>>,
  phase: Phase,
) {
  for (const [key, value] of Object.entries(expected) as Array<[FeatureKey, boolean]>) {
    assert.equal(actual[key], value, `${phase}: ${key} 공개 상태가 잘못됐습니다.`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const userContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const adminPage = await adminContext.newPage();
  const userPage = await userContext.newPage();

  let baseline: OperationPayload | null = null;
  let testUserId: number | null = null;
  let createdSubmissionId: number | null = null;
  try {
    await Promise.all([
      loginAdmin(adminPage),
      (async () => {
        await registerUser(userPage);
        await loginUser(userPage);
      })(),
    ]);
    const userSessionResponse = await requestJson(userPage, "/api/auth/session");
    const userSession = asRecord(userSessionResponse.body, "사용자 세션");
    const sessionUser = asRecord(userSession.user, "사용자 세션 계정");
    testUserId = Number(sessionUser.id);
    assert.ok(Number.isInteger(testUserId) && testUserId > 0, "운영 검증 사용자 ID를 확인하지 못했습니다.");

    baseline = await readOperation(adminPage);
    assert.ok(baseline.operation.state, "복원할 운영 상태가 없습니다.");

    const preRegistrationCampaign = baseline.campaigns.find((campaign) =>
      /사전등록|운영 랜딩 이전본/.test(campaign.name),
    );
    const scoringCampaign = baseline.campaigns.find((campaign) => /가채점/.test(campaign.name));
    assert.ok(preRegistrationCampaign, "사전등록 대표 캠페인이 필요합니다.");
    assert.ok(scoringCampaign, "가채점 대표 캠페인이 필요합니다.");

    const preRegistration = await applyOperation({
      page: adminPage,
      phase: "PRE_REGISTRATION",
      activeCampaignId: preRegistrationCampaign.id,
    });
    assertFeatureSet(preRegistration.operation.features, {
      preRegistration: true,
      answerInput: false,
      result: false,
      analysis: false,
      finalPrediction: false,
      notices: true,
      faq: true,
    }, "PRE_REGISTRATION");
    assert.equal((await requestJson(userPage, "/api/result")).status, 403);
    assert.equal((await requestJson(userPage, "/api/prediction")).status, 403);
    assert.equal((await requestJson(userPage, "/api/final-prediction")).status, 403);
    await userPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    const preRegistrationText = await userPage.frameLocator("iframe").first().locator("body").innerText();
    assert.match(preRegistrationText, /사전등록|사전예약/);

    const metadataResponse = await requestJson(userPage, "/api/exams?active=true");
    assert.equal(metadataResponse.status, 200, `활성 시험 조회 실패: ${JSON.stringify(metadataResponse.body)}`);
    const metadata = metadataResponse.body as ExamMetadata;
    const region = metadata.regions.find((item) => item.isActive && item.recruitCount > 0 && /대구|경북/.test(item.name));
    assert.ok(region, "대구·경북 활성 공채 지역이 필요합니다.");
    const subjects = metadata.subjectGroups.PUBLIC;
    assert.ok(subjects.length > 0, "경찰 공채 과목이 필요합니다.");

    const adminRegionsResponse = await requestJson(adminPage, `/api/admin/regions?examId=${metadata.activeExam.id}`);
    assert.equal(adminRegionsResponse.status, 200, `관리자 지역 설정 조회 실패: ${JSON.stringify(adminRegionsResponse.body)}`);
    const adminRegionRows = asRecord(adminRegionsResponse.body, "관리자 지역 설정").regions;
    assert.ok(Array.isArray(adminRegionRows), "관리자 지역 목록이 필요합니다.");
    const adminRegion = adminRegionRows
      .map((item) => asRecord(item, "관리자 지역"))
      .find((item) => Number(item.id) === region.id);
    assert.ok(adminRegion, "선택 지역의 수험번호 범위가 필요합니다.");
    const rangeStart = String(adminRegion.examNumberStart ?? "00000");
    const rangeEnd = String(adminRegion.examNumberEnd ?? "99999");
    const rangeStartNumber = Number(rangeStart);
    const rangeEndNumber = Number(rangeEnd);
    assert.ok(/^\d{5}$/.test(rangeStart) && /^\d{5}$/.test(rangeEnd) && rangeEndNumber >= rangeStartNumber, "경찰 공채 수험번호 범위는 5자리여야 합니다.");

    let examNumber = "";
    let lastAvailability: unknown = null;
    const availableRange = rangeEndNumber - rangeStartNumber + 1;
    const examNumberSeed = Number(RUN_DIGITS.slice(-5));
    for (let attempt = 0; attempt < Math.min(20, availableRange); attempt += 1) {
      const candidateNumber = rangeStartNumber + ((examNumberSeed + attempt) % availableRange);
      const candidate = String(candidateNumber).padStart(5, "0");
      const params = new URLSearchParams({
        examId: String(metadata.activeExam.id),
        regionId: String(region.id),
        examType: "PUBLIC",
        gender: "MALE",
        examNumber: candidate,
      });
      const availability = await requestJson(userPage, `/api/exam-number/check?${params.toString()}`);
      lastAvailability = availability;
      if (availability.status === 200 && asRecord(availability.body, "수험번호 확인").available === true) {
        examNumber = candidate;
        break;
      }
    }
    assert.match(examNumber, /^\d{5}$/, `사용 가능한 경찰 5자리 수험번호를 찾지 못했습니다: ${JSON.stringify(lastAvailability)}`);

    const preRegistrationResponse = await requestJson(userPage, "/api/pre-registration", {
      method: "POST",
      body: JSON.stringify({
        examId: metadata.activeExam.id,
        examType: "PUBLIC",
        gender: "MALE",
        regionId: region.id,
        examNumber,
        contactPhone: USER_CONTACT_PHONE,
      }),
    });
    assert.ok([200, 201].includes(preRegistrationResponse.status), `사전등록 저장 실패: ${JSON.stringify(preRegistrationResponse.body)}`);

    const analysis = await applyOperation({
      page: adminPage,
      phase: "ANALYSIS_OPEN",
      activeCampaignId: scoringCampaign.id,
    });
    assertFeatureSet(analysis.operation.features, {
      preRegistration: false,
      answerInput: true,
      result: true,
      analysis: true,
      finalPrediction: false,
      notices: true,
      faq: true,
    }, "ANALYSIS_OPEN");

    await adminPage.goto(`${BASE_URL}/exam/input`, { waitUntil: "domcontentloaded" });
    await adminPage.locator("#examNumber").waitFor({ state: "visible", timeout: 30_000 });
    assert.equal(
      await adminPage.locator("#examNumber").inputValue(),
      "",
      "관리자 응시정보 입력 화면에 목업·타인 수험번호가 자동 입력됐습니다."
    );
    assert(
      await adminPage.locator("input[aria-label$='번 답안']").evaluateAll(
        (inputs) => inputs.every((input) => (input as HTMLInputElement).value === "")
      ),
      "관리자 응시정보 입력 화면에 목업·타인 답안이 자동 입력됐습니다."
    );

    const answerKeyResponse = await requestJson(
      adminPage,
      `/api/admin/answers?examId=${metadata.activeExam.id}&examType=PUBLIC`,
    );
    assert.equal(answerKeyResponse.status, 200, `경찰 정답 조회 실패: ${JSON.stringify(answerKeyResponse.body)}`);
    const answerKeyRows = asRecord(answerKeyResponse.body, "경찰 정답").answers;
    assert.ok(Array.isArray(answerKeyRows) && answerKeyRows.length > 0, "가채점용 경찰 정답이 필요합니다.");
    const answers = answerKeyRows.map((item) => {
      const row = asRecord(item, "경찰 정답 문항");
      const subjectName = String(row.subjectName);
      const questionNo = Number(row.questionNumber);
      const correctAnswer = Number(row.answer);
      const shouldAnswerWrong = ((questionNo * 37) + (subjectName.length * 11)) % 100 < 35;
      return {
        subjectName,
        questionNo,
        answer: shouldAnswerWrong ? (correctAnswer % 4) + 1 : correctAnswer,
      };
    });
    const submissionPayload = {
      examId: metadata.activeExam.id,
      examType: "PUBLIC",
      gender: "MALE",
      regionId: region.id,
      examNumber,
      contactPhone: USER_CONTACT_PHONE,
      bonusType: "NONE",
      certificateBonus: 0,
      submitDurationMs: 2_700_000,
      difficulty: subjects.map((subject) => ({ subjectName: subject.name, rating: "NORMAL" })),
      answers,
    };
    const missingContactResponse = await requestJson(userPage, "/api/submission", {
      method: "POST",
      body: JSON.stringify({ ...submissionPayload, contactPhone: "" }),
    });
    assert.equal(missingContactResponse.status, 400);
    assert.match(String(asRecord(missingContactResponse.body, "연락처 누락 제출").error), /연락처/);
    const submissionResponse = await requestJson(userPage, "/api/submission", {
      method: "POST",
      body: JSON.stringify(submissionPayload),
    });
    assert.ok([200, 201].includes(submissionResponse.status), `가채점 답안 제출 실패: ${JSON.stringify(submissionResponse.body)}`);
    createdSubmissionId = Number(asRecord(submissionResponse.body, "답안 제출").submissionId);
    assert.ok(Number.isInteger(createdSubmissionId) && createdSubmissionId > 0, "답안 제출 ID가 필요합니다.");

    await applyOperation({
      page: adminPage,
      phase: "SCORING_OPEN",
      activeCampaignId: scoringCampaign.id,
    });
    const privateResultResponse = await requestJson(userPage, `/api/result?submissionId=${createdSubmissionId}`);
    assert.equal(privateResultResponse.status, 200, JSON.stringify(privateResultResponse.body));
    const privateResult = asRecord(privateResultResponse.body, "가채점 전용 개인 성적");
    assert.equal(asRecord(privateResult.features, "가채점 전용 기능").analysisEnabled, false);
    assert.equal(asRecord(privateResult.participantStatus, "가채점 전용 참여 현황").currentRank, null);
    assert.deepEqual(privateResult.subjectCorrectRateSummaries, []);
    assert.equal(
      (await requestJson(userPage, `/api/share/data?submissionId=${createdSubmissionId}`)).status,
      403,
      "가채점만 오픈 단계에서 공유 API가 표본 순위를 노출했습니다."
    );
    await userPage.goto(`${BASE_URL}/exam/result?submissionId=${createdSubmissionId}`, { waitUntil: "domcontentloaded" });
    await userPage.getByText("현재 단계에서는 개인 채점 결과만 제공합니다.", { exact: true }).waitFor();
    await userPage.locator(".data-list-flat").getByText("가점 반영 총점", { exact: true }).waitFor();
    assert.equal(await userPage.getByText("상위%", { exact: true }).count(), 0);

    await applyOperation({
      page: adminPage,
      phase: "ANALYSIS_OPEN",
      activeCampaignId: scoringCampaign.id,
    });

    const resultResponse = await requestJson(userPage, `/api/result?submissionId=${createdSubmissionId}`);
    const predictionResponse = await requestJson(userPage, `/api/prediction?submissionId=${createdSubmissionId}`);
    const distributionResponse = await requestJson(userPage, `/api/analysis/score-distribution?submissionId=${createdSubmissionId}`);
    assert.equal(resultResponse.status, 200, `개인 성적 조회 실패: ${JSON.stringify(resultResponse.body)}`);
    assert.equal(predictionResponse.status, 200, `표본 순위 조회 실패: ${JSON.stringify(predictionResponse.body)}`);
    assert.equal(distributionResponse.status, 200, `표본 점수분포 조회 실패: ${JSON.stringify(distributionResponse.body)}`);
    const resultBody = asRecord(resultResponse.body, "개인 성적");
    const resultSubmission = asRecord(resultBody.submission, "개인 성적 제출");
    const participantStatus = asRecord(resultBody.participantStatus, "개인 성적 참여 현황");
    assert.equal(resultSubmission.id, createdSubmissionId, "제출한 답안의 성적이 반환되어야 합니다.");
    assert.equal(typeof resultSubmission.totalScore, "number", "총점이 숫자로 계산되어야 합니다.");
    assert.equal(typeof participantStatus.currentRank, "number", "표본 등수가 계산되어야 합니다.");
    assert.equal(typeof participantStatus.totalParticipants, "number", "표본 인원이 계산되어야 합니다.");
    const predictionSummary = asRecord(asRecord(predictionResponse.body, "합격예측").summary, "합격예측 요약");
    assert.equal(predictionSummary.submissionId, createdSubmissionId, "제출한 답안 기준 합격예측이어야 합니다.");
    assert.equal(typeof predictionSummary.myRank, "number", "합격예측 표본 순위가 필요합니다.");
    assert.equal(typeof predictionSummary.sampleTopPercent, "number", "합격예측 표본 백분위가 필요합니다.");
    const distributionData = asRecord(asRecord(distributionResponse.body, "점수분포").data, "점수분포 데이터");
    assert.ok(Array.isArray(distributionData.buckets) && distributionData.buckets.length > 0, "점수분포 구간 데이터가 필요합니다.");
    assert.equal((await requestJson(userPage, "/api/final-prediction")).status, 403);
    await userPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    const publicText = await userPage.locator("body").innerText();
    const frameText = await userPage.locator("iframe").evaluateAll((frames) =>
      frames
        .map((frame) => (frame as HTMLIFrameElement).contentDocument?.body?.innerText ?? "")
        .join("\n"),
    );
    assert.match(`${publicText}\n${frameText}`, /가채점|채점 결과|합격예측/);
    assert.match(publicText, /내 성적 분석/);
    assert.match(publicText, /합격 예측/);

    const finalPrediction = await applyOperation({
      page: adminPage,
      phase: "FINAL_OPEN",
      activeCampaignId: scoringCampaign.id,
    });
    assertFeatureSet(finalPrediction.operation.features, {
      preRegistration: false,
      answerInput: false,
      result: true,
      analysis: true,
      finalPrediction: true,
      notices: true,
      faq: true,
    }, "FINAL_OPEN");
    assert.equal((await requestJson(userPage, "/api/result")).status, 200);
    assert.equal((await requestJson(userPage, `/api/prediction?submissionId=${createdSubmissionId}`)).status, 200);
    const finalSave = await requestJson(userPage, "/api/final-prediction", {
      method: "POST",
      body: JSON.stringify({
        submissionId: createdSubmissionId,
        fitnessPassed: true,
        martialDanLevel: 2,
      }),
    });
    assert.equal(finalSave.status, 200, `최종예측 저장 실패: ${JSON.stringify(finalSave.body)}`);

    await applyOperation({
      page: adminPage,
      phase: "ANALYSIS_OPEN",
      activeCampaignId: scoringCampaign.id,
    });
    const editedAnswers = answers.map((answer, index) =>
      index === 0 ? { ...answer, answer: (answer.answer % 4) + 1 } : answer
    );
    const editResponse = await requestJson(userPage, "/api/submission", {
      method: "PUT",
      body: JSON.stringify({
        ...submissionPayload,
        submissionId: createdSubmissionId,
        answers: editedAnswers,
      }),
    });
    assert.equal(editResponse.status, 200, `답안 수정 실패: ${JSON.stringify(editResponse.body)}`);

    await applyOperation({
      page: adminPage,
      phase: "FINAL_OPEN",
      activeCampaignId: scoringCampaign.id,
    });
    const invalidatedFinal = await requestJson(userPage, "/api/final-prediction");
    assert.equal(invalidatedFinal.status, 200);
    assert.equal(
      asRecord(invalidatedFinal.body, "최종예측 무효화 확인").finalPrediction,
      null,
      "답안 수정 뒤 저장된 최종예측은 무효화되어야 합니다."
    );
    assert.equal((await requestJson(userPage, "/api/submission", {
      method: "POST",
      body: JSON.stringify({ examType: "PUBLIC" }),
    })).status, 403, "최종예측 단계에서는 새 답안 제출이 차단되어야 합니다.");

    console.log(JSON.stringify({
      passed: true,
      tenant: "police",
      workflow: ["PRE_REGISTRATION", "ANALYSIS_OPEN", "FINAL_OPEN"],
      campaigns: {
        preRegistration: preRegistrationCampaign.name,
        scoring: scoringCampaign.name,
      },
      checks: {
        preRegistrationLanding: true,
        preRegistrationSaved: true,
        directAnswerSubmission: true,
        submissionContactRequired: true,
        adminInputStartsBlank: true,
        scoreCalculated: true,
        scoringOnlyHidesSampleAnalysis: true,
        sampleRankCalculated: true,
        scoringResult: true,
        sampleAnalysis: true,
        prediction: true,
        finalPrediction: true,
        finalPredictionInvalidatedAfterAnswerEdit: true,
        finalSubmissionBlocked: true,
      },
    }, null, 2));
  } finally {
    if (baseline?.operation.state) {
      await applyOperation({
        page: adminPage,
        phase: baseline.operation.phase,
        activeCampaignId: baseline.operation.state.activeCampaignId,
        featureOverrides: baseline.operation.state.featureOverrides,
      }).catch((error) => console.error("[recovery] 운영 상태 복원 실패", error));
    }
    if (testUserId) {
      const cleanup = await requestJson(adminPage, `/api/admin/users?id=${testUserId}&confirm=true`, {
        method: "DELETE",
      }).catch((error) => ({ status: 0, body: String(error) }));
      if (cleanup.status !== 200) console.error("[recovery] 운영 검증 사용자 정리 실패", cleanup);
    }
    await adminContext.close();
    await userContext.close();
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
