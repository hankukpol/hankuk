import { ExamType, Gender, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getDifficultyStats } from "@/lib/difficulty";
import * as firePolicy from "@/lib/fire/policy";
import { buildFirePredictionBands } from "@/lib/fire/prediction-model";
import * as policePolicy from "@/lib/police/policy";
import { buildPolicePredictionBands } from "@/lib/police/prediction-model";
import { getPassMultiple as getPoliceConfiguredPassMultiple } from "@/lib/police/prediction";
import {
  getTenantApplicantCount,
  getTenantPassMultiple,
  getTenantRecruitmentCohorts,
  type TenantRecruitmentCohort,
} from "@/lib/tenant-calculations.server";
import { prisma } from "@/lib/prisma";
import { getActiveNotices, getSiteSettings } from "@/lib/site-settings";
import { requireTenantSessionRoute } from "@/lib/tenant-session.server";
import type { TenantType } from "@/lib/tenant";

export const runtime = "nodejs";

interface QuotaRow {
  regionId: number;
  regionName: string;
  recruitCount: number;
  recruitCountCareer: number;
  applicantCount: number | null;
  applicantCountCareer: number | null;
  recruitPublicMale: number;
  recruitPublicFemale: number;
  recruitRescue: number;
  recruitAcademicMale: number;
  recruitAcademicFemale: number;
  recruitAcademicCombined: number;
  recruitEmtMale: number;
  recruitEmtFemale: number;
  applicantPublicMale: number | null;
  applicantPublicFemale: number | null;
  applicantRescue: number | null;
  applicantAcademicMale: number | null;
  applicantAcademicFemale: number | null;
  applicantAcademicCombined: number | null;
  applicantEmtMale: number | null;
  applicantEmtFemale: number | null;
}

interface MainStatsRow {
  regionId: number;
  regionName: string;
  examType: ExamType;
  gender: Gender | null; // 구조경채: null, 나머지: MALE | FEMALE
  examTypeLabel: string;
  recruitCount: number;
  applicantCount: number | null;
  estimatedApplicants: number;
  isApplicantCountExact: boolean;
  competitionRate: number | null;
  participantCount: number;
  averageFinalScore: number | null;
  oneMultipleCutScore: number | null;
  oneMultipleBaseRank: number;
  oneMultipleActualRank: number | null;
  oneMultipleTieCount: number | null;
  possibleRange: { min: number | null; max: number | null };
  likelyRange: { min: number | null; max: number | null };
  sureMinScore: number | null;
}

type ScoreDistributionKey = string;

interface ScoreDistributionConfig {
  key: ScoreDistributionKey;
  label: string;
  maxScore: number;
  step: number;
  failThreshold: number | null;
  subjectName: string | null;
  subjectId: number | null;
}

interface ScoreDistributionBucket {
  key: string;
  label: string;
  min: number;
  max: number;
  count: number;
  isFailRange: boolean;
  isMine: boolean;
}

interface ScoreDistributionItem {
  key: ScoreDistributionKey;
  label: string;
  maxScore: number;
  failThreshold: number | null;
  myScore: number | null;
  isFail: boolean | null;
  buckets: ScoreDistributionBucket[];
}

interface UserScoreSnapshot {
  totalScore: number;
  hasAnyFail: boolean;
  subjectScoresByName: Map<string, { score: number; isFail: boolean }>;
}

interface MainSectionVisibility {
  overview: boolean;
  difficulty: boolean;
  competitive: boolean;
  scoreDistribution: boolean;
}

function toSafePositiveInt(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallbackValue;
  return Math.floor(parsed);
}

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function examTypeLabel(tenantType: TenantType, examType: ExamType, gender: Gender | null): string {
  if (tenantType === "police") {
    return examType === ExamType.CAREER ? "경행경채" : "공채";
  }

  const genderSuffix = gender === Gender.MALE ? "(남)" : gender === Gender.FEMALE ? "(여)" : "";
  if (examType === ExamType.CAREER_RESCUE) return "구조";
  if (examType === ExamType.CAREER_ACADEMIC) {
    return gender === null ? "소방학과(통합)" : `소방학과${genderSuffix}`;
  }
  if (examType === ExamType.CAREER_EMT) return `구급${genderSuffix}`;
  return `공채${genderSuffix}`;
}

