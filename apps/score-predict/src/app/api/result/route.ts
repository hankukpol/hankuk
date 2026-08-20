import { ExamType, Gender, Prisma, Role, SubmissionScoringStatus, SubmissionSuspicionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";
import * as fireCorrectRate from "@/lib/fire/correct-rate";
import * as policeCorrectRate from "@/lib/police/correct-rate";
import { parsePositiveInt } from "@/lib/exam-utils";
import * as firePolicy from "@/lib/fire/policy";
import * as policePolicy from "@/lib/police/policy";
import { getFireRecruitCount } from "@/lib/fire/prediction-policy";
import {
  finalizeFireWrittenBonus,
  resolveFireWrittenBonus,
} from "@/lib/fire/written-bonus";
import {
  getPoliceApplicantCount,
  getPoliceRecruitCount,
} from "@/lib/police/prediction-policy";
import { resolvePoliceWrittenBonus } from "@/lib/police/written-bonus";
import {
  getPoliceScoredNonCutoffSql,
  hasPoliceWrittenBonusSubjectCutoff,
  hasPoliceWrittenCutoff,
} from "@/lib/police/written-policy";
import { prisma } from "@/lib/prisma";
import { canShowSamplePercentile } from "@/lib/public-sample-policy";
import { getEffectiveSiteSettings, isOperationFeatureEnabled } from "@/lib/exam-operation";
import {
  getTenantSubjectOrder,
  isExamTypeForTenant,
  TENANT_EXAM_TYPES,
} from "@/lib/tenant-exam";
import type { TenantType } from "@/lib/tenant";
import {
  isActiveExamRouteError,
  requireSoleActiveExam,
} from "@/lib/active-exam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MOCK_EXAM_NUMBER_PREFIX = "MOCK-";
const PREVIEW_PRIMARY_EXAM_TYPE = ExamType.PUBLIC;
const PREVIEW_PRIMARY_GENDER = Gender.MALE;

type CountRow = {
  totalCount: bigint | number | null;
  higherCount: bigint | number | null;
  lowerCount: bigint | number | null;
};

type SubjectAggregateRow = {
  subjectId: number;
  averageScore: unknown;
  highestScore: unknown;
  lowestScore: unknown;
  top10Average: unknown;
  top30Average: unknown;
};

type TotalAggregateRow = {
  averageScore: unknown;
  highestScore: unknown;
  lowestScore: unknown;
  top10Average: unknown;
  top30Average: unknown;
};

type LatestUpdatedRow = {
  latestAt: Date | string | null;
};

function toAnswerKey(subjectId: number, questionNumber: number): string {
  return `${subjectId}:${questionNumber}`;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function toCount(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function toNumeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (value && typeof value === "object") {
    const asNumber = Number(String(value));
    return Number.isFinite(asNumber) ? asNumber : 0;
  }
  if (typeof value === "string") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : 0;
  }
  return 0;
}

function calculateRankByHigher(higherCount: number): number {
  return higherCount + 1;
}

function calculateTopPercentByHigher(higherCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  return roundNumber(((higherCount + 1) / totalCount) * 100);
}

function calculatePercentileByLower(lowerCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  return roundNumber((lowerCount / totalCount) * 100);
}

function getPopulationConditionSql(params: {
  tenantType: TenantType;
  examType: ExamType;
  submissionHasCutoff: boolean;
}): Prisma.Sql {
  const { tenantType, examType, submissionHasCutoff } = params;
  if (submissionHasCutoff) {
    return Prisma.sql`
      AND s."isSuspicious" = false
      AND s."scoringStatus" = CAST(${SubmissionScoringStatus.SCORED} AS "SubmissionScoringStatus")
    `;
  }

  if (tenantType === "police") {
    return Prisma.sql`
      AND s."isSuspicious" = false
      ${getPoliceScoredNonCutoffSql(examType)}
    `;
  }

  return Prisma.sql`
    AND s."isSuspicious" = false
    AND s."scoringStatus" = CAST(${SubmissionScoringStatus.SCORED} AS "SubmissionScoringStatus")
    AND NOT EXISTS (
      SELECT 1
      FROM "SubjectScore" sf
      WHERE sf."submissionId" = s.id
        AND sf."isFailed" = true
    )
  `;
}

function getGenderConditionSql(params: {
  tenantType: TenantType;
  examType: ExamType;
  gender: "MALE" | "FEMALE";
  recruitAcademicCombined: number;
}): Prisma.Sql {
  const { tenantType, examType, gender, recruitAcademicCombined } = params;

  if (tenantType === "police") {
    return Prisma.empty;
  }

  if (examType === ExamType.CAREER_RESCUE) {
    return Prisma.sql`AND s."gender"::text = ${Gender.MALE}`;
  }

  if (examType === ExamType.CAREER_ACADEMIC) {
    // 양성(통합) 지역은 성별 분리 없이 동일 모집단
    if (recruitAcademicCombined > 0) {
      return Prisma.empty;
    }
    return Prisma.sql`AND s."gender"::text = ${gender}`;
  }

  // 공채, 구급: 성별 분리 모집단
  return Prisma.sql`AND s."gender"::text = ${gender}`;
}

export async function GET(request: NextRequest) {
  const tenantSession = await getCurrentTenantSessionContext();
  if (!tenantSession) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { session, tenantType } = tenantSession;

  const userId = Number(session.user.id);
  const isAdmin = ((session.user.role as Role | undefined) ?? Role.USER) === Role.ADMIN;
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const submissionId = parsePositiveInt(searchParams.get("submissionId"));
  const requestedExamId = parsePositiveInt(searchParams.get("examId"));
  const allowMissing = searchParams.get("optional") === "1";
  const isInputConsumer = searchParams.get("consumer") === "input";
  if (!(await isOperationFeatureEnabled("result"))) {
    if (allowMissing) return NextResponse.json({ submission: null, scores: [] });
    return NextResponse.json({ error: "성적 결과는 아직 공개되지 않았습니다." }, { status: 403 });
  }
  if (searchParams.get("submissionId") && !submissionId) {
    return NextResponse.json({ error: "submissionId가 올바르지 않습니다." }, { status: 400 });
  }
  if (searchParams.get("examId") && !requestedExamId) {
    return NextResponse.json({ error: "examId가 올바르지 않습니다." }, { status: 400 });
  }

  let activeExamId: number;
  try {
    const activeExam = await requireSoleActiveExam({
      db: prisma,
      tenantType,
      context: submissionId ? "api/result/explicit-read" : "api/result/default-read",
    });
    activeExamId = activeExam.id;
    if (requestedExamId && requestedExamId !== activeExam.id) {
      return NextResponse.json(
        { error: "현재 회차 결과는 활성 시험에서만 조회할 수 있습니다." },
        { status: 409 }
      );
    }
  } catch (error) {
    if (isActiveExamRouteError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  // 1차: submissionId 지정 시 해당 제출, 아니면 본인 제출 조회
  const submissionWhere: Prisma.SubmissionWhereInput = submissionId
    ? {
        id: submissionId,
        examId: activeExamId,
        examType: { in: [...TENANT_EXAM_TYPES[tenantType]] },
        ...(isAdmin ? {} : { userId }),
      }
    : {
        userId,
        examId: activeExamId,
        examType: { in: [...TENANT_EXAM_TYPES[tenantType]] },
      };

  const submissionDetailSelect = {
    id: true,
    userId: true,
    examId: true,
    examType: true,
    regionId: true,
    gender: true,
    examNumber: true,
    totalScore: true,
    finalScore: true,
    scoringStatus: true,
    isSuspicious: true,
    suspicionStatus: true,
    bonusType: true,
    bonusRate: true,
    certificateBonus: true,
    createdAt: true,
    editCount: true,
    exam: {
      select: {
        id: true,
        name: true,
        year: true,
        round: true,
        isActive: true,
      },
    },
    region: {
      select: {
        id: true,
        name: true,
      },
    },
    subjectScores: {
      select: {
        subjectId: true,
        rawScore: true,
        isFailed: true,
        subject: {
          select: {
            name: true,
            questionCount: true,
            maxScore: true,
            pointPerQuestion: true,
          },
        },
      },
    },
    userAnswers: {
      select: {
        subjectId: true,
        questionNumber: true,
        selectedAnswer: true,
        isCorrect: true,
      },
    },
    difficultyRatings: {
      select: {
        subjectId: true,
        rating: true,
      },
    },
  } as const;

  let submission = await prisma.submission.findFirst({
    where: submissionWhere,
    orderBy: submissionId ? undefined : [{ createdAt: "desc" }, { id: "desc" }],
    select: submissionDetailSelect,
  });

  // 2차: 관리자이고 본인 제출이 없으면, 활성 시험의 아무 제출로 대시보드 미리보기
  if (!submission && !submissionId && isAdmin && !isInputConsumer) {
    const activeExam = activeExamId ? { id: activeExamId } : null;

    const findMockPreviewSubmission = async (params: {
      examId?: number;
      preferPrimaryProfile: boolean;
      requireNonCutoff: boolean;
    }) =>
      prisma.submission.findFirst({
        where: {
          examNumber: { startsWith: MOCK_EXAM_NUMBER_PREFIX },
          examType: { in: [...TENANT_EXAM_TYPES[tenantType]] },
          isSuspicious: false,
          ...(params.examId ? { examId: params.examId } : {}),
          ...(params.preferPrimaryProfile
            ? { examType: PREVIEW_PRIMARY_EXAM_TYPE, gender: PREVIEW_PRIMARY_GENDER }
            : {}),
          ...(params.requireNonCutoff
            ? {
                subjectScores: {
                  some: {},
                  none: { isFailed: true },
                },
              }
            : {}),
        },
        orderBy: [{ finalScore: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: submissionDetailSelect,
      });

    const previewSearchOrder: Array<{
      examId?: number;
      preferPrimaryProfile: boolean;
      requireNonCutoff: boolean;
    }> = [
      ...(activeExam
        ? [
            { examId: activeExam.id, preferPrimaryProfile: true, requireNonCutoff: true },
            { examId: activeExam.id, preferPrimaryProfile: false, requireNonCutoff: true },
            { examId: activeExam.id, preferPrimaryProfile: true, requireNonCutoff: false },
            { examId: activeExam.id, preferPrimaryProfile: false, requireNonCutoff: false },
          ]
        : []),
    ];

    for (const condition of previewSearchOrder) {
      submission = await findMockPreviewSubmission(condition);
      if (submission) break;
    }

    if (!submission && activeExam) {
      submission = await prisma.submission.findFirst({
        where: {
          examId: activeExam.id,
          examType: { in: [...TENANT_EXAM_TYPES[tenantType]] },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: submissionDetailSelect,
      });
    }
  }

  if (!submission && allowMissing) {
    return NextResponse.json({
      submission: null,
      scores: [],
    });
  }

  if (!submission) {
    return NextResponse.json({ error: "조회할 성적 데이터가 없습니다." }, { status: 404 });
  }

  if (!isExamTypeForTenant(tenantType, submission.examType)) {
    return NextResponse.json({ error: "현재 서비스의 시험유형이 아닙니다." }, { status: 409 });
  }
  if (!isAdmin && !submission.exam.isActive) {
    return NextResponse.json(
      { error: "현재 활성 시험의 성적만 조회할 수 있습니다." },
      { status: 409 }
    );
  }

  const settings = await getEffectiveSiteSettings();
  const maxEditLimit = (settings["site.submissionEditLimit"] as number) ?? 3;
  const finalPredictionEnabled = Boolean(settings["site.finalPredictionEnabled"] ?? false);
  const analysisEnabled = Boolean(settings["site.tabPredictionEnabled"] ?? false);

  if (submission.scoringStatus === SubmissionScoringStatus.PENDING) {
    return NextResponse.json({
      features: {
        finalPredictionEnabled,
        analysisEnabled,
      },
      pending: {
        isPending: true,
        message: "답안 접수 완료. 가답안 발표 후 자동 채점됩니다.",
      },
      submission: {
        id: submission.id,
        isOwner: submission.userId === userId,
        examId: submission.examId,
        examName: submission.exam.name,
        examYear: submission.exam.year,
        examRound: submission.exam.round,
        examIsActive: submission.exam.isActive,
        examType: submission.examType,
        regionId: submission.region.id,
        regionName: submission.region.name,
        gender: submission.gender,
        examNumber: submission.examNumber,
        totalScore: Number(submission.totalScore),
        finalScore: Number(submission.finalScore),
        scoringStatus: submission.scoringStatus,
        isSuspicious: submission.isSuspicious,
        suspicionStatus: submission.suspicionStatus,
        rankingWithheld: submission.suspicionStatus !== SubmissionSuspicionStatus.CLEAR,
        bonusType: submission.bonusType,
        bonusRate: Number(submission.bonusRate),
        certificateBonus: Number(submission.certificateBonus),
        createdAt: submission.createdAt,
        editCount: submission.editCount,
        maxEditLimit,
      },
      scores: [],
      subjectCorrectRateSummaries: [],
      analysisSummary: {
        examType: submission.examType,
        subjects: [],
        total: {
          myScore: 0,
          maxScore: 0,
          myRank: 0,
          totalParticipants: 0,
          correctCount: 0,
          questionCount: 0,
          topPercent: 0,
          percentile: 0,
          averageScore: 0,
          highestScore: 0,
          lowestScore: 0,
          top10Average: 0,
          top30Average: 0,
        },
      },
      participantStatus: {
        currentRank: 0,
        totalParticipants: 0,
        topPercent: 0,
        percentile: 0,
        lastUpdated: new Date().toISOString(),
      },
      statistics: {
        totalParticipants: 0,
        totalRank: 0,
        topPercent: 0,
        totalPercentile: 0,
        hasCutoff: false,
        rankingBasis: "ALL_PARTICIPANTS",
        cutoffSubjects: [],
        bonusScore: 0,
      },
    });
  }

  const answerKeys = await prisma.answerKey.findMany({
    where: { examId: submission.examId },
    select: { subjectId: true, questionNumber: true, correctAnswer: true },
  });
  const correctRateRows = analysisEnabled
    ? await (tenantType === "police"
        ? policeCorrectRate.getCorrectRateRows
        : fireCorrectRate.getCorrectRateRows)(submission.examId, submission.examType)
    : [];
  const correctRateByKey = new Map(
    correctRateRows.map((row) => [
      toAnswerKey(row.subjectId, row.questionNumber),
      {
        correctRate: row.correctRate,
        difficultyLevel: row.difficultyLevel,
      },
    ] as const)
  );

  const totalRawMaxScore = submission.subjectScores.reduce(
    (sum, score) => sum + Number(score.subject.maxScore),
    0
  );
  const submissionHasCutoff = tenantType === "police"
    ? hasPoliceWrittenCutoff({
        examType: submission.examType,
        totalScore: Number(submission.totalScore),
        subjectScores: submission.subjectScores,
        maxScore: totalRawMaxScore,
      })
    : submission.subjectScores.some((score) => score.isFailed);
  const rankingWithheld = submission.suspicionStatus !== SubmissionSuspicionStatus.CLEAR;
  const rankingBasis = submissionHasCutoff ? "ALL_PARTICIPANTS" : "NON_CUTOFF_PARTICIPANTS";
  const populationConditionSql = getPopulationConditionSql({
    tenantType,
    examType: submission.examType,
    submissionHasCutoff,
  });
  const myFinalScore = Number(submission.finalScore);
  const quota = await prisma.examRegionQuota.findUnique({
    where: {
      examId_regionId: {
        examId: submission.examId,
        regionId: submission.regionId,
      },
    },
    select: {
      recruitCount: true,
      recruitCountCareer: true,
      applicantCount: true,
      applicantCountCareer: true,
      recruitPublicMale: true,
      recruitPublicFemale: true,
      recruitRescue: true,
      recruitAcademicMale: true,
      recruitAcademicFemale: true,
      recruitAcademicCombined: true,
      recruitEmtMale: true,
      recruitEmtFemale: true,
    },
  });
  const policeBonusApplication = tenantType === "police" && quota
    ? resolvePoliceWrittenBonus({
        bonusType: submission.bonusType,
        declaredRate: Number(submission.bonusRate),
        recruitCount: getPoliceRecruitCount(quota, submission.examType),
        applicantCount: getPoliceApplicantCount(quota, submission.examType),
        hasSubjectCutoff: hasPoliceWrittenBonusSubjectCutoff(
          submission.subjectScores.map((score) => ({
            rawScore: Number(score.rawScore),
            maxScore: Number(score.subject.maxScore),
          }))
        ),
      })
    : null;
  const fireBonusEligibility = tenantType === "fire" && quota
    ? resolveFireWrittenBonus({
        bonusType: submission.bonusType,
        declaredRate: Number(submission.bonusRate),
        recruitCount: getFireRecruitCount(quota, submission.examType, submission.gender),
      })
    : null;
  const effectiveBonusRate = policeBonusApplication?.effectiveRate
    ?? fireBonusEligibility?.effectiveRate
    ?? Number(submission.bonusRate);
  const genderConditionSql = getGenderConditionSql({
    tenantType,
    examType: submission.examType,
    gender: submission.gender,
    recruitAcademicCombined: quota?.recruitAcademicCombined ?? 0,
  });

  const [overallRow] = analysisEnabled
    ? await prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS "totalCount",
          SUM(CASE WHEN s."finalScore" > ${myFinalScore} THEN 1 ELSE 0 END) AS "higherCount",
          SUM(CASE WHEN s."finalScore" < ${myFinalScore} THEN 1 ELSE 0 END) AS "lowerCount"
        FROM "Submission" s
        WHERE s."examId" = ${submission.examId}
          AND s."regionId" = ${submission.regionId}
          AND s."examType"::text = ${submission.examType}
          ${genderConditionSql}
          ${populationConditionSql}
      `)
    : [{ totalCount: 0, higherCount: 0, lowerCount: 0 }];

  const totalParticipants = toCount(overallRow?.totalCount);
  if (analysisEnabled && totalParticipants < 1 && !rankingWithheld) {
    return NextResponse.json({ error: "성적 비교 대상이 없습니다." }, { status: 404 });
  }

  const totalHigherCount = toCount(overallRow?.higherCount);
  const totalLowerCount = toCount(overallRow?.lowerCount);
  const totalRank = rankingWithheld || !analysisEnabled ? null : calculateRankByHigher(totalHigherCount);
  const totalTopPercent = rankingWithheld || !analysisEnabled
    ? null
    : calculateTopPercentByHigher(totalHigherCount, totalParticipants);
  const totalPercentile = rankingWithheld || !analysisEnabled
    ? null
    : calculatePercentileByLower(totalLowerCount, totalParticipants);

  const subjectOrder = getTenantSubjectOrder(tenantType, submission.examType);
  const orderedSubjectScores = [...submission.subjectScores].sort((a, b) => {
    const aIndex = subjectOrder.indexOf(a.subject.name);
    const bIndex = subjectOrder.indexOf(b.subject.name);
    const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (safeA !== safeB) return safeA - safeB;
    return a.subjectId - b.subjectId;
  });

  // 과목별 순위/백분위를 단일 GROUP BY 쿼리로 일괄 조회 (N+1 방지)
  type SubjectCountRow = {
    subjectId: number;
    totalCount: bigint | number | null;
    higherCount: bigint | number | null;
    lowerCount: bigint | number | null;
  };

  const subjectIds = orderedSubjectScores.map((s) => s.subjectId);

  const scoreConditions = orderedSubjectScores.map(
    (s) => Prisma.sql`WHEN ss."subjectId" = ${s.subjectId} THEN ${Number(s.rawScore)}`
  );
  const myScoreSql = Prisma.sql`CASE ${Prisma.join(scoreConditions, " ")} ELSE 0 END`;

  const subjectRows =
    analysisEnabled && subjectIds.length > 0
      ? await prisma.$queryRaw<SubjectCountRow[]>(Prisma.sql`
          SELECT
            ss."subjectId",
            COUNT(*) AS "totalCount",
            SUM(CASE WHEN ss."rawScore" > (${myScoreSql}) THEN 1 ELSE 0 END) AS "higherCount",
            SUM(CASE WHEN ss."rawScore" < (${myScoreSql}) THEN 1 ELSE 0 END) AS "lowerCount"
          FROM "Submission" s
          INNER JOIN "SubjectScore" ss
            ON ss."submissionId" = s.id
           AND ss."subjectId" IN (${Prisma.join(subjectIds)})
          WHERE s."examId" = ${submission.examId}
            AND s."regionId" = ${submission.regionId}
            AND s."examType"::text = ${submission.examType}
            ${genderConditionSql}
            ${populationConditionSql}
          GROUP BY ss."subjectId"
        `)
      : [];

  const subjectStatsMap = new Map(
    subjectRows.map((row) => [
      row.subjectId,
      {
        totalCount: toCount(row.totalCount),
        higherCount: toCount(row.higherCount),
        lowerCount: toCount(row.lowerCount),
      },
    ])
  );

  const subjectAggregateRows =
    analysisEnabled && subjectIds.length > 0
      ? await prisma.$queryRaw<SubjectAggregateRow[]>(Prisma.sql`
          WITH ranked_subject AS (
            SELECT
              ss."subjectId" AS "subjectId",
              ss."rawScore" AS "rawScore",
              ROW_NUMBER() OVER (PARTITION BY ss."subjectId" ORDER BY ss."rawScore" DESC, s.id ASC) AS "rn",
              COUNT(*) OVER (PARTITION BY ss."subjectId") AS "cnt"
            FROM "Submission" s
            INNER JOIN "SubjectScore" ss
              ON ss."submissionId" = s.id
             AND ss."subjectId" IN (${Prisma.join(subjectIds)})
            WHERE s."examId" = ${submission.examId}
              AND s."regionId" = ${submission.regionId}
              AND s."examType"::text = ${submission.examType}
              ${genderConditionSql}
              ${populationConditionSql}
          )
          SELECT
            "subjectId",
            ROUND(AVG("rawScore")::numeric, 2) AS "averageScore",
            MAX("rawScore") AS "highestScore",
            MIN("rawScore") AS "lowestScore",
            ROUND(AVG(CASE WHEN "rn" <= GREATEST(1, FLOOR("cnt" * 0.1)) THEN "rawScore" END)::numeric, 2) AS "top10Average",
            ROUND(AVG(CASE WHEN "rn" <= GREATEST(1, FLOOR("cnt" * 0.3)) THEN "rawScore" END)::numeric, 2) AS "top30Average"
          FROM ranked_subject
          GROUP BY "subjectId"
        `)
      : [];

  const subjectAggregateMap = new Map(
    subjectAggregateRows.map((row) => [
      row.subjectId,
      {
        averageScore: roundNumber(toNumeric(row.averageScore)),
        highestScore: roundNumber(toNumeric(row.highestScore)),
        lowestScore: roundNumber(toNumeric(row.lowestScore)),
        top10Average: roundNumber(toNumeric(row.top10Average)),
        top30Average: roundNumber(toNumeric(row.top30Average)),
      },
    ])
  );

  const [totalAggregateRow] = analysisEnabled
    ? await prisma.$queryRaw<TotalAggregateRow[]>(Prisma.sql`
        WITH ranked_total AS (
          SELECT
            s."finalScore" AS "finalScore",
            ROW_NUMBER() OVER (ORDER BY s."finalScore" DESC, s.id ASC) AS "rn",
            COUNT(*) OVER () AS "cnt"
          FROM "Submission" s
          WHERE s."examId" = ${submission.examId}
            AND s."regionId" = ${submission.regionId}
            AND s."examType"::text = ${submission.examType}
            ${genderConditionSql}
            ${populationConditionSql}
        )
        SELECT
          ROUND(AVG("finalScore")::numeric, 2) AS "averageScore",
          MAX("finalScore") AS "highestScore",
          MIN("finalScore") AS "lowestScore",
          ROUND(AVG(CASE WHEN "rn" <= GREATEST(1, FLOOR("cnt" * 0.1)) THEN "finalScore" END)::numeric, 2) AS "top10Average",
          ROUND(AVG(CASE WHEN "rn" <= GREATEST(1, FLOOR("cnt" * 0.3)) THEN "finalScore" END)::numeric, 2) AS "top30Average"
        FROM ranked_total
      `)
    : [];

  const [latestUpdatedRow] = analysisEnabled
    ? await prisma.$queryRaw<LatestUpdatedRow[]>(Prisma.sql`
        SELECT MAX(s."updatedAt") AS "latestAt"
        FROM "Submission" s
        WHERE s."examId" = ${submission.examId}
          AND s."regionId" = ${submission.regionId}
          AND s."examType"::text = ${submission.examType}
          ${genderConditionSql}
          ${populationConditionSql}
      `)
    : [];

  const answerKeyMap = new Map<string, number>();
  for (const k of answerKeys) {
    answerKeyMap.set(toAnswerKey(k.subjectId, k.questionNumber), k.correctAnswer);
  }

  const scores = orderedSubjectScores.map((mySubjectScore) => {
    const rawScore = Number(mySubjectScore.rawScore);
    const maxScore = Number(mySubjectScore.subject.maxScore);
    const pointPerQuestion = Number(mySubjectScore.subject.pointPerQuestion);
    const bonusScore = tenantType === "police"
      ? roundNumber(maxScore * effectiveBonusRate)
      : mySubjectScore.isFailed
        ? 0
        : roundNumber(maxScore * effectiveBonusRate);
    const finalScore = roundNumber(rawScore + bonusScore);

    const stats = subjectStatsMap.get(mySubjectScore.subjectId);
    const subjectParticipants = stats?.totalCount ?? 0;
    const subjectHigher = stats?.higherCount ?? 0;
    const subjectLower = stats?.lowerCount ?? 0;

    const difficulty =
      submission.difficultyRatings.find(
        (rating) => rating.subjectId === mySubjectScore.subjectId
      )?.rating ?? null;

    const userAnswers = submission.userAnswers
      .filter((ua) => ua.subjectId === mySubjectScore.subjectId)
      .map((ua) => {
        const correctRateInfo = correctRateByKey.get(toAnswerKey(ua.subjectId, ua.questionNumber));
        return {
          questionNumber: ua.questionNumber,
          selectedAnswer: ua.selectedAnswer,
          isCorrect: ua.isCorrect,
          correctAnswer: answerKeyMap.get(toAnswerKey(ua.subjectId, ua.questionNumber)) ?? null,
          correctRate: correctRateInfo?.correctRate ?? 0,
          difficultyLevel: correctRateInfo?.difficultyLevel ?? "NORMAL",
        };
      })
      .sort((a, b) => a.questionNumber - b.questionNumber);

    return {
      subjectId: mySubjectScore.subjectId,
      subjectName: mySubjectScore.subject.name,
      questionCount: mySubjectScore.subject.questionCount,
      pointPerQuestion,
      correctCount: Math.round(rawScore / pointPerQuestion),
      rawScore,
      maxScore,
      bonusScore,
      finalScore,
      isCutoff:
        tenantType === "police" && submission.examType === ExamType.CAREER
          ? false
          : mySubjectScore.isFailed,
      cutoffScore: roundNumber(
        maxScore *
          (tenantType === "police"
            ? policePolicy.SUBJECT_CUTOFF_RATE
            : firePolicy.SUBJECT_CUTOFF_RATE)
      ),
      rank: rankingWithheld || !analysisEnabled ? null : calculateRankByHigher(subjectHigher),
      topPercent: rankingWithheld || !analysisEnabled
        ? null
        : calculateTopPercentByHigher(subjectHigher, subjectParticipants),
      percentile: rankingWithheld || !analysisEnabled
        ? null
        : calculatePercentileByLower(subjectLower, subjectParticipants),
      totalParticipants: subjectParticipants,
      difficulty,
      answers: userAnswers,
    };
  });

  const calculatedBonusScore = roundNumber(
    scores.reduce((sum, score) => sum + score.bonusScore, 0)
  );
  const bonusApplication = fireBonusEligibility
    ? finalizeFireWrittenBonus(fireBonusEligibility, calculatedBonusScore)
    : policeBonusApplication;

  const subjectCorrectRateSummaries = analysisEnabled ? scores.map((score) => {
    const rows = correctRateRows.filter((row) => row.subjectId === score.subjectId);
    const averageCorrectRate =
      rows.length > 0
        ? roundNumber(rows.reduce((sum, row) => sum + row.correctRate, 0) / rows.length)
        : null;

    const hardest = rows.reduce(
      (current, row) => {
        if (!current || row.correctRate < current.correctRate) {
          return row;
        }
        return current;
      },
      null as (typeof rows)[number] | null
    );

    const easiest = rows.reduce(
      (current, row) => {
        if (!current || row.correctRate > current.correctRate) {
          return row;
        }
        return current;
      },
      null as (typeof rows)[number] | null
    );

    return {
      subjectId: score.subjectId,
      subjectName: score.subjectName,
      averageCorrectRate,
      hardestQuestion: hardest?.questionNumber ?? null,
      hardestRate: hardest?.correctRate ?? null,
      easiestQuestion: easiest?.questionNumber ?? null,
      easiestRate: easiest?.correctRate ?? null,
      myCorrectOnHard: score.answers.filter(
        (answer) => answer.difficultyLevel === "VERY_HARD" && answer.isCorrect
      ).length,
      myWrongOnEasy: score.answers.filter(
        (answer) => answer.difficultyLevel === "EASY" && !answer.isCorrect
      ).length,
    };
  }) : [];

  const hasCutoff = submissionHasCutoff;
  const cutoffSubjects = scores
    .filter((score) => score.isCutoff)
    .map((score) => ({
      subjectName: score.subjectName,
      rawScore: score.rawScore,
      maxScore: score.maxScore,
      cutoffScore: score.cutoffScore,
    }));

  const totalAggregate = {
    averageScore: roundNumber(toNumeric(totalAggregateRow?.averageScore)),
    highestScore: roundNumber(toNumeric(totalAggregateRow?.highestScore)),
    lowestScore: roundNumber(toNumeric(totalAggregateRow?.lowestScore)),
    top10Average: roundNumber(toNumeric(totalAggregateRow?.top10Average)),
    top30Average: roundNumber(toNumeric(totalAggregateRow?.top30Average)),
  };

  const lastUpdated =
    latestUpdatedRow?.latestAt === null || latestUpdatedRow?.latestAt === undefined
      ? new Date().toISOString()
      : new Date(latestUpdatedRow.latestAt).toISOString();

  const totalMaxScore = roundNumber(
    orderedSubjectScores.reduce((sum, score) => sum + Number(score.subject.maxScore), 0)
  );

  const analysisSummary = {
    examType: submission.examType,
    subjects: scores.map((score) => {
      const aggregate = subjectAggregateMap.get(score.subjectId);
      return {
        subjectId: score.subjectId,
        subjectName: score.subjectName,
        myScore: score.rawScore,
        maxScore: score.maxScore,
        myRank: score.rank,
        totalParticipants: score.totalParticipants,
        correctCount: score.correctCount,
        questionCount: score.questionCount,
        topPercent: score.topPercent,
        percentile: score.percentile,
        percentileAvailable:
          analysisEnabled && !rankingWithheld && canShowSamplePercentile(score.totalParticipants),
        averageScore: aggregate?.averageScore ?? 0,
        highestScore: aggregate?.highestScore ?? 0,
        lowestScore: aggregate?.lowestScore ?? 0,
        top10Average: aggregate?.top10Average ?? 0,
        top30Average: aggregate?.top30Average ?? 0,
      };
    }),
    total: {
      myScore: roundNumber(myFinalScore),
      maxScore: totalMaxScore,
      myRank: totalRank,
      totalParticipants,
      correctCount: scores.reduce((sum, s) => sum + s.correctCount, 0),
      questionCount: scores.reduce((sum, s) => sum + s.questionCount, 0),
      topPercent: totalTopPercent,
      percentile: totalPercentile,
      percentileAvailable:
        analysisEnabled && !rankingWithheld && canShowSamplePercentile(totalParticipants),
      averageScore: totalAggregate.averageScore,
      highestScore: totalAggregate.highestScore,
      lowestScore: totalAggregate.lowestScore,
      top10Average: totalAggregate.top10Average,
      top30Average: totalAggregate.top30Average,
    },
  };

  const participantStatus = {
    currentRank: totalRank,
    totalParticipants,
    topPercent: totalTopPercent,
    percentile: totalPercentile,
    percentileAvailable:
      analysisEnabled && !rankingWithheld && canShowSamplePercentile(totalParticipants),
    lastUpdated,
  };

  return NextResponse.json({
    features: {
      finalPredictionEnabled,
      analysisEnabled,
    },
    submission: {
      id: submission.id,
      isOwner: submission.userId === userId,
      examId: submission.examId,
      examName: submission.exam.name,
      examYear: submission.exam.year,
      examRound: submission.exam.round,
      examIsActive: submission.exam.isActive,
      examType: submission.examType,
      regionId: submission.region.id,
      regionName: submission.region.name,
      gender: submission.gender,
      examNumber: submission.examNumber,
      totalScore: Number(submission.totalScore),
      finalScore: Number(submission.finalScore),
      scoringStatus: submission.scoringStatus,
      isSuspicious: submission.isSuspicious,
      suspicionStatus: submission.suspicionStatus,
      rankingWithheld,
      bonusType: submission.bonusType,
      bonusRate: Number(submission.bonusRate),
      certificateBonus: Number(submission.certificateBonus),
      createdAt: submission.createdAt,
      editCount: submission.editCount,
      maxEditLimit,
    },
    scores,
    subjectCorrectRateSummaries,
    analysisSummary,
    participantStatus,
    bonusApplication,
    statistics: {
      totalParticipants,
      totalRank,
      topPercent: totalTopPercent,
      totalPercentile,
      percentileAvailable:
        analysisEnabled && !rankingWithheld && canShowSamplePercentile(totalParticipants),
      hasCutoff,
      rankingBasis,
      cutoffSubjects,
      bonusScore: calculatedBonusScore,
    },
  });
}

