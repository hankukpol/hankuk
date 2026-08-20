import { BonusType, ExamType, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCompetitorDisplayName, getPassMultiple, getRecruitCount } from "@/lib/police/prediction";
import { getPoliceScoredNonCutoffSql } from "@/lib/police/written-policy";
import {
  roundPoliceFinalScore,
} from "@/lib/police/final-score-policy";
import {
  canShowSampleOneMultiplePoint,
  getOneMultipleDisclosureTarget,
} from "@/lib/public-sample-policy";

export {
  calculateKnownFinalScore,
  getAppliedPoliceWrittenBonusRate,
  getMartialBonusPoint,
  type KnownFinalScoreResult,
} from "@/lib/police/final-score-policy";

type FinalPredictionDb = PrismaClient | Prisma.TransactionClient;

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
  oneMultipleAvailable: boolean;
  oneMultipleDisclosureTarget: number;
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
  return roundPoliceFinalScore(value);
}

const finalPredictionQuotaSelect = {
  recruitCount: true,
  recruitCountCareer: true,
  exam: {
    select: {
      policeWrittenPassMultiple: true,
    },
  },
  region: {
    select: {
      name: true,
      isActive: true,
    },
  },
} satisfies Prisma.ExamRegionQuotaSelect;

function toFinalExamTypeLabel(examType: ExamType): string {
  return examType === ExamType.CAREER ? "경행경채" : "공채";
}

function buildFinalRankingCte(params: {
  examId: number;
  regionId: number;
  examType: ExamType;
}) {
  const nonCutoffCondition = getPoliceScoredNonCutoffSql(params.examType);
  return Prisma.sql`
    WITH final_inputs AS (
      SELECT
        fp."submissionId"::integer AS "submissionId",
        ROUND((
          ROUND(((s."finalScore"::numeric / 250) * 50), 2)
          + ROUND((
            (
              48
              + CASE
                  WHEN COALESCE(fp."fitnessScore", 0) >= 4 THEN 2
                  WHEN COALESCE(fp."fitnessScore", 0) >= 2 THEN 1
                  ELSE 0
                END
            ) * 0.5
            + 25 * LEAST(
                0.10::numeric,
                GREATEST(0::numeric, (s."finalScore"::numeric - s."totalScore"::numeric) / 250)
              )
          ), 2)
        ), 2)::double precision AS "score75",
        u."name" AS "userName",
        u."phone" AS "username",
        u."contactPhone" AS "contactPhone",
        s."bonusType" AS "bonusType",
        s."finalScore"::double precision AS "writtenScore",
        COALESCE(fp."fitnessScore", 0)::double precision AS "martialDanLevel"
      FROM "FinalPrediction" fp
      JOIN "Submission" s ON s.id = fp."submissionId"
      JOIN "User" u ON u.id = s."userId"
      WHERE fp."finalScore" IS NOT NULL
        AND fp."interviewGrade" = 'PASS'
        AND s."isSuspicious" = false
        ${nonCutoffCondition}
        AND s."examId" = ${params.examId}
        AND s."regionId" = ${params.regionId}
        AND s."examType" = CAST(${params.examType} AS "ExamType")
    ),
    ranked AS (
      SELECT
        "submissionId",
        "score75",
        "userName",
        "username",
        "contactPhone",
        "bonusType",
        "writtenScore",
        "martialDanLevel",
        RANK() OVER (ORDER BY "score75" DESC)::integer AS "finalRank",
        ROW_NUMBER() OVER (
          ORDER BY
            "score75" DESC,
            CASE
              WHEN "bonusType" IN (
                CAST(${BonusType.VETERAN_5} AS "BonusType"),
                CAST(${BonusType.VETERAN_10} AS "BonusType")
              ) THEN 1
              ELSE 0
            END DESC,
            "writtenScore" DESC,
            "martialDanLevel" DESC,
            "submissionId" ASC
        )::integer AS "sortOrder"
      FROM final_inputs
    )
  `;
}

export async function calculateFinalRankingDetails(params: {
  examId: number;
  regionId: number;
  examType: ExamType;
  submissionId: number;
}, db: FinalPredictionDb = prisma): Promise<FinalRankingDetails | null> {
  const quota = await db.examRegionQuota.findUnique({
    where: {
      examId_regionId: {
        examId: params.examId,
        regionId: params.regionId,
      },
    },
    select: finalPredictionQuotaSelect,
  });
  if (!quota) return null;
  if (!quota.region.isActive) return null;

  const recruitCount = getRecruitCount(quota, params.examType);
  if (recruitCount < 1) return null;

  const passMultiple = getPassMultiple(
    recruitCount,
    quota.exam.policeWrittenPassMultiple,
    params.examType
  );
  const rankingCte = buildFinalRankingCte(params);

  const [summaryRow] = await db.$queryRaw<
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
  const oneMultipleAvailable = canShowSampleOneMultiplePoint(totalParticipants, recruitCount);

  const [myRow] = await db.$queryRaw<FinalRankingQueryRow[]>(Prisma.sql`
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

  const competitorRows = await db.$queryRaw<FinalRankingQueryRow[]>(Prisma.sql`
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
      !oneMultipleAvailable ||
      summaryRow?.oneMultipleCutScore === null ||
      summaryRow?.oneMultipleCutScore === undefined
        ? null
        : roundScore(Number(summaryRow.oneMultipleCutScore)),
    oneMultipleAvailable,
    oneMultipleDisclosureTarget: getOneMultipleDisclosureTarget(recruitCount),
    isWithinOneMultiple: oneMultipleAvailable && myRank !== null && myRank <= recruitCount,
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
}, db: FinalPredictionDb = prisma): Promise<{ finalRank: number | null; totalParticipants: number }> {
  const details = await calculateFinalRankingDetails(params, db);
  return {
    finalRank: details?.finalRank ?? null,
    totalParticipants: details?.totalParticipants ?? 0,
  };
}
