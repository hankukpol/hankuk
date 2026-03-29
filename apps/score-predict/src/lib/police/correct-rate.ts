import { ExamType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CORRECT_RATE_CACHE_TTL = 120_000;

type CorrectRateDifficultyLevel = "EASY" | "NORMAL" | "HARD" | "VERY_HARD";

interface CachedCorrectRate {
  at: number;
  rows: CorrectRateRow[];
}

interface RawCorrectRateRow {
  subjectId: number;
  questionNumber: number;
  totalAnswered: bigint | number;
  correctCount: bigint | number;
  correctRate: number;
}

export interface CorrectRateRow {
  subjectId: number;
  questionNumber: number;
  totalAnswered: number;
  correctCount: number;
  correctRate: number;
  difficultyLevel: CorrectRateDifficultyLevel;
}

const correctRateCache = new Map<string, CachedCorrectRate>();

function cacheKey(examId: number, examType: ExamType): string {
  return `${examId}:${examType}`;
}

function toNumber(value: bigint | number): number {
  if (typeof value === "bigint") return Number(value);
  return Number(value);
}

export function toCorrectRateDifficultyLevel(rate: number): CorrectRateDifficultyLevel {
  if (rate >= 80) return "EASY";
  if (rate >= 60) return "NORMAL";
  if (rate >= 40) return "HARD";
  return "VERY_HARD";
}

export function invalidateCorrectRateCache(examId?: number, examType?: ExamType) {
  if (examId && examType) {
    correctRateCache.delete(cacheKey(examId, examType));
    return;
  }

  if (examId && !examType) {
    for (const type of [ExamType.PUBLIC, ExamType.CAREER]) {
      correctRateCache.delete(cacheKey(examId, type));
    }
    return;
  }

  correctRateCache.clear();
}

export async function getCorrectRateRows(examId: number, examType: ExamType): Promise<CorrectRateRow[]> {
  const key = cacheKey(examId, examType);
  const now = Date.now();
  const cached = correctRateCache.get(key);
  if (cached && now - cached.at < CORRECT_RATE_CACHE_TTL) {
    return cached.rows;
  }

  const rawRows = await prisma.$queryRaw<RawCorrectRateRow[]>(Prisma.sql`
    SELECT
      ua."subjectId" AS "subjectId",
      ua."questionNumber" AS "questionNumber",
      COUNT(*) AS "totalAnswered",
      SUM(CASE WHEN ua."isCorrect" = true THEN 1 ELSE 0 END) AS "correctCount",
      ROUND(
        (SUM(CASE WHEN ua."isCorrect" = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*))::numeric,
        1
      ) AS "correctRate"
    FROM "UserAnswer" ua
    INNER JOIN "Submission" s ON ua."submissionId" = s.id
    WHERE s."examId" = ${examId}
      AND s."examType"::text = ${examType}
      AND s."isSuspicious" = false
    GROUP BY ua."subjectId", ua."questionNumber"
    ORDER BY ua."subjectId" ASC, ua."questionNumber" ASC
  `);

  const rows: CorrectRateRow[] = rawRows.map((row) => {
    const correctRate = Number(row.correctRate);
    return {
      subjectId: row.subjectId,
      questionNumber: row.questionNumber,
      totalAnswered: toNumber(row.totalAnswered),
      correctCount: toNumber(row.correctCount),
      correctRate,
      difficultyLevel: toCorrectRateDifficultyLevel(correctRate),
    };
  });

  correctRateCache.set(key, {
    at: now,
    rows,
  });

  return rows;
}