function getScoreDistributionConfig(
  tenantType: TenantType,
  examType: ExamType,
  subjects: Array<{ id: number; name: string; examType: ExamType; maxScore: number }>
): ScoreDistributionConfig[] {
  const examSubjects = subjects
    .filter((subject) => subject.examType === examType)
    .sort((a, b) => a.id - b.id);
  const totalMaxScore = examSubjects.reduce((sum, subject) => sum + Number(subject.maxScore), 0);
  const totalStep = tenantType === "fire" && examType !== ExamType.PUBLIC ? 40 : 50;

  return [
    {
      key: "TOTAL",
      label: "총점",
      maxScore: totalMaxScore,
      step: totalStep,
      failThreshold: null,
      subjectName: null,
      subjectId: null,
    },
    ...examSubjects.map((subject) => ({
      key: `SUBJECT:${subject.id}`,
      label: subject.name,
      maxScore: Number(subject.maxScore),
      step: 10,
      failThreshold: Number(subject.maxScore) * 0.4,
      subjectName: subject.name,
      subjectId: subject.id,
    })),
  ].filter((item) => item.maxScore > 0);
}

function getDistributionBucketCount(maxScore: number, step: number): number {
  return Math.floor(maxScore / step) + 1;
}

function getDistributionBucketIndex(score: number, maxScore: number, step: number): number {
  const bucketCount = getDistributionBucketCount(maxScore, step);
  const lastIndex = Math.max(0, bucketCount - 1);
  const safeScore = Math.min(maxScore, Math.max(0, score));
  if (safeScore >= maxScore) {
    return lastIndex;
  }
  return Math.max(0, Math.min(lastIndex, Math.floor(safeScore / step)));
}

function buildDistributionBuckets(
  maxScore: number,
  step: number,
  failThreshold: number | null,
  countsByBucket: Map<number, number>,
  myScore: number | null
): ScoreDistributionBucket[] {
  const bucketCount = getDistributionBucketCount(maxScore, step);
  const myBucketIndex =
    myScore === null ? null : getDistributionBucketIndex(myScore, maxScore, step);

  return Array.from({ length: bucketCount }, (_, index) => {
    const isLast = index === bucketCount - 1;
    const min = isLast ? maxScore : index * step;
    const max = isLast ? maxScore : index * step + step - 1;
    const label = min === max ? `${min}점` : `${min}~${max}점`;

    return {
      key: `${min}-${max}`,
      label,
      min,
      max,
      count: countsByBucket.get(index) ?? 0,
      isFailRange: failThreshold !== null && max < failThreshold,
      isMine: myBucketIndex === index,
    };
  });
}

