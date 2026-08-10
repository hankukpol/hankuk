import bcrypt from "bcryptjs";
import { ExamType, PrismaClient } from "@prisma/client";
import { POLICE_PREDICTION_MODEL_VERSION } from "../src/lib/police/prediction-model";
import {
  lockActiveExamStateForTransition,
  lockActiveExamStateForWrite,
} from "../src/lib/active-exam";

type TenantType = "police" | "fire";

const tenantSchemas: Record<TenantType, string> = {
  police: "score_predict_police",
  fire: "score_predict_fire",
};
const expectedPasswords: Record<TenantType, string> = {
  police: "PoliceLocal!123",
  fire: "FireLocal!123",
};
const sharedLogin = "010-9000-0000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getSafeBaseUrl() {
  if (process.env.LOCAL_TEST_CONFIRM !== "SCORE_PREDICT_LOCAL_ONLY") {
    throw new Error("LOCAL_TEST_CONFIRM is missing.");
  }
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required.");
  if (/\.supabase\.(?:co|com)/i.test(rawUrl)) throw new Error("Hosted Supabase URL detected.");
  const parsed = new URL(rawUrl);
  assert(["localhost", "127.0.0.1", "host.docker.internal"].includes(parsed.hostname), "Database host is not local.");
  assert(parsed.port === "54332", "Database port is not the local Supabase port.");
  return parsed;
}

function createClient(baseUrl: URL, tenantType: TenantType) {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", tenantSchemas[tenantType]);
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

class CookieJar {
  private values = new Map<string, string>();

  capture(response: Response) {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const rows = headers.getSetCookie?.() ?? [];
    if (rows.length === 0) {
      const fallback = response.headers.get("set-cookie");
      if (fallback) rows.push(fallback);
    }
    for (const row of rows) {
      const first = row.split(";", 1)[0];
      const separator = first.indexOf("=");
      if (separator < 1) continue;
      const name = first.slice(0, separator);
      const value = first.slice(separator + 1);
      if (value) this.values.set(name, value);
      else this.values.delete(name);
    }
  }

  header() {
    return Array.from(this.values.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function requestLocalHost(host: string, path: string, init: RequestInit = {}, jar?: CookieJar) {
  const headers = new Headers(init.headers);
  headers.set("host", `${host}:3200`);
  headers.set("x-forwarded-host", `${host}:3200`);
  headers.set("x-forwarded-proto", "http");
  const cookie = jar?.header();
  if (cookie) headers.set("cookie", cookie);
  return fetch(`http://127.0.0.1:3200${path}`, {
    ...init,
    headers,
    redirect: init.redirect ?? "manual",
  }).then((response) => {
    jar?.capture(response);
    return response;
  });
}

async function verifyDatabaseIsolation(baseUrl: URL) {
  const clients = {
    police: createClient(baseUrl, "police"),
    fire: createClient(baseUrl, "fire"),
  };
  try {
    const reports = [];
    for (const tenantType of ["police", "fire"] as const) {
      const prisma = clients[tenantType];
      const [users, admins, exams, submissions, suspicious, failedScores, subjects, notices, faqs, banners, sharedUser, requestedAdmin] =
        await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { role: "ADMIN" } }),
          prisma.exam.count({ where: { isActive: true } }),
          prisma.submission.count(),
          prisma.submission.count({ where: { isSuspicious: true } }),
          prisma.subjectScore.count({ where: { isFailed: true } }),
          prisma.subject.findMany({ orderBy: { id: "asc" } }),
          prisma.notice.count({ where: { tenantType } }),
          prisma.faq.count({ where: { tenantType } }),
          prisma.banner.count({ where: { tenantType } }),
          prisma.user.findUnique({ where: { phone: sharedLogin } }),
          prisma.user.findUnique({ where: { phone: "admin" } }),
        ]);

      const expectedUsers = tenantType === "police" ? 18 : 17;
      const expectedAdmins = tenantType === "police" ? 2 : 1;
      assert(users === expectedUsers, `${tenantType}: expected ${expectedUsers} users, received ${users}.`);
      assert(admins === expectedAdmins, `${tenantType}: expected ${expectedAdmins} admin users.`);
      assert(exams === 1, `${tenantType}: expected one active exam.`);
      assert(submissions === 16, `${tenantType}: expected 16 submissions.`);
      assert(suspicious === 1, `${tenantType}: suspicious sample is missing.`);
      assert(failedScores >= 1, `${tenantType}: failed-score sample is missing.`);
      assert(notices === 1 && faqs === 1 && banners === 1, `${tenantType}: admin content seed mismatch.`);
      assert(sharedUser?.id === 2, `${tenantType}: shared synthetic user must keep id 2.`);
      assert(await bcrypt.compare(expectedPasswords[tenantType], sharedUser.password), `${tenantType}: own password failed.`);
      const opposite = tenantType === "police" ? "fire" : "police";
      assert(!(await bcrypt.compare(expectedPasswords[opposite], sharedUser.password)), `${tenantType}: opposite password crossed schemas.`);
      if (tenantType === "police") {
        assert(requestedAdmin?.role === "ADMIN", "Police requested local admin is missing.");
        assert(await bcrypt.compare("1234!!", requestedAdmin.password), "Police requested local admin password failed.");
      } else {
        assert(requestedAdmin === null, "Police requested local admin leaked into the fire schema.");
      }

      const subjectNames = new Set(subjects.map((subject) => subject.name));
      if (tenantType === "police") {
        assert(subjectNames.has("헌법") && subjectNames.has("형사법") && subjectNames.has("경찰학") && subjectNames.has("범죄학"), "Police subjects are incomplete.");
        assert(!subjectNames.has("소방학개론") && !subjectNames.has("소방관계법규"), "Fire subjects leaked into police schema.");
      } else {
        assert(subjectNames.has("소방학개론") && subjectNames.has("소방관계법규") && subjectNames.has("응급처치학개론"), "Fire subjects are incomplete.");
        assert(!subjectNames.has("헌법") && !subjectNames.has("형사법") && !subjectNames.has("경찰학"), "Police subjects leaked into fire schema.");
      }

      const publicTotal = subjects
        .filter((subject) => subject.examType === ExamType.PUBLIC)
        .reduce((sum, subject) => sum + subject.maxScore, 0);
      assert(publicTotal === (tenantType === "police" ? 250 : 300), `${tenantType}: active subject max-score sum is wrong.`);

      const [scoredSubmissions, answerKeys] = await Promise.all([
        prisma.submission.findMany({
          include: {
            userAnswers: {
              select: { subjectId: true, questionNumber: true, selectedAnswer: true },
            },
            subjectScores: {
              select: {
                subjectId: true,
                rawScore: true,
                isFailed: true,
              },
            },
          },
        }),
        prisma.answerKey.findMany({
          select: { examId: true, subjectId: true, questionNumber: true, correctAnswer: true },
        }),
      ]);
      const answerKeyById = new Map(
        answerKeys.map((key) => [
          `${key.examId}:${key.subjectId}:${key.questionNumber}`,
          key.correctAnswer,
        ] as const)
      );

      for (const submission of scoredSubmissions) {
        const scoringSubjects = subjects.filter((subject) => subject.examType === submission.examType);
        assert(scoringSubjects.length > 0, `${tenantType}: submission ${submission.id} has an invalid exam type.`);
        const answersBySubject = new Map<number, typeof submission.userAnswers>();
        for (const answer of submission.userAnswers) {
          const rows = answersBySubject.get(answer.subjectId) ?? [];
          rows.push(answer);
          answersBySubject.set(answer.subjectId, rows);
        }

        const expectedRows = scoringSubjects.map((subject) => {
          const correctCount = (answersBySubject.get(subject.id) ?? []).filter(
            (answer) =>
              answer.selectedAnswer ===
              answerKeyById.get(`${submission.examId}:${answer.subjectId}:${answer.questionNumber}`)
          ).length;
          const rawScore = Number((correctCount * subject.pointPerQuestion).toFixed(2));
          return {
            subject,
            rawScore,
            individualFailed: rawScore < subject.maxScore * 0.4,
          };
        });
        const expectedTotal = Number(expectedRows.reduce((sum, row) => sum + row.rawScore, 0).toFixed(2));
        const totalMax = scoringSubjects.reduce((sum, subject) => sum + subject.maxScore, 0);
        const fireTotalFailed = tenantType === "fire" && expectedTotal < totalMax * 0.6;
        const policeSubjectFailed = tenantType === "police" && expectedRows.some((row) => row.individualFailed);
        let expectedBonus = 0;

        for (const expected of expectedRows) {
          const stored = submission.subjectScores.find((row) => row.subjectId === expected.subject.id);
          assert(stored, `${tenantType}: submission ${submission.id} subject score is missing.`);
          const bonus =
            fireTotalFailed || policeSubjectFailed || expected.individualFailed
              ? 0
              : Number((expected.subject.maxScore * Number(submission.bonusRate)).toFixed(2));
          expectedBonus = Number((expectedBonus + bonus).toFixed(2));
          assert(Number(stored.rawScore) === expected.rawScore, `${tenantType}: raw score formula mismatch.`);
          assert(
            stored.isFailed === (fireTotalFailed || expected.individualFailed),
            `${tenantType}: cutoff policy mismatch for submission ${submission.id}, subject ${expected.subject.name} ` +
              `(stored=${stored.isFailed}, expected=${fireTotalFailed || expected.individualFailed}, total=${expectedTotal}/${totalMax}).`
          );
        }

        assert(Number(submission.totalScore) === expectedTotal, `${tenantType}: total score formula mismatch.`);
        assert(
          Number(submission.finalScore) === Number((expectedTotal + expectedBonus).toFixed(2)),
          `${tenantType}: final score formula mismatch.`
        );
      }
      reports.push({
        tenantType,
        users,
        submissions,
        subjects: subjects.length,
        publicTotal,
        scoringVerified: scoredSubmissions.length,
      });
    }
    console.log(JSON.stringify({ databaseIsolation: "passed", reports }, null, 2));
  } finally {
    await Promise.all(Object.values(clients).map((client) => client.$disconnect()));
  }
}

