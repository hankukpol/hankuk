import { BonusType, ExamType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCompetitorDisplayName, getPassMultiple, getRecruitCount } from "@/lib/police/prediction";

export interface KnownFinalScoreResult {
  writtenScore: number;
  written50: number;
  fitnessBase: number;
  martialBonusPoint: number;
  fitnessTotal: number;
  fitnessBonus25: number;
  fitness25: number;
  score75: number | null;
}

export interface FinalRankingCompetitor {
  rank: number;
  score: number;
  maskedName: string;
  isMine: boolean;
}

export interface FinalRankingDetails {
  finalRank: number | null;
  totalParticipants: number;
  recruitCount: number;
  passMultiple: number;
  oneMultipleCutScore: number | null;
  isWithinOneMultiple: boolean;
  examTypeLabel: string;
  regionName: string;
  userName: string;
  myScore: number | null;
  competitors: FinalRankingCompetitor[];
}

interface FinalRankingQueryRow {
  submissionId: number;
  score75: number;
  finalRank: number;
  sortOrder: number;
  userName: string;
  username: string;
  contactPhone: string;
}

export function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

const finalPredictionQuotaSelect = {
  recruitCount: true,
  recruitCountCareer: true,
  region: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.ExamRegionQuotaSelect;

export function getMartialBonusPoint(danLevel: number): number {
  if (!Number.isFinite(danLevel)) return 0;
  if (danLevel >= 4) return 2;
  if (danLevel >= 2) return 1;
  return 0;
}

export function calculateKnownFinalScore(params: {
  writtenScore: number;
  fitnessPassed: boolean;
  martialDanLevel: number;
  bonusRate: number;
}): KnownFinalScoreResult {
  const writtenScore = Math.max(0, params.writtenScore);
  const written50 = roundScore((writtenScore / 250) * 100 * 0.5);
  const martialBonusPoint = getMartialBonusPoint(params.martialDanLevel);
  const fitnessBase = 48;
  const fitnessTotal = fitnessBase + martialBonusPoint;
  const fitnessBonus25 = roundScore(25 * (params.bonusRate || 0));
  const fitness25 = roundScore(fitnessTotal * 0.5 + fitnessBonus25);

  if (!params.fitnessPassed) {
    return {
      writtenScore,
      written50,
      fitnessBase,
      martialBonusPoint,
      fitnessTotal,
      fitnessBonus25,
      fitness25,
      score75: null,
    };
  }

  return {
    writtenScore,
    written50,
    fitnessBase,
    martialBonusPoint,
    fitnessTotal,
    fitnessBonus25,
    fitness25,
    score75: roundScore(written50 + fitness25),
  };
}

function toFinalExamTypeLabel(examType: ExamType): string {
  return examType === ExamType.CAREER ? "경행경채" : "공채";
}

function buildFinalRankingCte(params: {
  examId: number;
  regionId: number;
  examType: ExamType;
}) {
  return Prisma.sql`
    WITH ranked AS (
      SELECT
        fp."submissionId"::integer AS "submissionId",
        fp."finalScore"::double precision AS "score75",
        u."name" AS "userName",
        u."phone" AS "username",
        u."contactPhone" AS "contactPhone",
        RANK() OVER (ORDER BY fp."finalScore" DESC)::integer AS "finalRank",
        ROW_NUMBER() OVER (
          ORDER BY
            fp."finalScore" DESC,
            CASE
              WHEN s."bonusType" IN (
                CAST(${BonusType.VETERAN_5} AS "BonusType"),
                CAST(${BonusType.VETERAN_10} AS "BonusType")
              ) THEN 1
              ELSE 0
            END DESC,
            s."finalScore" DESC,
            COALESCE(fp."fitnessScore", 0) DESC,
            fp."submissionId" ASC
        )::integer AS "sortOrder"
      FROM "FinalPrediction" fp
      JOIN "Submission" s ON s.id = fp."submissionId"
      JOIN "User" u ON u.id = s."userId"
      WHERE fp."finalScore" IS NOT NULL
        AND fp."interviewGrade" = 'PASS'
        AND s."examId" = ${params.examId}
        AND s."regionId" = ${params.regionId}
        AND s."examType" = CAST(${params.examType} AS "ExamType")
    )
  `;
}

export async function calculateFinalRankingDetails(params: {
  examId: number;
  regionId: number;
  examType: ExamType;
  submissionId: number;
}): Promise<FinalRankingDetails | null> {
  const quota = await prisma.examRegionQuota.findUnique({
    where: {
      examId_regionId: {
        examId: params.examId,
        regionId: params.regionId,
      },
    },
    select: finalPredictionQuotaSelect,
  });
  if (!quota) return null;

  const recruitCount = getRecruitCount(quota, params.examType);
  if (recruitCount < 1) return null;

  const passMultiple = getPassMultiple(recruitCount);
  const rankingCte = buildFinalRankingCte(params);

  const [summaryRow] = await prisma.$queryRaw<
    Array<{ totalParticipants: number; oneMultipleCutScore: number | null }>
  >(Prisma.sql`
    ${rankingCte}
    SELECT
      COUNT(*)::integer AS "totalParticipants",
      MAX(CASE WHEN "sortOrder" = ${recruitCount} THEN "score75" ELSE NULL END)::double precision AS "oneMultipleCutScore"
    FROM ranked
  `);

  const totalParticipants = Number(summaryRow?.totalParticipants ?? 0);
  if (totalParticipants < 1) return null;

  const [myRow] = await prisma.$queryRaw<FinalRankingQueryRow[]>(Prisma.sql`
    ${rankingCte}
    SELECT
      "submissionId",
      "score75",
      "finalRank",
      "sortOrder",
      "userName",
      "username",
      "contactPhone"
    FROM ranked
    WHERE "submissionId" = ${params.submissionId}
    LIMIT 1
  `);

  const competitorRows = await prisma.$queryRaw<FinalRankingQueryRow[]>(Prisma.sql`
    ${rankingCte}
    SELECT
      "submissionId",
      "score75",
      "finalRank",
      "sortOrder",
      "userName",
      "username",
      "contactPhone"
    FROM ranked
    WHERE "sortOrder" <= 50
       OR "submissionId" = ${params.submissionId}
    ORDER BY "sortOrder" ASC
  `);

  const competitors = competitorRows.map((row) => ({
    rank: Number(row.finalRank),
    score: roundScore(Number(row.score75)),
    maskedName: getCompetitorDisplayName({
      name: row.userName,
      phone: row.username,
      contactPhone: row.contactPhone,
    }),
    isMine: row.submissionId === params.submissionId,
  }));

  const myRank = myRow ? Number(myRow.finalRank) : null;

  return {
    finalRank: myRank,
    totalParticipants,
    recruitCount,
    passMultiple: roundScore(passMultiple),
    oneMultipleCutScore:
      summaryRow?.oneMultipleCutScore === null || summaryRow?.oneMultipleCutScore === undefined
        ? null
        : roundScore(Number(summaryRow.oneMultipleCutScore)),
    isWithinOneMultiple: myRank !== null && myRank <= recruitCount,
    examTypeLabel: toFinalExamTypeLabel(params.examType),
    regionName: quota.region.name,
    userName: myRow ? myRow.userName : "",
    myScore: myRow ? roundScore(Number(myRow.score75)) : null,
    competitors,
  };
}

export async function calculateKnownFinalRank(params: {
  examId: number;
  regionId: number;
  examType: ExamType;
  submissionId: number;
}): Promise<{ finalRank: number | null; totalParticipants: number }> {
  const details = await calculateFinalRankingDetails(params);
  return {
    finalRank: details?.finalRank ?? null,
    totalParticipants: details?.totalParticipants ?? 0,
  };
}
