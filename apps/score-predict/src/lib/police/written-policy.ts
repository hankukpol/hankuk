import { ExamType, Prisma, SubmissionScoringStatus } from "@prisma/client";
import { SUBJECT_CUTOFF_RATE } from "@/lib/police/policy";

export const POLICE_WRITTEN_MAX_SCORE = 250;
export const POLICE_CAREER_CUTOFF_RATE = 0.6;

interface SubjectCutoffInput {
  isFailed: boolean;
}

interface SubjectBonusInput {
  rawScore: number;
  maxScore: number;
}

export function getPoliceCareerCutoffScore(maxScore = POLICE_WRITTEN_MAX_SCORE): number {
  return Number((Math.max(0, maxScore) * POLICE_CAREER_CUTOFF_RATE).toFixed(2));
}

export function hasPoliceWrittenCutoff(params: {
  examType: ExamType;
  totalScore: number;
  subjectScores: readonly SubjectCutoffInput[];
  maxScore?: number;
}): boolean {
  if (params.examType === ExamType.CAREER) {
    return params.totalScore < getPoliceCareerCutoffScore(params.maxScore);
  }
  if (params.examType === ExamType.PUBLIC) {
    return params.subjectScores.some((score) => score.isFailed);
  }
  throw new Error("경찰 서비스에서 사용할 수 없는 채용유형입니다.");
}

export function hasPoliceWrittenBonusSubjectCutoff(
  subjectScores: readonly SubjectBonusInput[]
): boolean {
  return subjectScores.some(
    (score) => score.rawScore < Number((score.maxScore * SUBJECT_CUTOFF_RATE).toFixed(2))
  );
}

export function buildPoliceScoredNonCutoffWhere(
  examType: ExamType
): Prisma.SubmissionWhereInput {
  const common: Prisma.SubmissionWhereInput = {
    scoringStatus: SubmissionScoringStatus.SCORED,
    subjectScores: { some: {} },
  };

  if (examType === ExamType.CAREER) {
    return {
      ...common,
      totalScore: { gte: getPoliceCareerCutoffScore() },
    };
  }
  if (examType === ExamType.PUBLIC) {
    return {
      ...common,
      subjectScores: { some: {}, none: { isFailed: true } },
    };
  }
  throw new Error("경찰 서비스에서 사용할 수 없는 채용유형입니다.");
}

export function getPoliceScoredNonCutoffSql(examType: ExamType): Prisma.Sql {
  if (examType === ExamType.CAREER) {
    return Prisma.sql`
      AND s."scoringStatus" = CAST(${SubmissionScoringStatus.SCORED} AS "SubmissionScoringStatus")
      AND s."totalScore" >= ${getPoliceCareerCutoffScore()}
    `;
  }
  if (examType === ExamType.PUBLIC) {
    return Prisma.sql`
      AND s."scoringStatus" = CAST(${SubmissionScoringStatus.SCORED} AS "SubmissionScoringStatus")
      AND NOT EXISTS (
        SELECT 1
        FROM "SubjectScore" failed_subject
        WHERE failed_subject."submissionId" = s.id
          AND failed_subject."isFailed" = true
      )
    `;
  }
  throw new Error("경찰 서비스에서 사용할 수 없는 채용유형입니다.");
}