async function verifyHostRouting() {
  const targets = [
    { host: "police.localhost", path: "/", expected: 200, brand: "한국경찰학원 합격예측" },
    { host: "fire.localhost", path: "/", expected: 200, brand: "소방 합격예측" },
    { host: "localhost", path: "/police/login", expected: 200 },
    { host: "localhost", path: "/fire/login", expected: 200 },
  ];
  for (const target of targets) {
    const response = await requestLocalHost(target.host, target.path);
    assert(response.status === target.expected, `${target.host}${target.path}: expected ${target.expected}, received ${response.status}.`);
    if (target.brand) {
      assert(
        response.headers.get("x-middleware-rewrite") !== "/login",
        `${target.host}${target.path}: unauthenticated root was rewritten to login.`
      );
      const html = await response.text();
      assert(html.includes(target.brand), `${target.host}${target.path}: public landing branding is missing.`);
      assert(
        !html.includes('id="username"') && !html.includes('id="phone"'),
        `${target.host}${target.path}: public landing rendered a login form.`
      );
    }
  }

  const canonical = await requestLocalHost("police.localhost", "/police/login");
  assert(canonical.status === 308, `Police prefixed canonical redirect expected 308, received ${canonical.status}.`);
  assert(canonical.headers.get("location") === "http://police.localhost:3200/login", "Police canonical redirect target is wrong.");

  const crossGet = await requestLocalHost("police.localhost", "/fire/login");
  assert(crossGet.status === 308, `Cross-tenant GET expected 308, received ${crossGet.status}.`);
  assert(crossGet.headers.get("location") === "http://fire.localhost:3200/login", "Cross-tenant GET target is wrong.");

  const crossMutation = await requestLocalHost("police.localhost", "/fire/api/submission", {
    method: "POST",
    redirect: "manual",
  });
  assert(crossMutation.status === 421, `Cross-tenant mutation expected 421, received ${crossMutation.status}.`);
  console.log(JSON.stringify({ hostRouting: "passed" }, null, 2));
}

