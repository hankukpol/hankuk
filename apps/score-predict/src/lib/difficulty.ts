import "server-only";
import { ExamType } from "@prisma/client";
import { prisma, withPrismaConnectionRetry } from "@/lib/prisma";

export const DIFFICULTY_RATINGS = ["VERY_EASY", "EASY", "NORMAL", "HARD", "VERY_HARD"] as const;
export type DifficultyRatingValue = (typeof DIFFICULTY_RATINGS)[number];
export type DifficultyDominantLabel = "매우 쉬움" | "쉬움" | "보통" | "어려움" | "매우 어려움";

interface CountAccumulator {
  VERY_EASY: number;
  EASY: number;
  NORMAL: number;
  HARD: number;
  VERY_HARD: number;
}

export interface DifficultyOverallStat {
  veryEasy: number;
  easy: number;
  normal: number;
  hard: number;
  veryHard: number;
  easyCombined: number;
  hardCombined: number;
  dominantLabel: DifficultyDominantLabel;
}

export interface DifficultySubjectStat extends DifficultyOverallStat {
  subjectId: number;
  subjectName: string;
  examType: ExamType;
  responses: number;
}

export interface DifficultyStatsResult {
  examId: number;
  examName: string;
  totalResponses: number;
  overall: DifficultyOverallStat;
  subjects: DifficultySubjectStat[];
}

function toPercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

export function getDominantLabel(
  veryEasy: number,
  easy: number,
  normal: number,
  hard: number,
  veryHard: number
): DifficultyDominantLabel {
  const candidates: Array<{ label: DifficultyDominantLabel; value: number }> = [
    { label: "매우 쉬움", value: veryEasy },
    { label: "쉬움", value: easy },
    { label: "보통", value: normal },
    { label: "어려움", value: hard },
    { label: "매우 어려움", value: veryHard },
  ];

  candidates.sort((a, b) => b.value - a.value);
  return candidates[0]?.label ?? "보통";
}

function createEmptyCounts(): CountAccumulator {
  return {
    VERY_EASY: 0,
    EASY: 0,
    NORMAL: 0,
    HARD: 0,
    VERY_HARD: 0,
  };
}

function buildStatFromCounts(counts: CountAccumulator): DifficultyOverallStat {
  const total =
    counts.VERY_EASY + counts.EASY + counts.NORMAL + counts.HARD + counts.VERY_HARD;
  const veryEasy = toPercent(counts.VERY_EASY, total);
  const easy = toPercent(counts.EASY, total);
  const normal = toPercent(counts.NORMAL, total);
  const hard = toPercent(counts.HARD, total);
  const veryHard = toPercent(counts.VERY_HARD, total);

  return {
    veryEasy,
    easy,
    normal,
    hard,
    veryHard,
    easyCombined: toPercent(counts.VERY_EASY + counts.EASY, total),
    hardCombined: toPercent(counts.HARD + counts.VERY_HARD, total),
    dominantLabel: getDominantLabel(veryEasy, easy, normal, hard, veryHard),
  };
}

async function getTargetExam(examId?: number) {
  if (examId && Number.isInteger(examId) && examId > 0) {
    const selected = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, name: true },
    });
    if (selected) return selected;
  }

  const active = await prisma.exam.findFirst({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true, name: true },
  });
  if (active) return active;

  return prisma.exam.findFirst({
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true, name: true },
  });
}

export async function getDifficultyStats(examId?: number): Promise<DifficultyStatsResult | null> {
  return withPrismaConnectionRetry(async () => {
    const exam = await getTargetExam(examId);
    if (!exam) return null;

    const grouped = await prisma.difficultyRating.groupBy({
      by: ["subjectId", "rating"],
      where: {
        submission: {
          examId: exam.id,
        },
      },
      _count: {
        _all: true,
      },
    });

    if (grouped.length === 0) {
      return {
        examId: exam.id,
        examName: exam.name,
        totalResponses: 0,
        overall: buildStatFromCounts(createEmptyCounts()),
        subjects: [],
      };
    }

    const subjectIds = Array.from(new Set(grouped.map((row) => row.subjectId)));
    const subjects = await prisma.subject.findMany({
      where: {
        id: { in: subjectIds },
      },
      select: {
        id: true,
        name: true,
        examType: true,
      },
    });

    const subjectMap = new Map(subjects.map((subject) => [subject.id, subject] as const));
    const perSubject = new Map<number, CountAccumulator>();
    const overallCounts = createEmptyCounts();

    for (const row of grouped) {
      const rating = String(row.rating) as DifficultyRatingValue;
      if (!DIFFICULTY_RATINGS.includes(rating)) {
        continue;
      }

      const count = row._count._all;
      const current = perSubject.get(row.subjectId) ?? createEmptyCounts();
      current[rating] += count;
      perSubject.set(row.subjectId, current);
      overallCounts[rating] += count;
    }

    const subjectStats: DifficultySubjectStat[] = [];

    for (const [subjectId, counts] of perSubject.entries()) {
      const subject = subjectMap.get(subjectId);
      if (!subject) continue;

      const stat = buildStatFromCounts(counts);
      const responses =
        counts.VERY_EASY + counts.EASY + counts.NORMAL + counts.HARD + counts.VERY_HARD;

      subjectStats.push({
        subjectId,
        subjectName: subject.name,
        examType: subject.examType,
        responses,
        ...stat,
      });
    }

    subjectStats.sort((a, b) => {
      if (a.examType !== b.examType) {
        return a.examType === ExamType.PUBLIC ? -1 : 1;
      }
      return a.subjectId - b.subjectId;
    });

    const totalResponses =
      overallCounts.VERY_EASY +
      overallCounts.EASY +
      overallCounts.NORMAL +
      overallCounts.HARD +
      overallCounts.VERY_HARD;

    return {
      examId: exam.id,
      examName: exam.name,
      totalResponses,
      overall: buildStatFromCounts(overallCounts),
      subjects: subjectStats,
    };
  }, "difficulty stats");
}
