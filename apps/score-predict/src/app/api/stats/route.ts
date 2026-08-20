import { ExamType, Gender, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { getDifficultyStats } from "@/lib/difficulty";
import { prisma } from "@/lib/prisma";
import { consumeFixedWindowRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import {
  getTenantRecruitmentCohorts,
  type TenantRecruitmentCohort,
} from "@/lib/tenant-calculations.server";
import type { TenantType } from "@/lib/tenant";
import { buildPoliceScoredNonCutoffWhere } from "@/lib/police/written-policy";

export const runtime = "nodejs";

const STATS_REQUEST_WINDOW_MS = 60 * 1000;
const STATS_REQUEST_LIMIT_PER_IP = 30;

function parseExamId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toCount(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function toScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (value && typeof value === "object") {
    const asString = String(value);
    const parsed = Number(asString);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function roundOne(value: number): number {
  return Number(value.toFixed(1));
}

interface RegionAggregate {
  regionId: number;
  regionName: string;
  publicCount: number;
  careerCount: number;
  careerRescueCount: number;
  careerAcademicCount: number;
  careerEmtCount: number;
  total: number;
  avgTotalScore: number;
  avgFinalScore: number;
}

interface RegionPredictionAggregate {
  regionId: number;
  regionName: string;
  examType: ExamType;
  gender: Gender | null;
  recruitCount: number;
  participantCount: number;
  oneMultipleBaseRank: number;
  isOneMultipleCutConfirmed: boolean;
  oneMultipleActualRank: number | null;
  oneMultipleCutScore: number | null;
  oneMultipleTieCount: number | null;
}

interface ScoreBand {
  score: number;
  count: number;
}

function roundTwo(value: number): number {
  return Number(value.toFixed(2));
}

function getScoreBandInfoAtRank(
  scoreBands: ScoreBand[],
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
      score: roundTwo(band.score),
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

interface ScoreDistributionSeries {
  examType: ExamType;
  maxScore: number;
  cutoffScore: number | null;
  items: Array<{
    bucket: number;
    label: string;
    start: number;
    end: number;
    count: number;
    isCutoffRange: boolean;
  }>;
}

function buildScoreDistributions(
  tenantType: TenantType,
  examTypes: readonly ExamType[],
  subjects: Array<{ examType: ExamType; maxScore: number }>,
  rows: Array<{ examType: ExamType; totalScore: unknown; _count: { _all: number } }>
): ScoreDistributionSeries[] {
  const step = 10;

  return examTypes.flatMap((examType) => {
    const maxScore = subjects
      .filter((subject) => subject.examType === examType)
      .reduce((sum, subject) => sum + Number(subject.maxScore), 0);
    if (maxScore < 1) return [];

    const cutoffScore = tenantType === "fire" ? maxScore * 0.6 : null;
    const bucketCount = Math.floor(maxScore / step) + 1;
    const countByBucket = new Map<number, number>();
    for (const row of rows) {
      if (row.examType !== examType) continue;
      const score = Math.max(0, Math.min(maxScore, toScore(row.totalScore)));
      const bucket = Math.min(Math.floor(score / step), bucketCount - 1);
      countByBucket.set(bucket, (countByBucket.get(bucket) ?? 0) + row._count._all);
    }

    return [{
      examType,
      maxScore,
      cutoffScore,
      items: Array.from({ length: bucketCount }, (_, bucket) => {
        const start = bucket * step;
        const end = Math.min(maxScore, start + step - 1);
        return {
          bucket,
          label: start === maxScore ? `${maxScore}점` : `${start}~${end}점`,
          start,
          end,
          count: countByBucket.get(bucket) ?? 0,
          isCutoffRange: cutoffScore !== null && end < cutoffScore,
        };
      }),
    }];
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRoute();
  if ("error" in auth) {
    return auth.error;
  }

  try {
    const ip = getClientIp(request);
    const rateLimit = consumeFixedWindowRateLimit({
      namespace: "stats-api-ip",
      key: ip,
      limit: STATS_REQUEST_LIMIT_PER_IP,
      windowMs: STATS_REQUEST_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSec),
          },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedExamId = parseExamId(searchParams.get("examId"));

    const exam = requestedExamId
      ? await prisma.exam.findUnique({
          where: { id: requestedExamId },
        })
      : await prisma.exam.findFirst({
          where: { isActive: true },
          orderBy: [{ examDate: "desc" }, { id: "desc" }],
        });

    if (!exam) {
      return NextResponse.json({ error: "통계를 조회할 시험이 없습니다." }, { status: 404 });
    }

    const tenantExamTypes: ExamType[] =
      auth.tenantType === "police"
        ? [ExamType.PUBLIC, ExamType.CAREER]
        : [ExamType.PUBLIC, ExamType.CAREER_RESCUE, ExamType.CAREER_ACADEMIC, ExamType.CAREER_EMT];
    const policeRegionScope: Prisma.SubmissionWhereInput =
      auth.tenantType === "police"
        ? {
            region: {
              isActive: true,
            },
          }
        : {};
    const scopedSubmissionWhere: Prisma.SubmissionWhereInput = {
      examId: exam.id,
      examType: { in: tenantExamTypes },
      ...policeRegionScope,
    };
    const predictionPopulationWhere: Prisma.SubmissionWhereInput =
      auth.tenantType === "police"
        ? {
            OR: tenantExamTypes.map((examType) => ({
              examType,
              ...buildPoliceScoredNonCutoffWhere(examType),
            })),
          }
        : {
            subjectScores: {
              some: {},
              none: { isFailed: true },
            },
          };
    const policeRegionDateSql =
      auth.tenantType === "police"
        ? Prisma.sql`AND EXISTS (
            SELECT 1
            FROM "Region" r
            WHERE r.id = "Submission"."regionId"
              AND r."isActive" = true
          )`
        : Prisma.sql``;

    const [
      totalParticipants,
      byExamTypeRaw,
      byGenderRaw,
      byRegionRaw,
      byRegionAverageRaw,
      regions,
      submissionsByDateRaw,
      scoreDistributionRaw,
      scoreDistributionSubjects,
      difficulty,
      predictionParticipantRaw,
      predictionScoreBandRaw,
    ] = await Promise.all([
      prisma.submission.count({
        where: scopedSubmissionWhere,
      }),
      prisma.submission.groupBy({
        by: ["examType"],
        where: scopedSubmissionWhere,
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["gender"],
        where: scopedSubmissionWhere,
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["regionId", "examType"],
        where: scopedSubmissionWhere,
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["regionId"],
        where: scopedSubmissionWhere,
        _count: {
          _all: true,
        },
        _avg: {
          totalScore: true,
          finalScore: true,
        },
      }),
      prisma.region.findMany({
        where:
          auth.tenantType === "police"
            ? {
                isActive: true,
              }
            : undefined,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.$queryRaw<Array<{ date: string; count: bigint | number }>>`
        SELECT
          TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS count
        FROM "Submission"
        WHERE "examId" = ${exam.id}
          AND "examType"::text IN (${Prisma.join(tenantExamTypes)})
          ${policeRegionDateSql}
        GROUP BY TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        ORDER BY TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      `,
      prisma.submission.groupBy({
        by: ["examType", "totalScore"],
        where: scopedSubmissionWhere,
        _count: { _all: true },
        orderBy: [{ examType: "asc" }, { totalScore: "asc" }],
      }),
      prisma.subject.findMany({
        where: {
          examType: { in: tenantExamTypes },
          answerKeys: { some: { examId: exam.id } },
        },
        select: {
          examType: true,
          maxScore: true,
        },
      }),
      getDifficultyStats(
        exam.id,
        tenantExamTypes,
        auth.tenantType === "police"
      ),
      prisma.submission.groupBy({
        by: ["regionId", "examType", "gender"],
        where: {
          examId: exam.id,
          examType: { in: tenantExamTypes },
          ...policeRegionScope,
          isSuspicious: false,
          ...predictionPopulationWhere,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["regionId", "examType", "gender", "finalScore"],
        where: {
          examId: exam.id,
          examType: { in: tenantExamTypes },
          ...policeRegionScope,
          isSuspicious: false,
          ...predictionPopulationWhere,
        },
        _count: {
          _all: true,
        },
        orderBy: [{ regionId: "asc" }, { examType: "asc" }, { gender: "asc" }, { finalScore: "desc" }],
      }),
    ]);

    const regionNameById = new Map(regions.map((region) => [region.id, region.name] as const));

    // 시험별 모집인원 조회
    const examQuotas = await prisma.examRegionQuota.findMany({
      where: {
        examId: exam.id,
        ...(auth.tenantType === "police"
          ? {
              region: {
                isActive: true,
              },
            }
          : {}),
      },
      select: {
        regionId: true,
        recruitCount: true,
        recruitCountCareer: true,
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
    const quotaByRegionId = new Map(examQuotas.map((q) => [q.regionId, q] as const));

    const byExamType = {
      [ExamType.PUBLIC]: 0,
      [ExamType.CAREER]: 0,
      [ExamType.CAREER_RESCUE]: 0,
      [ExamType.CAREER_ACADEMIC]: 0,
      [ExamType.CAREER_EMT]: 0,
    };
    for (const item of byExamTypeRaw) {
      byExamType[item.examType] = item._count._all;
    }

    const byGender = {
      [Gender.MALE]: 0,
      [Gender.FEMALE]: 0,
    };
    for (const item of byGenderRaw) {
      byGender[item.gender] = item._count._all;
    }

    const byRegionMap = new Map<number, RegionAggregate>();

    for (const item of byRegionRaw) {
      const existing = byRegionMap.get(item.regionId) ?? {
        regionId: item.regionId,
        regionName: regionNameById.get(item.regionId) ?? "알 수 없음",
        publicCount: 0,
        careerCount: 0,
        careerRescueCount: 0,
        careerAcademicCount: 0,
        careerEmtCount: 0,
        total: 0,
        avgTotalScore: 0,
        avgFinalScore: 0,
      };

      if (item.examType === ExamType.PUBLIC) {
        existing.publicCount += item._count._all;
      } else if (item.examType === ExamType.CAREER) {
        existing.careerCount += item._count._all;
      } else if (item.examType === ExamType.CAREER_RESCUE) {
        existing.careerRescueCount += item._count._all;
      } else if (item.examType === ExamType.CAREER_ACADEMIC) {
        existing.careerAcademicCount += item._count._all;
      } else if (item.examType === ExamType.CAREER_EMT) {
        existing.careerEmtCount += item._count._all;
      }
      existing.total += item._count._all;
      byRegionMap.set(item.regionId, existing);
    }

    for (const item of byRegionAverageRaw) {
      const existing = byRegionMap.get(item.regionId) ?? {
        regionId: item.regionId,
        regionName: regionNameById.get(item.regionId) ?? "알 수 없음",
        publicCount: 0,
        careerCount: 0,
        careerRescueCount: 0,
        careerAcademicCount: 0,
        careerEmtCount: 0,
        total: 0,
        avgTotalScore: 0,
        avgFinalScore: 0,
      };

      existing.total = item._count._all;
      existing.avgTotalScore = roundOne(toScore(item._avg.totalScore));
      existing.avgFinalScore = roundOne(toScore(item._avg.finalScore));
      byRegionMap.set(item.regionId, existing);
    }

    const submissionsByDate = submissionsByDateRaw.map((item) => ({
      date: item.date,
      count: toCount(item.count),
    }));

    const scoreDistributions = buildScoreDistributions(
      auth.tenantType,
      tenantExamTypes,
      scoreDistributionSubjects.map((subject) => ({
        examType: subject.examType,
        maxScore: Number(subject.maxScore),
      })),
      scoreDistributionRaw
    );

    const byRegionPrediction: RegionPredictionAggregate[] = [];

    function belongsToCohort(
      item: { regionId: number; examType: ExamType; gender: Gender },
      regionId: number,
      examType: ExamType,
      cohort: TenantRecruitmentCohort
    ): boolean {
      return (
        item.regionId === regionId &&
        item.examType === examType &&
        (cohort.populationGender === null || item.gender === cohort.populationGender)
      );
    }

    for (const region of regions) {
      const quota = quotaByRegionId.get(region.id);
      if (!quota) continue;

      for (const examType of tenantExamTypes) {
        const cohorts = getTenantRecruitmentCohorts(auth.tenantType, quota, examType);
        for (const cohort of cohorts) {
          const recruitCount = cohort.recruitCount;
          if (!Number.isInteger(recruitCount) || recruitCount < 1) continue;

          const participantCount = predictionParticipantRaw
            .filter((item) => belongsToCohort(item, region.id, examType, cohort))
            .reduce((sum, item) => sum + item._count._all, 0);
          const scoreCountByScore = new Map<number, number>();
          for (const row of predictionScoreBandRaw) {
            if (!belongsToCohort(row, region.id, examType, cohort)) continue;
            const score = toScore(row.finalScore);
            scoreCountByScore.set(score, (scoreCountByScore.get(score) ?? 0) + row._count._all);
          }
          const scoreBands: ScoreBand[] = Array.from(scoreCountByScore.entries())
            .sort(([left], [right]) => right - left)
            .map(([score, count]) => ({ score, count }));
          const oneMultipleBand = getScoreBandInfoAtRank(scoreBands, recruitCount);
          const isOneMultipleCutConfirmed = participantCount >= recruitCount;

          byRegionPrediction.push({
            regionId: region.id,
            regionName: region.name,
            examType,
            gender: cohort.gender,
            recruitCount,
            participantCount,
            oneMultipleBaseRank: recruitCount,
            isOneMultipleCutConfirmed,
            oneMultipleActualRank: isOneMultipleCutConfirmed ? oneMultipleBand?.endRank ?? null : null,
            oneMultipleCutScore: isOneMultipleCutConfirmed ? oneMultipleBand?.score ?? null : null,
            oneMultipleTieCount: isOneMultipleCutConfirmed ? oneMultipleBand?.count ?? null : null,
          });
        }
      }
    }

    byRegionPrediction.sort((a, b) => {
      const regionCompare = a.regionName.localeCompare(b.regionName, "ko-KR");
      if (regionCompare !== 0) {
        return regionCompare;
      }

      if (a.examType === b.examType) return String(a.gender ?? "").localeCompare(String(b.gender ?? ""));

      return a.examType === ExamType.PUBLIC ? -1 : 1;
    });

    return NextResponse.json({
      exam: {
        id: exam.id,
        name: exam.name,
        year: exam.year,
        round: exam.round,
        examDate: exam.examDate,
        isActive: exam.isActive,
      },
      totalParticipants,
      byExamType: {
        PUBLIC: byExamType[ExamType.PUBLIC],
        CAREER: byExamType[ExamType.CAREER],
        CAREER_RESCUE: byExamType[ExamType.CAREER_RESCUE],
        CAREER_ACADEMIC: byExamType[ExamType.CAREER_ACADEMIC],
        CAREER_EMT: byExamType[ExamType.CAREER_EMT],
      },
      byGender: {
        MALE: byGender[Gender.MALE],
        FEMALE: byGender[Gender.FEMALE],
      },
      byRegion: Array.from(byRegionMap.values()).sort((a, b) => b.total - a.total),
      byRegionPrediction,
      submissionsByDate,
      scoreDistributions,
      difficulty,
    });
  } catch (error) {
    console.error("참여 통계 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "참여 통계 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