async function login(
  tenantType: TenantType,
  password: string,
  identifier = sharedLogin,
  adminOnly = false
) {
  const host = tenantType === "police" ? "police.localhost" : "fire.localhost";
  const jar = new CookieJar();
  const csrfResponse = await requestLocalHost(host, "/api/auth/csrf", {}, jar);
  assert(csrfResponse.ok, `${tenantType}: CSRF request failed with ${csrfResponse.status}.`);
  const csrf = (await csrfResponse.json()) as { csrfToken?: string };
  assert(csrf.csrfToken, `${tenantType}: CSRF token is missing.`);

  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    callbackUrl: `http://${host}:3200/exam/main`,
    password,
    json: "true",
  });
  body.set(tenantType === "police" ? "username" : "phone", identifier);
  if (adminOnly) body.set("adminOnly", "true");
  const response = await requestLocalHost(
    host,
    "/api/auth/callback/credentials?json=true",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
    jar
  );
  const payload = (await response.json()) as { url?: string };
  return { host, jar, response, payload };
}

async function verifyLoginIsolation() {
  for (const tenantType of ["police", "fire"] as const) {
    const own = await login(tenantType, expectedPasswords[tenantType]);
    assert(own.response.ok, `${tenantType}: own login failed with ${own.response.status}.`);
    assert(!own.payload.url?.includes("error="), `${tenantType}: own login returned an auth error.`);

    const sessionResponse = await requestLocalHost(own.host, "/api/auth/session", {}, own.jar);
    assert(sessionResponse.ok, `${tenantType}: session lookup failed with ${sessionResponse.status}.`);
    const session = (await sessionResponse.json()) as { user?: { tenantType?: string; sessionVersion?: number } };
    assert(session.user?.tenantType === tenantType, `${tenantType}: session tenant claim mismatch.`);
    assert(session.user?.sessionVersion === 3, `${tenantType}: session version mismatch.`);

    const statsResponse = await requestLocalHost(own.host, "/api/main-stats", {}, own.jar);
    assert(statsResponse.ok, `${tenantType}: main stats failed with ${statsResponse.status}.`);
    const stats = (await statsResponse.json()) as {
      tenantType?: string;
      examTypes?: Array<{ key: string; requiresGender: boolean }>;
      scoreDistributions?: Record<string, Array<{ label: string; maxScore: number }>>;
    };
    assert(stats.tenantType === tenantType, `${tenantType}: stats tenant mismatch.`);
    const examTypeKeys = new Set(stats.examTypes?.map((item) => item.key) ?? []);
    const publicDistribution = stats.scoreDistributions?.PUBLIC ?? [];
    const distributionLabels = new Set(publicDistribution.map((item) => item.label));
    if (tenantType === "police") {
      assert(examTypeKeys.has("PUBLIC") && examTypeKeys.has("CAREER"), "Police exam types are incomplete.");
      assert(!examTypeKeys.has("CAREER_RESCUE") && !examTypeKeys.has("CAREER_EMT"), "Fire exam types leaked into police stats.");
      assert(distributionLabels.has("헌법") && distributionLabels.has("형사법") && distributionLabels.has("경찰학"), "Police score distribution subjects are incomplete.");
      assert(!distributionLabels.has("소방학개론"), "Fire distribution leaked into police stats.");
      assert(publicDistribution.find((item) => item.label === "총점")?.maxScore === 250, "Police total max score must be 250.");
      const careerDistribution = stats.scoreDistributions?.CAREER ?? [];
      assert(careerDistribution.some((item) => item.label === "범죄학"), "Police career subjects are incomplete.");
      assert(careerDistribution.find((item) => item.label === "총점")?.maxScore === 250, "Police career total max score must be 250.");

      const predictionResponse = await requestLocalHost(own.host, "/api/prediction", {}, own.jar);
      assert(
        predictionResponse.ok,
        `police: prediction lookup failed with ${predictionResponse.status}.`
      );
      const prediction = await readJson<{
        summary?: {
          recruitCount: number;
          passMultiple: number;
          passCount: number | null;
          predictionGrade: string | null;
          gradeAvailability: "AVAILABLE" | "UNAVAILABLE";
          sampleTopPercent: number | null;
          myRank: number;
          totalParticipants: number;
        };
        pyramid?: { levels: unknown[] };
      }>(predictionResponse, "police prediction");
      assert(prediction.summary, "police: prediction summary is missing.");
      assert(
        prediction.summary.passMultiple === 2,
        `police: expected 2.0 pass multiple, received ${prediction.summary.passMultiple}.`
      );
      assert(
        prediction.summary.gradeAvailability === "UNAVAILABLE" &&
          prediction.summary.predictionGrade === null &&
          prediction.summary.passCount === null &&
          prediction.pyramid?.levels.length === 0,
        "police: uncalibrated grade or sample-derived pass boundary leaked through the API."
      );
      assert(
        prediction.summary.totalParticipants < 15
          ? prediction.summary.sampleTopPercent === null
          : prediction.summary.sampleTopPercent === Number(
              ((prediction.summary.myRank / prediction.summary.totalParticipants) * 100).toFixed(1)
            ),
        "police: sample percentile suppression or rank formula is inconsistent."
      );
    } else {
      assert(examTypeKeys.has("CAREER_RESCUE") && examTypeKeys.has("CAREER_EMT"), "Fire exam types are incomplete.");
      assert(!examTypeKeys.has("CAREER"), "Police career type leaked into fire stats.");
      assert(distributionLabels.has("소방학개론") && distributionLabels.has("소방관계법규") && distributionLabels.has("행정법총론"), "Fire score distribution subjects are incomplete.");
      assert(!distributionLabels.has("헌법"), "Police distribution leaked into fire stats.");
      assert(publicDistribution.find((item) => item.label === "총점")?.maxScore === 300, "Fire total max score must be 300.");
      const rescueDistribution = stats.scoreDistributions?.CAREER_RESCUE ?? [];
      assert(rescueDistribution.find((item) => item.label === "총점")?.maxScore === 200, "Fire career total max score must be 200.");
    }

    const oppositeHost = tenantType === "police" ? "fire.localhost" : "police.localhost";
    const crossedSession = await requestLocalHost(oppositeHost, "/api/auth/session", {}, own.jar);
    assert(crossedSession.status === 401, `${tenantType}: crossed session expected 401, received ${crossedSession.status}.`);

    const wrong = await login(tenantType, expectedPasswords[tenantType === "police" ? "fire" : "police"]);
    assert(wrong.payload.url?.includes("error=CredentialsSignin"), `${tenantType}: opposite password unexpectedly logged in.`);

    const admin = await login(tenantType, tenantType === "police" ? "PoliceAdmin!123" : "FireAdmin!123", "010-0000-0000", true);
    assert(admin.response.ok && !admin.payload.url?.includes("error="), `${tenantType}: admin login failed.`);
    const adminUsers = await requestLocalHost(admin.host, "/api/admin/users", {}, admin.jar);
    assert(adminUsers.ok, `${tenantType}: own admin API failed with ${adminUsers.status}.`);
    const crossedAdmin = await requestLocalHost(oppositeHost, "/api/admin/users", {}, admin.jar);
    assert(crossedAdmin.status === 401, `${tenantType}: crossed admin API expected 401, received ${crossedAdmin.status}.`);

    if (tenantType === "police") {
      const examsResponse = await requestLocalHost(
        admin.host,
        "/api/admin/exam?feature=exams&active=true",
        {},
        admin.jar
      );
      assert(examsResponse.ok, `police: exam admin API failed with ${examsResponse.status}.`);
      const examPayload = await readJson<{ exams?: Array<{ id: number }> }>(examsResponse, "police exams");
      const examId = examPayload.exams?.[0]?.id;
      assert(examId, "police: active exam is missing for calibration test.");

      const settingsBeforeResponse = await requestLocalHost(
        admin.host,
        "/api/admin/site",
        {},
        admin.jar
      );
      assert(settingsBeforeResponse.ok, "police: admin site settings lookup failed.");
      const settingsBefore = await readJson<{ settings?: Record<string, unknown> }>(
        settingsBeforeResponse,
        "police settings before active exam edit"
      );
      const activeEditResponse = await requestLocalHost(
        admin.host,
        `/api/admin/exam?feature=exams&id=${examId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        },
        admin.jar
      );
      assert(activeEditResponse.ok, "police: active exam metadata edit failed.");
      const settingsAfterResponse = await requestLocalHost(
        admin.host,
        "/api/admin/site",
        {},
        admin.jar
      );
      assert(settingsAfterResponse.ok, "police: admin site settings recheck failed.");
      const settingsAfter = await readJson<{ settings?: Record<string, unknown> }>(
        settingsAfterResponse,
        "police settings after active exam edit"
      );
      for (const key of [
        "site.preRegistrationEnabled",
        "site.answerInputEnabled",
        "site.finalPredictionEnabled",
        "site.autoPassCutEnabled",
        "site.policePredictionGradesEnabled",
      ]) {
        assert(
          settingsAfter.settings?.[key] === settingsBefore.settings?.[key],
          `police: editing an already-active exam reset ${key}.`
        );
      }

      const gradeSettingResponse = await requestLocalHost(
        admin.host,
        "/api/admin/site?section=features",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            settings: {
              "site.policePredictionGradesEnabled": Boolean(
                settingsBefore.settings?.["site.policePredictionGradesEnabled"]
              ),
            },
          }),
        },
        admin.jar
      );
      assert(
        gradeSettingResponse.ok,
        `police: prediction-grade feature switch save failed (${gradeSettingResponse.status}).`
      );

      const captureResponse = await requestLocalHost(
        admin.host,
        "/api/admin/prediction-calibration",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ examId, phase: "MANUAL" }),
        },
        admin.jar
      );
      assert(captureResponse.ok, `police: calibration capture failed with ${captureResponse.status}.`);
      const capture = await readJson<{ snapshotCount?: number }>(captureResponse, "police calibration capture");
      assert((capture.snapshotCount ?? 0) > 0, "police: no calibration snapshot was captured.");
      const snapshotResponse = await requestLocalHost(
        admin.host,
        `/api/admin/prediction-calibration?examId=${examId}`,
        {},
        admin.jar
      );
      assert(snapshotResponse.ok, `police: calibration list failed with ${snapshotResponse.status}.`);
      const snapshotPayload = await readJson<{ snapshots?: Array<{ modelVersion: string; passMultiple: number }> }>(
        snapshotResponse,
        "police calibration list"
      );
      assert(
        snapshotPayload.snapshots?.some(
          (snapshot) =>
            snapshot.passMultiple === 2 &&
            snapshot.modelVersion === POLICE_PREDICTION_MODEL_VERSION
        ),
        "police: calibration snapshot is missing the exam pass multiple or model version."
      );
    }
  }
  console.log(JSON.stringify({ loginIsolation: "passed" }, null, 2));
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label}: invalid JSON response (${response.status}): ${text.slice(0, 300)}`);
  }
}

async function verifyRoundLifecycleAndFailClosed(baseUrl: URL) {
  const clients = {
    police: createClient(baseUrl, "police"),
    fire: createClient(baseUrl, "fire"),
  };
  const pastOnlyAccounts = {
    police: { identifier: "010-9115-1015", password: "police-user-15!" },
    fire: { identifier: "010-9215-1015", password: "fire-user-15!" },
  } as const;

  try {
    let releasePoliceWriteLock!: () => void;
    let policeWriteLockReady!: () => void;
    const writeLockReady = new Promise<void>((resolve) => {
      policeWriteLockReady = resolve;
    });
    const releaseWriteLock = new Promise<void>((resolve) => {
      releasePoliceWriteLock = resolve;
    });
    let policeTransitionAcquired = false;
    let fireTransitionAcquired = false;
    const heldPoliceWrite = clients.police.$transaction(async (tx) => {
      await lockActiveExamStateForWrite(tx, "police");
      policeWriteLockReady();
      await releaseWriteLock;
    });
    await writeLockReady;
    const blockedPoliceTransition = clients.police.$transaction(async (tx) => {
      await lockActiveExamStateForTransition(tx, "police");
      policeTransitionAcquired = true;
    });
    const independentFireTransition = clients.fire.$transaction(async (tx) => {
      await lockActiveExamStateForTransition(tx, "fire");
      fireTransitionAcquired = true;
    });
    try {
      await independentFireTransition;
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert(fireTransitionAcquired, "fire: police write lock blocked the independent fire transition.");
      assert(!policeTransitionAcquired, "police: active-exam transition bypassed an in-flight write lock.");
    } finally {
      releasePoliceWriteLock();
      await Promise.allSettled([heldPoliceWrite, blockedPoliceTransition, independentFireTransition]);
    }
    assert(policeTransitionAcquired, "police: transition did not resume after the write transaction ended.");

    const before = {
      police: {
        users: await clients.police.user.count(),
        submissions: await clients.police.submission.count(),
        preRegistrations: await clients.police.preRegistration.count(),
      },
      fire: {
        users: await clients.fire.user.count(),
        submissions: await clients.fire.submission.count(),
        preRegistrations: await clients.fire.preRegistration.count(),
      },
    };

    for (const tenantType of ["police", "fire"] as const) {
      const account = pastOnlyAccounts[tenantType];
      const user = await login(tenantType, account.password, account.identifier);
      assert(!user.payload.url?.includes("error="), `${tenantType}: past-only user login failed.`);

      const currentResultResponse = await requestLocalHost(
        user.host,
        "/api/result?optional=1",
        {},
        user.jar
      );
      assert(currentResultResponse.ok, `${tenantType}: current result lookup failed.`);
      const currentResult = await readJson<{ submission?: { id: number } | null }>(
        currentResultResponse,
        `${tenantType} current result`
      );
      assert(
        currentResult.submission === null,
        `${tenantType}: an archived submission leaked into the active-round default result.`
      );

      if (tenantType === "police") {
        const preRegistrationResponse = await requestLocalHost(
          user.host,
          "/api/pre-registration",
          {},
          user.jar
        );
        assert(preRegistrationResponse.ok, "police: current pre-registration lookup failed.");
        const preRegistration = await readJson<{
          preRegistration?: { examNumber: string } | null;
          smsMarketingConsent?: { consented: boolean };
        }>(preRegistrationResponse, "police current pre-registration");
        assert(
          preRegistration.preRegistration?.examNumber === "2026000015",
          "police: active-round pre-registration was not isolated from the archived submission."
        );
        assert(
          preRegistration.smsMarketingConsent?.consented === true,
          "police: optional SMS consent state was not preserved."
        );

        const withdrawResponse = await requestLocalHost(
          user.host,
          "/api/account/sms-marketing-consent",
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ consented: false }),
          },
          user.jar
        );
        assert(withdrawResponse.ok, "police: SMS consent withdrawal failed.");
        const withdrawn = await readJson<{ consented?: boolean }>(withdrawResponse, "police SMS withdrawal");
        assert(withdrawn.consented === false, "police: withdrawn SMS consent remained active.");

        const restoreConsentResponse = await requestLocalHost(
          user.host,
          "/api/account/sms-marketing-consent",
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ consented: true }),
          },
          user.jar
        );
        assert(restoreConsentResponse.ok, "police: SMS consent restore failed.");
      } else {
        const fireConsentResponse = await requestLocalHost(
          user.host,
          "/api/account/sms-marketing-consent",
          {},
          user.jar
        );
        assert(
          fireConsentResponse.status === 404,
          `fire: police SMS consent endpoint leaked into fire (${fireConsentResponse.status}).`
        );
      }
    }

    const policeOwner = await login(
      "police",
      pastOnlyAccounts.police.password,
      pastOnlyAccounts.police.identifier
    );
    const policeAdmin = await login(
      "police",
      "PoliceAdmin!123",
      "010-0000-0000",
      true
    );
    const consentedExportResponse = await requestLocalHost(
      policeAdmin.host,
      "/api/admin/pre-registrations/export?scope=marketing-consented",
      {},
      policeAdmin.jar
    );
    assert(consentedExportResponse.ok, "police: consented-only export failed.");
    const consentedExport = await consentedExportResponse.text();
    assert(
      consentedExport.includes("010-9115-1015") && consentedExport.includes("police-sms-marketing-v1"),
      "police: consented-only export omitted its consent evidence."
    );
    assert(
      !consentedExport.includes(sharedLogin),
      "police: a non-consenting account leaked into the consented-only export."
    );
    const ownerUser = await clients.police.user.findUnique({
      where: { phone: pastOnlyAccounts.police.identifier },
      select: { id: true },
    });
    const activePoliceExam = await clients.police.exam.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    const ownerPreRegistration = ownerUser && activePoliceExam
      ? await clients.police.preRegistration.findUnique({
          where: { userId_examId: { userId: ownerUser.id, examId: activePoliceExam.id } },
          select: { id: true, regionId: true, examNumber: true },
        })
      : null;
    assert(ownerUser && activePoliceExam && ownerPreRegistration, "police: ownership test seed is incomplete.");
    const ownershipRequest = {
      examId: activePoliceExam.id,
      examType: "PUBLIC",
      gender: "MALE",
      regionId: ownerPreRegistration.regionId,
      examNumber: ownerPreRegistration.examNumber,
      answers: [{ subjectName: "헌법", questionNo: 1, answer: 1 }],
    };

    const stolenNumberResponse = await requestLocalHost(
      policeAdmin.host,
      "/api/submission",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ownershipRequest),
      },
      policeAdmin.jar
    );
    assert(
      stolenNumberResponse.status === 400 || stolenNumberResponse.status === 409,
      `police: another account could use a pre-registered number (${stolenNumberResponse.status}).`
    );
    const adminUser = await clients.police.user.findUnique({
      where: { phone: "010-0000-0000" },
      select: { id: true },
    });
    assert(adminUser, "police: local admin missing for ownership test.");
    assert(
      (await clients.police.submission.count({
        where: { userId: adminUser.id, examId: activePoliceExam.id },
      })) === 0,
      "police: stolen pre-registration number created a submission."
    );

    const ownerSubmitResponse = await requestLocalHost(
      policeOwner.host,
      "/api/submission",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ownershipRequest),
      },
      policeOwner.jar
    );
    assert(ownerSubmitResponse.ok, `police: pre-registration owner submission failed (${ownerSubmitResponse.status}).`);
    const ownerSubmission = await clients.police.submission.findUnique({
      where: { userId_examId: { userId: ownerUser.id, examId: activePoliceExam.id } },
      select: { id: true },
    });
    const convertedPreRegistration = await clients.police.preRegistration.findUnique({
      where: { id: ownerPreRegistration.id },
      select: { submissionId: true, convertedAt: true },
    });
    assert(
      ownerSubmission &&
        convertedPreRegistration?.submissionId === ownerSubmission.id &&
        convertedPreRegistration.convertedAt,
      "police: pre-registration was not atomically linked to the owner submission."
    );
    await clients.police.submission.delete({ where: { id: ownerSubmission.id } });
    await clients.police.preRegistration.update({
      where: { id: ownerPreRegistration.id },
      data: { convertedAt: null },
    });

    for (const tenantType of ["police", "fire"] as const) {
      const otherTenant = tenantType === "police" ? "fire" : "police";
      const prisma = clients[tenantType];
      const activeExamBefore = await prisma.exam.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      assert(activeExamBefore, `${tenantType}: active exam is missing before invariant test.`);

      let duplicateActiveBlocked = false;
      let unexpectedActiveExamId: number | null = null;
      try {
        const unexpectedActiveExam = await prisma.exam.create({
          data: {
            name: `${tenantType}-dual-active-guard-test`,
            year: 2099,
            round: tenantType === "police" ? 98 : 99,
            examDate: new Date("2099-01-01T00:00:00Z"),
            isActive: true,
          },
        });
        unexpectedActiveExamId = unexpectedActiveExam.id;
      } catch (error) {
        duplicateActiveBlocked = (error as { code?: string }).code === "P2002";
      }
      if (unexpectedActiveExamId) {
        await prisma.exam.delete({ where: { id: unexpectedActiveExamId } });
      }
      assert(duplicateActiveBlocked, `${tenantType}: DB allowed two active exams.`);

      await prisma.exam.updateMany({ where: { isActive: true }, data: { isActive: false } });

      try {
        const ownActiveResponse = await requestLocalHost(
          `${tenantType}.localhost`,
          "/api/exams?active=true"
        );
        assert(
          ownActiveResponse.status === 503,
          `${tenantType}: zero active exams must fail closed with 503.`
        );

        const otherActiveResponse = await requestLocalHost(
          `${otherTenant}.localhost`,
          "/api/exams?active=true"
        );
        assert(
          otherActiveResponse.ok,
          `${tenantType}: its invalid active state blocked the independent ${otherTenant} tenant.`
        );

        const account = pastOnlyAccounts[tenantType];
        const user = await login(tenantType, account.password, account.identifier);
        const region = await prisma.region.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
        assert(region, `${tenantType}: local region missing.`);
        const writeResponse = await requestLocalHost(
          user.host,
          "/api/submission",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              examType: tenantType === "police" ? "PUBLIC" : "CAREER_RESCUE",
              gender: "MALE",
              regionId: region.id,
              answers: [{ subjectName: tenantType === "police" ? "헌법" : "소방학개론", questionNo: 1, answer: 1 }],
            }),
          },
          user.jar
        );
        assert(
          writeResponse.status === 503,
          `${tenantType}: a submission write was not blocked while no exam was active.`
        );
      } finally {
        await prisma.exam.update({ where: { id: activeExamBefore.id }, data: { isActive: true } });
      }
    }

    const after = {
      police: {
        users: await clients.police.user.count(),
        submissions: await clients.police.submission.count(),
        preRegistrations: await clients.police.preRegistration.count(),
      },
      fire: {
        users: await clients.fire.user.count(),
        submissions: await clients.fire.submission.count(),
        preRegistrations: await clients.fire.preRegistration.count(),
      },
    };
    assert(JSON.stringify(after) === JSON.stringify(before), "Round lifecycle guards changed preserved tenant data.");
    console.log(JSON.stringify({ roundLifecycle: "passed", before, after }, null, 2));
  } finally {
    await Promise.all(Object.values(clients).map((client) => client.$disconnect()));
  }
}

