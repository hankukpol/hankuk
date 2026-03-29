import { ExamType, Gender } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { getDifficultyStats } from "@/lib/difficulty";
import { prisma } from "@/lib/prisma";
import { consumeFixedWindowRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

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
  total: number;
  avgTotalScore: number;
  avgFinalScore: number;
}

interface RegionPredictionAggregate {
  regionId: number;
  regionName: string;
  examType: ExamType;
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

function getQuotaRecruitCount(
  quota: { recruitPublicMale: number; recruitPublicFemale: number; recruitRescue: number; recruitAcademicMale: number; recruitAcademicFemale: number; recruitAcademicCombined: number; recruitEmtMale: number; recruitEmtFemale: number },
  examType: ExamType
): number {
  if (examType === ExamType.CAREER_RESCUE) return quota.recruitRescue;
  if (examType === ExamType.CAREER_ACADEMIC) return quota.recruitAcademicMale + quota.recruitAcademicFemale + quota.recruitAcademicCombined;
  if (examType === ExamType.CAREER_EMT) return quota.recruitEmtMale + quota.recruitEmtFemale;
  return quota.recruitPublicMale + quota.recruitPublicFemale;
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

export async function GET(request: NextRequest) {
  const auth = await requireAdminRoute();
  if (auth.error) {
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

    const [
      totalParticipants,
      byExamTypeRaw,
      byGenderRaw,
      byRegionRaw,
      byRegionAverageRaw,
      regions,
      submissionsByDateRaw,
      scoreDistributionRaw,
      difficulty,
      predictionParticipantRaw,
      predictionScoreBandRaw,
    ] = await Promise.all([
      prisma.submission.count({
        where: { examId: exam.id },
      }),
      prisma.submission.groupBy({
        by: ["examType"],
        where: { examId: exam.id },
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["gender"],
        where: { examId: exam.id },
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["regionId", "examType"],
        where: { examId: exam.id },
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["regionId"],
        where: { examId: exam.id },
        _count: {
          _all: true,
        },
        _avg: {
          totalScore: true,
          finalScore: true,
        },
      }),
      prisma.region.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.$queryRaw<Array<{ date: string; count: bigint | number }>>`
        SELECT
          TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS count
        FROM "Submission"
        WHERE "examId" = ${exam.id}
        GROUP BY TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        ORDER BY TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      `,
      prisma.$queryRaw<Array<{ bucket: bigint | number; count: bigint | number }>>`
        SELECT
          LEAST(FLOOR(GREATEST("finalScore", 0) / 10), 24)::int AS bucket,
          COUNT(*)::bigint AS count
        FROM "Submission"
        WHERE "examId" = ${exam.id}
        GROUP BY bucket
        ORDER BY bucket
      `,
      getDifficultyStats(exam.id),
      prisma.submission.groupBy({
        by: ["regionId", "examType"],
        where: {
          examId: exam.id,
          isSuspicious: false,
          subjectScores: {
            some: {},
            none: { isFailed: true },
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.submission.groupBy({
        by: ["regionId", "examType", "finalScore"],
        where: {
          examId: exam.id,
          isSuspicious: false,
          subjectScores: {
            some: {},
            none: { isFailed: true },
          },
        },
        _count: {
          _all: true,
        },
        orderBy: [{ regionId: "asc" }, { examType: "asc" }, { finalScore: "desc" }],
      }),
    ]);

    const regionNameById = new Map(regions.map((region) => [region.id, region.name] as const));

    // 시험별 모집인원 조회
    const examQuotas = await prisma.examRegionQuota.findMany({
      where: { examId: exam.id },
      select: { regionId: true, recruitPublicMale: true, recruitPublicFemale: true, recruitRescue: true, recruitAcademicMale: true, recruitAcademicFemale: true, recruitAcademicCombined: true, recruitEmtMale: true, recruitEmtFemale: true },
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
        total: 0,
        avgTotalScore: 0,
        avgFinalScore: 0,
      };

      if (item.examType === ExamType.PUBLIC) {
        existing.publicCount += item._count._all;
      } else if (
        item.examType === ExamType.CAREER ||
        item.examType === ExamType.CAREER_RESCUE ||
        item.examType === ExamType.CAREER_ACADEMIC ||
        item.examType === ExamType.CAREER_EMT
      ) {
        existing.careerCount += item._count._all;
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

    const scoreDistributionMap = new Map<number, number>();
    for (const item of scoreDistributionRaw) {
      const bucket = toCount(item.bucket);
      if (bucket < 0 || bucket > 24) {
        continue;
      }
      scoreDistributionMap.set(bucket, toCount(item.count));
    }

    const scoreDistribution = Array.from({ length: 25 }, (_, index) => {
      const start = index * 10;
      const end = start + 10;
      const label = `${start}~${end}`;

      return {
        bucket: index,
        label,
        start,
        end,
        count: scoreDistributionMap.get(index) ?? 0,
        isCutoffRange: start < 100,
      };
    });

    const predictionParticipantMap = new Map<string, number>();
    for (const item of predictionParticipantRaw) {
      predictionParticipantMap.set(`${item.regionId}-${item.examType}`, item._count._all);
    }

    const predictionScoreBandMap = new Map<string, ScoreBand[]>();
    for (const row of predictionScoreBandRaw) {
      const key = `${row.regionId}-${row.examType}`;
      const current = predictionScoreBandMap.get(key) ?? [];
      current.push({
        score: toScore(row.finalScore),
        count: row._count._all,
      });
      predictionScoreBandMap.set(key, current);
    }

    const byRegionPrediction: RegionPredictionAggregate[] = [];
    for (const region of regions) {
      const quota = quotaByRegionId.get(region.id);
      if (!quota) continue;

      for (const examType of [ExamType.PUBLIC, ExamType.CAREER_RESCUE, ExamType.CAREER_ACADEMIC, ExamType.CAREER_EMT] as const) {
        const recruitCount = getQuotaRecruitCount(quota, examType);
        if (!Number.isInteger(recruitCount) || recruitCount < 1) {
          continue;
        }

        const key = `${region.id}-${examType}`;
        const participantCount = predictionParticipantMap.get(key) ?? 0;
        const scoreBands = predictionScoreBandMap.get(key) ?? [];
        const oneMultipleBand = getScoreBandInfoAtRank(scoreBands, recruitCount);
        const isOneMultipleCutConfirmed = participantCount >= recruitCount;

        byRegionPrediction.push({
          regionId: region.id,
          regionName: region.name,
          examType,
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

    byRegionPrediction.sort((a, b) => {
      const regionCompare = a.regionName.localeCompare(b.regionName, "ko-KR");
      if (regionCompare !== 0) {
        return regionCompare;
      }

      if (a.examType === b.examType) {
        return 0;
      }

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
      scoreDistribution,
      difficulty,
    });
  } catch (error) {
    console.error("참여 통계 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "참여 통계 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