function buildScoreDistributions(params: {
  tenantType: TenantType;
  enabledExamTypes: ExamType[];
  subjects: Array<{ id: number; name: string; examType: ExamType; maxScore: number }>;
  totalScoreRows: Array<{ examType: ExamType; totalScore: number; count: number }>;
  subjectScoreRows: Array<{ subjectId: number; rawScore: number; count: number }>;
  myScoresByExamType: Map<ExamType, UserScoreSnapshot>;
}): Partial<Record<ExamType, ScoreDistributionItem[]>> {
  const result: Partial<Record<ExamType, ScoreDistributionItem[]>> = {};

  const subjectScoreRowsBySubjectId = new Map<number, Array<{ rawScore: number; count: number }>>();
  for (const row of params.subjectScoreRows) {
    const current = subjectScoreRowsBySubjectId.get(row.subjectId) ?? [];
    current.push({ rawScore: row.rawScore, count: row.count });
    subjectScoreRowsBySubjectId.set(row.subjectId, current);
  }

  const totalCountsByExamType = new Map<ExamType, Map<number, number>>();
  for (const row of params.totalScoreRows) {
    const totalConfig = getScoreDistributionConfig(
      params.tenantType,
      row.examType,
      params.subjects
    ).find((item) => item.key === "TOTAL");
    if (!totalConfig) continue;
    const totalMaxScore = totalConfig.maxScore;
    const totalStep = totalConfig.step;
    const bucketIndex = getDistributionBucketIndex(row.totalScore, totalMaxScore, totalStep);
    const byBucket = totalCountsByExamType.get(row.examType) ?? new Map<number, number>();
    byBucket.set(bucketIndex, (byBucket.get(bucketIndex) ?? 0) + row.count);
    totalCountsByExamType.set(row.examType, byBucket);
  }

  for (const examType of params.enabledExamTypes) {
    const config = getScoreDistributionConfig(params.tenantType, examType, params.subjects);
    const mySnapshot = params.myScoresByExamType.get(examType);

    result[examType] = config.map((item) => {
      const countsByBucket = new Map<number, number>();
      let myScore: number | null = null;
      let isFail: boolean | null = null;

      if (item.key === "TOTAL") {
        const totalCounts = totalCountsByExamType.get(examType);
        if (totalCounts) {
          for (const [bucket, count] of totalCounts.entries()) {
            countsByBucket.set(bucket, count);
          }
        }

        myScore = mySnapshot ? roundNumber(mySnapshot.totalScore) : null;
        isFail = mySnapshot ? mySnapshot.hasAnyFail : null;
      } else if (item.subjectName && item.subjectId !== null) {
        if (item.subjectId) {
          const rows = subjectScoreRowsBySubjectId.get(item.subjectId) ?? [];
          for (const row of rows) {
            const bucket = getDistributionBucketIndex(row.rawScore, item.maxScore, item.step);
            countsByBucket.set(bucket, (countsByBucket.get(bucket) ?? 0) + row.count);
          }
        }

        const mySubjectScore = mySnapshot?.subjectScoresByName.get(item.subjectName);
        myScore = mySubjectScore ? roundNumber(mySubjectScore.score) : null;
        isFail = mySubjectScore ? mySubjectScore.isFail : null;
      }

      return {
        key: item.key,
        label: item.label,
        maxScore: item.maxScore,
        failThreshold: item.failThreshold,
        myScore,
        isFail,
        buckets: buildDistributionBuckets(
          item.maxScore,
          item.step,
          item.failThreshold,
          countsByBucket,
          myScore
        ),
      };
    });
  }

  return result;
}

function getScoreAtRank(
  scoreBands: Array<{ score: number; count: number }>,
  rank: number
): number | null {
  if (!Number.isInteger(rank) || rank < 1) {
    return null;
  }

  let covered = 0;
  for (const band of scoreBands) {
    covered += band.count;
    if (covered >= rank) {
      return roundNumber(band.score);
    }
  }

  return null;
}

function getScoreBandInfoAtRank(
  scoreBands: Array<{ score: number; count: number }>,
  rank: number
): { score: number; startRank: number; endRank: number; count: number } | null {
  if (!Number.isInteger(rank) || rank < 1) {
    return null;
  }

  let covered = 0;
  let lastBandInfo: { score: number; startRank: number; endRank: number; count: number } | null = null;
  for (const band of scoreBands) {
    const startRank = covered + 1;
    const endRank = covered + band.count;
    lastBandInfo = {
      score: roundNumber(band.score),
      startRank,
      endRank,
      count: band.count,
    };
    if (startRank <= rank && endRank >= rank) {
      return lastBandInfo;
    }
    covered = endRank;
  }

  return lastBandInfo;
}

function getScoreRange(
  scoreBands: Array<{ score: number; count: number }>,
  startRank: number,
  endRank: number
): { min: number | null; max: number | null } {
  if (!Number.isInteger(startRank) || !Number.isInteger(endRank) || startRank > endRank || startRank < 1) {
    return { min: null, max: null };
  }

  const max = getScoreAtRank(scoreBands, startRank);
  const min = getScoreAtRank(scoreBands, endRank);

  return {
    min,
    max,
  };
}