async function verifyPolicyRegressions(baseUrl: URL) {
  const clients = {
    police: createClient(baseUrl, "police"),
    fire: createClient(baseUrl, "fire"),
  };
  const finalPredictionSettingBackups: Array<{
    tenantType: TenantType;
    value: string | null;
  }> = [];
  const submissionBackups: Array<{
    tenantType: TenantType;
    id: number;
    examType: ExamType;
  }> = [];
  const createdFinalPredictions: Array<{ tenantType: TenantType; submissionId: number }> = [];
  let fireQuotaBackup: {
    examId: number;
    regionId: number;
    recruitAcademicCombined: number;
    applicantAcademicCombined: number | null;
  } | null = null;

  try {
    for (const tenantType of ["police", "fire"] as const) {
      const host = `${tenantType}.localhost`;
      const publicSettingsResponse = await requestLocalHost(host, "/api/site-settings");
      assert(publicSettingsResponse.ok, `${tenantType}: site settings failed with ${publicSettingsResponse.status}.`);
      const publicSettings = await readJson<{ settings?: Record<string, unknown> }>(
        publicSettingsResponse,
        `${tenantType} site settings`
      );
      assert(
        publicSettings.settings?.["site.title"] === (tenantType === "police" ? "경찰 합격예측" : "소방 합격예측"),
        `${tenantType}: scoped local site title was not loaded.`
      );

      const spoofedSettingsResponse = await requestLocalHost(host, "/api/site-settings", {
        headers: {
          "x-hankuk-division": tenantType === "police" ? "fire" : "police",
          cookie: `hankuk_division=${tenantType === "police" ? "fire" : "police"}`,
        },
      });
      const spoofedSettings = await readJson<{ settings?: Record<string, unknown> }>(
        spoofedSettingsResponse,
        `${tenantType} spoofed settings`
      );
      assert(
        spoofedSettings.settings?.["site.title"] === publicSettings.settings?.["site.title"],
        `${tenantType}: header or cookie changed the official-host tenant.`
      );

      const admin = await login(
        tenantType,
        tenantType === "police" ? "PoliceAdmin!123" : "FireAdmin!123",
        "010-0000-0000",
        true
      );
      assert(admin.response.ok && !admin.payload.url?.includes("error="), `${tenantType}: regression admin login failed.`);
      const adminStatsResponse = await requestLocalHost(admin.host, "/api/stats", {}, admin.jar);
      assert(adminStatsResponse.ok, `${tenantType}: admin stats failed with ${adminStatsResponse.status}.`);
      const adminStats = await readJson<{
        scoreDistributions?: Array<{
          examType: string;
          maxScore: number;
          cutoffScore: number | null;
          items: Array<{ label: string }>;
        }>;
      }>(adminStatsResponse, `${tenantType} admin stats`);
      const publicSeries = adminStats.scoreDistributions?.find((series) => series.examType === "PUBLIC");
      const expectedPublicMax = tenantType === "police" ? 250 : 300;
      assert(publicSeries?.maxScore === expectedPublicMax, `${tenantType}: admin histogram max score is wrong.`);
      assert(
        publicSeries?.items.at(-1)?.label === `${expectedPublicMax}점`,
        `${tenantType}: admin histogram does not preserve the exact maximum-score bucket.`
      );
      assert(
        publicSeries?.cutoffScore === (tenantType === "fire" ? 180 : null),
        `${tenantType}: admin histogram cutoff policy is wrong.`
      );
      if (tenantType === "fire") {
        const academicSeries = adminStats.scoreDistributions?.find(
          (series) => series.examType === "CAREER_ACADEMIC"
        );
        assert(
          academicSeries?.maxScore === 200 && academicSeries.items.at(-1)?.label === "200점",
          "fire: career histogram must use the 200-point subject maximum."
        );
      }

      const prisma = clients[tenantType];
      const settingKey = `${tenantType}::site.finalPredictionEnabled`;
      const previousSetting = await prisma.siteSetting.findUnique({ where: { key: settingKey } });
      finalPredictionSettingBackups.push({ tenantType, value: previousSetting?.value ?? null });
      await prisma.siteSetting.upsert({
        where: { key: settingKey },
        update: { value: "true" },
        create: { key: settingKey, value: "true" },
      });

      const submission = await prisma.submission.findFirst({
        where: { userId: 2 },
        orderBy: { id: "asc" },
        select: { id: true, examType: true },
      });
      assert(submission, `${tenantType}: shared local user submission is missing.`);
      submissionBackups.push({ tenantType, id: submission.id, examType: submission.examType });
      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          examType: tenantType === "police" ? ExamType.CAREER_RESCUE : ExamType.CAREER,
        },
      });

      const user = await login(tenantType, expectedPasswords[tenantType]);
      assert(user.response.ok && !user.payload.url?.includes("error="), `${tenantType}: regression user login failed.`);
      const invalidPrediction = await requestLocalHost(
        user.host,
        `/api/final-prediction?submissionId=${submission.id}`,
        {},
        user.jar
      );
      assert(
        invalidPrediction.status === 404,
        `${tenantType}: opposite-tenant final prediction must be hidden with 404, received ${invalidPrediction.status}.`
      );

      await prisma.submission.update({
        where: { id: submission.id },
        data: { examType: submission.examType },
      });
      submissionBackups.pop();

      const activeSubmission = await prisma.submission.findFirst({
        where: { userId: 2, exam: { isActive: true } },
        select: { id: true },
      });
      assert(activeSubmission, `${tenantType}: active-round final-prediction seed is missing.`);
      const oppositeTenant = tenantType === "police" ? "fire" : "police";
      const oppositeCountBefore = await clients[oppositeTenant].finalPrediction.count();
      const finalPredictionResponse = await requestLocalHost(
        user.host,
        "/api/final-prediction",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            tenantType === "police"
              ? { submissionId: activeSubmission.id, fitnessPassed: true, martialDanLevel: 2 }
              : { submissionId: activeSubmission.id, fitnessRawScore: 40, certificateBonus: 0 }
          ),
        },
        user.jar
      );
      assert(
        finalPredictionResponse.ok,
        `${tenantType}: active final prediction write failed (${finalPredictionResponse.status}).`
      );
      const savedFinalPrediction = await prisma.finalPrediction.findUnique({
        where: { submissionId: activeSubmission.id },
        select: { submissionId: true, finalRank: true },
      });
      assert(savedFinalPrediction, `${tenantType}: atomic final prediction was not saved.`);
      createdFinalPredictions.push({ tenantType, submissionId: activeSubmission.id });
      assert(
        (await clients[oppositeTenant].finalPrediction.count()) === oppositeCountBefore,
        `${tenantType}: final prediction write crossed into ${oppositeTenant}.`
      );

      const pastAccount = tenantType === "police"
        ? { identifier: "010-9115-1015", password: "police-user-15!" }
        : { identifier: "010-9215-1015", password: "fire-user-15!" };
      const pastUser = await login(tenantType, pastAccount.password, pastAccount.identifier);
      const pastSubmission = await prisma.submission.findFirst({
        where: { user: { phone: pastAccount.identifier }, exam: { isActive: false } },
        select: { id: true, examId: true, examType: true, examNumber: true },
      });
      assert(pastSubmission, `${tenantType}: archived final-prediction seed is missing.`);
      const pastFinalPredictionResponse = await requestLocalHost(
        pastUser.host,
        "/api/final-prediction",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            tenantType === "police"
              ? { submissionId: pastSubmission.id, fitnessPassed: true, martialDanLevel: 2 }
              : { submissionId: pastSubmission.id, fitnessRawScore: 40, certificateBonus: 0 }
          ),
        },
        pastUser.jar
      );
      assert(
        pastFinalPredictionResponse.status === 409,
        `${tenantType}: archived final prediction write was not blocked (${pastFinalPredictionResponse.status}).`
      );

      const archivedAdminEdit = await requestLocalHost(
        admin.host,
        `/api/admin/submissions?id=${pastSubmission.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ examNumber: pastSubmission.examNumber }),
        },
        admin.jar
      );
      assert(
        archivedAdminEdit.status === 409,
        `${tenantType}: admin edited an archived submission (${archivedAdminEdit.status}).`
      );
      const archivedAdminDelete = await requestLocalHost(
        admin.host,
        `/api/admin/submissions?id=${pastSubmission.id}&confirm=true`,
        { method: "DELETE" },
        admin.jar
      );
      assert(
        archivedAdminDelete.status === 409,
        `${tenantType}: admin deleted an archived submission (${archivedAdminDelete.status}).`
      );

      const archivedAnswerSave = await requestLocalHost(
        admin.host,
        "/api/admin/answers",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            examId: pastSubmission.examId,
            examType: pastSubmission.examType,
            isConfirmed: true,
            answers: [],
          }),
        },
        admin.jar
      );
      assert(
        archivedAnswerSave.status === 409,
        `${tenantType}: admin changed archived answer keys (${archivedAnswerSave.status}).`
      );
      const archivedAnswerDelete = await requestLocalHost(
        admin.host,
        "/api/admin/answers",
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ examId: pastSubmission.examId, examType: pastSubmission.examType }),
        },
        admin.jar
      );
      assert(
        archivedAnswerDelete.status === 409,
        `${tenantType}: admin reset archived answer keys (${archivedAnswerDelete.status}).`
      );
      const archivedRescore = await requestLocalHost(
        admin.host,
        "/api/admin/rescore",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ examId: pastSubmission.examId, examType: pastSubmission.examType }),
        },
        admin.jar
      );
      assert(
        archivedRescore.status === 409,
        `${tenantType}: admin rescored an archived exam (${archivedRescore.status}).`
      );
      const archivedPassCut = await requestLocalHost(
        admin.host,
        "/api/admin/pass-cut-release",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ examId: pastSubmission.examId, releaseNumber: 1, autoNotice: false }),
        },
        admin.jar
      );
      assert(
        archivedPassCut.status === 409,
        `${tenantType}: admin released an archived pass cut (${archivedPassCut.status}).`
      );
      const archivedMockGenerate = await requestLocalHost(
        admin.host,
        "/api/admin/mock-data",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ examId: pastSubmission.examId, publicPerRegion: 1 }),
        },
        admin.jar
      );
      assert(
        archivedMockGenerate.status === 409,
        `${tenantType}: admin generated mock data in an archived exam (${archivedMockGenerate.status}).`
      );
      const activeExam = await prisma.exam.findFirst({ where: { isActive: true }, select: { id: true } });
      assert(activeExam, `${tenantType}: active exam missing for archived quota-copy guard.`);
      const archivedQuotaCopy = await requestLocalHost(
        admin.host,
        "/api/admin/regions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceExamId: activeExam.id, targetExamId: pastSubmission.examId }),
        },
        admin.jar
      );
      assert(
        archivedQuotaCopy.status === 409,
        `${tenantType}: admin overwrote archived region quotas (${archivedQuotaCopy.status}).`
      );
    }

    const firePrisma = clients.fire;
    const fireQuota = await firePrisma.examRegionQuota.findFirst({
      orderBy: [{ examId: "asc" }, { regionId: "asc" }],
      select: {
        examId: true,
        regionId: true,
        recruitAcademicCombined: true,
        applicantAcademicCombined: true,
      },
    });
    assert(fireQuota, "fire: local quota is missing.");
    fireQuotaBackup = fireQuota;
    await firePrisma.examRegionQuota.update({
      where: { examId_regionId: { examId: fireQuota.examId, regionId: fireQuota.regionId } },
      data: { recruitAcademicCombined: 9, applicantAcademicCombined: 77 },
    });

    const fireUser = await login("fire", expectedPasswords.fire);
    const mainStatsResponse = await requestLocalHost(fireUser.host, "/api/main-stats", {}, fireUser.jar);
    assert(mainStatsResponse.ok, `fire: combined main stats failed with ${mainStatsResponse.status}.`);
    const mainStats = await readJson<{
      rows?: Array<{ regionId: number; examType: string; gender: string | null; recruitCount: number; applicantCount: number | null }>;
    }>(mainStatsResponse, "fire combined main stats");
    const academicMainRows = (mainStats.rows ?? []).filter(
      (row) => row.regionId === fireQuota.regionId && row.examType === "CAREER_ACADEMIC"
    );
    assert(
      academicMainRows.length === 1 &&
        academicMainRows[0]?.gender === null &&
        academicMainRows[0]?.recruitCount === 9 &&
        academicMainRows[0]?.applicantCount === 77,
      `fire: main stats combined academic cohort is wrong: ${JSON.stringify(academicMainRows)}`
    );

    const fireAdmin = await login("fire", "FireAdmin!123", "010-0000-0000", true);
    const fireAdminStatsResponse = await requestLocalHost(fireAdmin.host, "/api/stats", {}, fireAdmin.jar);
    assert(fireAdminStatsResponse.ok, `fire: combined admin stats failed with ${fireAdminStatsResponse.status}.`);
    const fireAdminStats = await readJson<{
      byRegionPrediction?: Array<{ regionId: number; examType: string; gender: string | null; recruitCount: number }>;
    }>(fireAdminStatsResponse, "fire combined admin stats");
    const academicAdminRows = (fireAdminStats.byRegionPrediction ?? []).filter(
      (row) => row.regionId === fireQuota.regionId && row.examType === "CAREER_ACADEMIC"
    );
    assert(
      academicAdminRows.length === 1 &&
        academicAdminRows[0]?.gender === null &&
        academicAdminRows[0]?.recruitCount === 9,
      `fire: admin stats combined academic cohort is wrong: ${JSON.stringify(academicAdminRows)}`
    );

    console.log(JSON.stringify({ tenantPolicyRegressions: "passed" }, null, 2));
  } finally {
    for (const created of createdFinalPredictions) {
      await clients[created.tenantType].finalPrediction.delete({
        where: { submissionId: created.submissionId },
      }).catch(() => undefined);
    }
    if (fireQuotaBackup) {
      await clients.fire.examRegionQuota.update({
        where: {
          examId_regionId: {
            examId: fireQuotaBackup.examId,
            regionId: fireQuotaBackup.regionId,
          },
        },
        data: {
          recruitAcademicCombined: fireQuotaBackup.recruitAcademicCombined,
          applicantAcademicCombined: fireQuotaBackup.applicantAcademicCombined,
        },
      }).catch(() => undefined);
    }
    for (const backup of submissionBackups) {
      await clients[backup.tenantType].submission.update({
        where: { id: backup.id },
        data: { examType: backup.examType },
      }).catch(() => undefined);
    }
    for (const backup of finalPredictionSettingBackups) {
      const key = `${backup.tenantType}::site.finalPredictionEnabled`;
      if (backup.value === null) {
        await clients[backup.tenantType].siteSetting.delete({ where: { key } }).catch(() => undefined);
      } else {
        await clients[backup.tenantType].siteSetting.update({
          where: { key },
          data: { value: backup.value },
        }).catch(() => undefined);
      }
    }
    await Promise.all(Object.values(clients).map((client) => client.$disconnect()));
  }
}

async function main() {
  const baseUrl = getSafeBaseUrl();
  await verifyDatabaseIsolation(baseUrl);
  await verifyHostRouting();
  await verifyLoginIsolation();
  await verifyRoundLifecycleAndFailClosed(baseUrl);
  await verifyPolicyRegressions(baseUrl);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