async function getQuotasForExam(examId: number): Promise<QuotaRow[]> {
  try {
    return await prisma.$queryRaw<QuotaRow[]>`
      SELECT
        q."regionId",
        r."name" AS "regionName",
        q."recruitCount",
        q."recruitCountCareer",
        q."applicantCount",
        q."applicantCountCareer",
        q."recruitPublicMale",
        q."recruitPublicFemale",
        q."recruitRescue",
        q."recruitAcademicMale",
        q."recruitAcademicFemale",
        q."recruitAcademicCombined",
        q."recruitEmtMale",
        q."recruitEmtFemale",
        q."applicantPublicMale",
        q."applicantPublicFemale",
        q."applicantRescue",
        q."applicantAcademicMale",
        q."applicantAcademicFemale",
        q."applicantAcademicCombined",
        q."applicantEmtMale",
        q."applicantEmtFemale"
      FROM "exam_region_quotas" q
      JOIN "Region" r ON r.id = q."regionId"
      WHERE q."examId" = ${examId}
        AND r."isActive" = true
      ORDER BY r."name" ASC
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("isActive")) {
      throw error;
    }

    // isActive 컬럼이 없는 경우 폴백
    return await prisma.$queryRaw<QuotaRow[]>`
      SELECT
        q."regionId",
        r."name" AS "regionName",
        q."recruitCount",
        q."recruitCountCareer",
        q."applicantCount",
        q."applicantCountCareer",
        q."recruitPublicMale",
        q."recruitPublicFemale",
        q."recruitRescue",
        q."recruitAcademicMale",
        q."recruitAcademicFemale",
        q."recruitAcademicCombined",
        q."recruitEmtMale",
        q."recruitEmtFemale",
        q."applicantPublicMale",
        q."applicantPublicFemale",
        q."applicantRescue",
        q."applicantAcademicMale",
        q."applicantAcademicFemale",
        q."applicantAcademicCombined",
        q."applicantEmtMale",
        q."applicantEmtFemale"
      FROM "exam_region_quotas" q
      JOIN "Region" r ON r.id = q."regionId"
      WHERE q."examId" = ${examId}
      ORDER BY r."name" ASC
    `;
  }
}

export async function GET() {
  const tenantSession = await requireTenantSessionRoute();
  if ("error" in tenantSession) return tenantSession.error;
  const { session, tenantType } = tenantSession;
  const userId = Number(session.user.id);

  try {
    const activeExam = await prisma.exam.findFirst({
      where: { isActive: true },
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        year: true,
        round: true,
        policeWrittenPassMultiple: true,
      },
    });

    const [notices, settings] = await Promise.all([getActiveNotices(), getSiteSettings()]);
    const careerExamEnabled = Boolean(settings["site.careerExamEnabled"] ?? true);
    const sectionVisibility: MainSectionVisibility = {
      overview: Boolean(settings["site.mainCardOverviewEnabled"] ?? true),
      difficulty: Boolean(settings["site.mainCardDifficultyEnabled"] ?? true),
      competitive: Boolean(settings["site.mainCardCompetitiveEnabled"] ?? true),
      scoreDistribution: Boolean(settings["site.mainCardScoreDistributionEnabled"] ?? true),
    };
    const enabledExamTypes: ExamType[] =
      tenantType === "police"
        ? careerExamEnabled
          ? [ExamType.PUBLIC, ExamType.CAREER]
          : [ExamType.PUBLIC]
        : careerExamEnabled
          ? [ExamType.PUBLIC, ExamType.CAREER_RESCUE, ExamType.CAREER_ACADEMIC, ExamType.CAREER_EMT]
          : [ExamType.PUBLIC];
    const examTypes = enabledExamTypes.map((examType) => ({
      key: examType,
      label: examTypeLabel(tenantType, examType, null),
      requiresGender:
        tenantType === "fire" && examType !== ExamType.CAREER_RESCUE,
    }));
    const refreshInterval = toSafePositiveInt(settings["site.mainPageRefreshInterval"], 60);

    if (!activeExam) {
      return NextResponse.json({
        tenantType,
        examTypes,
        updatedAt: new Date().toISOString(),
        careerExamEnabled,
        liveStats: null,
        sectionVisibility,
        notices,
        difficulty: null,
        rows: [],
        topCompetitive: [],
        leastCompetitive: [],
        scoreDistributions: Object.fromEntries(
          enabledExamTypes.map((examType) => [examType, []])
        ),
        refresh: {
          enabled: Boolean(settings["site.mainPageAutoRefresh"]),
          intervalSec: refreshInterval,
        },
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const validSubmissionScope: Prisma.SubmissionWhereInput =
      tenantType === "fire"
        ? {
            NOT: {
              examType: ExamType.CAREER_RESCUE,
              gender: Gender.FEMALE,
            },
          }
        : {};

    const [totalParticipants, examTypeStats, recentParticipants, latestSubmission, difficulty, quotas, mySubmissions] =
      await Promise.all([
        prisma.submission.count({
          where: {
            examId: activeExam.id,
            examType: { in: enabledExamTypes },
            ...validSubmissionScope,
          },
        }),
        prisma.submission.groupBy({
          by: ["examType"],
          where: {
            examId: activeExam.id,
            examType: { in: enabledExamTypes },
            ...validSubmissionScope,
          },
          _count: {
            _all: true,
          },
        }),
        prisma.submission.count({
          where: {
            examId: activeExam.id,
            examType: { in: enabledExamTypes },
            ...validSubmissionScope,
            createdAt: { gte: oneHourAgo },
          },
        }),
        prisma.submission.findFirst({
          where: {
            examId: activeExam.id,
            examType: { in: enabledExamTypes },
            ...validSubmissionScope,
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        getDifficultyStats(activeExam.id, enabledExamTypes),
        getQuotasForExam(activeExam.id),
        Number.isInteger(userId) && userId > 0
          ? prisma.submission.findMany({
              where: {
                examId: activeExam.id,
                userId,
                examType: { in: enabledExamTypes },
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: {
                examType: true,
                totalScore: true,
                subjectScores: {
                  select: {
                    isFailed: true,
                    rawScore: true,
                    subject: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            })
          : Promise.resolve([]),
      ]);

    const participantsByExamType = Object.fromEntries(
      enabledExamTypes.map((examType) => [
        examType,
        examTypeStats.find((item) => item.examType === examType)?._count._all ?? 0,
      ])
    ) as Partial<Record<ExamType, number>>;

    const publicParticipants = participantsByExamType[ExamType.PUBLIC] ?? 0;
    const careerRescueParticipants = careerExamEnabled
      ? participantsByExamType[ExamType.CAREER_RESCUE] ?? 0
      : 0;
    const careerAcademicParticipants = careerExamEnabled
      ? participantsByExamType[ExamType.CAREER_ACADEMIC] ?? 0
      : 0;
    const careerEmtParticipants = careerExamEnabled
      ? participantsByExamType[ExamType.CAREER_EMT] ?? 0
      : 0;

    const liveStats = {
      examName: activeExam.name,
      examYear: activeExam.year,
      examRound: activeExam.round,
      totalParticipants,
      participantsByExamType,
      publicParticipants,
      careerRescueParticipants,
      careerAcademicParticipants,
      careerEmtParticipants,
      recentParticipants,
      updatedAt: latestSubmission?.createdAt?.toISOString() ?? null,
    };

    const populationWhere: Prisma.SubmissionWhereInput = {
      examId: activeExam.id,
      examType: { in: enabledExamTypes },
      isSuspicious: false,
      ...validSubmissionScope,
      subjectScores: {
        some: {},
        none: {
          isFailed: true,
        },
      },
    };

    // 과락 포함 참여인원 집계용 where (subjectScores 과락 필터 제외)
    const allParticipantCountWhere: Prisma.SubmissionWhereInput = {
      examId: activeExam.id,
      examType: { in: enabledExamTypes },
      isSuspicious: false,
      ...validSubmissionScope,
      subjectScores: { some: {} },
    };

    const [participantStats, allParticipantCountStats, scoreBandStats, totalScoreDistributionRaw, subjectScoreDistributionRaw, subjects] =
      await Promise.all([
      // 과락 제외 집계: averageFinalScore 산출용
      prisma.submission.groupBy({
        by: ["regionId", "examType", "gender"],
        where: populationWhere,
        _count: {
          _all: true,
        },
        _avg: {
          finalScore: true,
        },
      }),
      // 과락 포함 집계: participantCount 산출용
      prisma.submission.groupBy({
        by: ["regionId", "examType", "gender"],
        where: allParticipantCountWhere,
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["regionId", "examType", "gender", "finalScore"],
        where: populationWhere,
        _count: {
          _all: true,
        },
        orderBy: [{ regionId: "asc" }, { examType: "asc" }, { gender: "asc" }, { finalScore: "desc" }],
      }),
      prisma.submission.groupBy({
        by: ["examType", "totalScore"],
        where: {
          examId: activeExam.id,
          examType: { in: enabledExamTypes },
          isSuspicious: false,
          ...validSubmissionScope,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.subjectScore.groupBy({
        by: ["subjectId", "rawScore"],
        where: {
          submission: {
            examId: activeExam.id,
            examType: { in: enabledExamTypes },
            isSuspicious: false,
            ...validSubmissionScope,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.subject.findMany({
        where: {
          examType: { in: enabledExamTypes },
          answerKeys: { some: { examId: activeExam.id } },
        },
        select: {
          id: true,
          name: true,
          examType: true,
          maxScore: true,
        },
      }),
    ]);

    const rows: MainStatsRow[] = [];

    function belongsToCohort(
      item: { regionId: number; examType: ExamType; gender: Gender },
      quota: QuotaRow,
      examType: ExamType,
      cohort: TenantRecruitmentCohort
    ): boolean {
      return (
        item.regionId === quota.regionId &&
        item.examType === examType &&
        (cohort.populationGender === null || item.gender === cohort.populationGender)
      );
    }

    function buildRow(
      quota: QuotaRow,
      examType: ExamType,
      cohort: TenantRecruitmentCohort
    ): MainStatsRow | null {
      const { gender, recruitCount } = cohort;
      if (!Number.isInteger(recruitCount) || recruitCount < 1) return null;

      const participantCount = allParticipantCountStats
        .filter((item) => belongsToCohort(item, quota, examType, cohort))
        .reduce((sum, item) => sum + item._count._all, 0);
      const averageRows = participantStats.filter(
        (item) =>
          item._avg.finalScore !== null &&
          belongsToCohort(item, quota, examType, cohort)
      );
      const averageCount = averageRows.reduce((sum, item) => sum + item._count._all, 0);
      const averageFinalScore = averageCount > 0
        ? roundNumber(
            averageRows.reduce(
              (sum, item) => sum + Number(item._avg.finalScore) * item._count._all,
              0
            ) / averageCount
          )
        : null;
      const applicantCountInfo = getTenantApplicantCount(
        tenantType,
        quota,
        examType,
        gender
      );
      const estimatedApplicants = (tenantType === "police"
        ? policePolicy.estimateApplicants
        : firePolicy.estimateApplicants)({
        applicantCount: applicantCountInfo.applicantCount,
        recruitCount,
      });
      const competitionRate =
        recruitCount > 0 && applicantCountInfo.applicantCount !== null
          ? roundNumber(applicantCountInfo.applicantCount / recruitCount)
          : null;

      const scoreCountByScore = new Map<number, number>();
      for (const item of scoreBandStats) {
        if (!belongsToCohort(item, quota, examType, cohort)) continue;
        const score = Number(item.finalScore);
        scoreCountByScore.set(score, (scoreCountByScore.get(score) ?? 0) + item._count._all);
      }
      const scoreBands = Array.from(scoreCountByScore.entries())
        .sort(([left], [right]) => right - left)
        .map(([score, count]) => ({ score, count }));
      const oneMultipleBand = getScoreBandInfoAtRank(scoreBands, recruitCount);
      const oneMultipleCutScore = oneMultipleBand?.score ?? null;
      const oneMultipleActualRank = oneMultipleBand?.endRank ?? null;
      const oneMultipleTieCount = oneMultipleBand?.count ?? null;

      const passMultiple = tenantType === "police"
        ? getPoliceConfiguredPassMultiple(recruitCount, activeExam?.policeWrittenPassMultiple)
        : getTenantPassMultiple(tenantType, recruitCount, examType);
      const predictionBands = tenantType === "police"
        ? buildPolicePredictionBands({
            recruitCount,
            participantCount,
            referenceApplicantCount: estimatedApplicants,
            isApplicantCountExact: applicantCountInfo.isExact,
            passMultiple,
          })
        : buildFirePredictionBands({
            recruitCount,
            participantCount,
            referenceApplicantCount: estimatedApplicants,
            isApplicantCountExact: applicantCountInfo.isExact,
            passMultiple,
          });

      const likelyRange = tenantType === "police" ? { min: null, max: null } : getScoreRange(
        scoreBands,
        predictionBands.sureMaxRank + 1,
        predictionBands.likelyMaxRank
      );
      const possibleRange = tenantType === "police" ? { min: null, max: null } : getScoreRange(
        scoreBands,
        predictionBands.likelyMaxRank + 1,
        predictionBands.possibleMaxRank
      );
      const sureMinScore = tenantType !== "police" && predictionBands.sureMaxRank > 0
        ? getScoreAtRank(scoreBands, predictionBands.sureMaxRank)
        : null;

      return {
        regionId: quota.regionId,
        regionName: quota.regionName,
        examType,
        gender,
        examTypeLabel: examTypeLabel(tenantType, examType, gender),
        recruitCount,
        applicantCount: applicantCountInfo.applicantCount,
        estimatedApplicants,
        isApplicantCountExact: applicantCountInfo.isExact,
        competitionRate,
        participantCount,
        averageFinalScore,
        oneMultipleCutScore,
        oneMultipleBaseRank: recruitCount,
        oneMultipleActualRank,
        oneMultipleTieCount,
        possibleRange,
        likelyRange,
        sureMinScore,
      };
    }

    for (const quota of quotas) {
      for (const examType of enabledExamTypes) {
        const cohorts = getTenantRecruitmentCohorts(tenantType, quota, examType);
        for (const cohort of cohorts) {
          const row = buildRow(quota, examType, cohort);
          if (row) rows.push(row);
        }
      }
    }

    const myScoresByExamType = new Map<ExamType, UserScoreSnapshot>();
    for (const submission of mySubmissions) {
      if (myScoresByExamType.has(submission.examType)) {
        continue;
      }

      const subjectScoresByName = new Map<string, { score: number; isFail: boolean }>();
      for (const subjectScore of submission.subjectScores) {
        subjectScoresByName.set(subjectScore.subject.name, {
          score: Number(subjectScore.rawScore),
          isFail: subjectScore.isFailed,
        });
      }

      myScoresByExamType.set(submission.examType, {
        totalScore: Number(submission.totalScore),
        hasAnyFail: submission.subjectScores.some((subjectScore) => subjectScore.isFailed),
        subjectScoresByName,
      });
    }

    const scoreDistributions = buildScoreDistributions({
      tenantType,
      enabledExamTypes,
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        examType: subject.examType,
        maxScore: Number(subject.maxScore),
      })),
      totalScoreRows: totalScoreDistributionRaw.map((row) => ({
        examType: row.examType,
        totalScore: Number(row.totalScore),
        count: row._count._all,
      })),
      subjectScoreRows: subjectScoreDistributionRaw.map((row) => ({
        subjectId: row.subjectId,
        rawScore: Number(row.rawScore),
        count: row._count._all,
      })),
      myScoresByExamType,
    });

    const competitiveBase = rows
      .filter(
        (row) =>
          row.averageFinalScore !== null &&
          row.sureMinScore !== null &&
          row.participantCount >= 1
      )
      .map((row) => ({
        label: `${row.regionName}-${row.examTypeLabel}`,
        averageFinalScore: row.averageFinalScore as number,
        sureMinScore: row.sureMinScore as number,
        gap: roundNumber((row.sureMinScore as number) - (row.averageFinalScore as number)),
      }));

    const topCompetitive = competitiveBase
      .slice()
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 5)
      .map((item, index) => ({ rank: index + 1, ...item }));

    const leastCompetitive = competitiveBase
      .slice()
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 5)
      .map((item, index) => ({ rank: index + 1, ...item }));

    return NextResponse.json(
      {
        tenantType,
        examTypes,
        updatedAt: new Date().toISOString(),
        careerExamEnabled,
        liveStats,
        sectionVisibility,
        notices,
        difficulty,
        rows,
        topCompetitive,
        leastCompetitive,
        scoreDistributions,
        refresh: {
          enabled: Boolean(settings["site.mainPageAutoRefresh"]),
          intervalSec: refreshInterval,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("풀서비스 메인 통계 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "풀서비스 메인 통계 조회에 실패했습니다." }, { status: 500 });
  }
}

