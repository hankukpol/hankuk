import { ExamType, Gender } from "@prisma/client";
import { estimateApplicants } from "@/lib/policy";
import { getLikelyMultiple, getPassMultiple } from "@/lib/prediction";
import { prisma } from "@/lib/prisma";

interface QuotaRow {
  regionId: number;
  regionName: string;
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

interface ParticipantStatRow {
  regionId: number;
  examType: ExamType;
  gender: Gender;
  _count: {
    _all: number;
  };
  _sum: {
    finalScore: number | null;
  };
}

interface ScoreBandStatRow {
  regionId: number;
  examType: ExamType;
  gender: Gender;
  finalScore: number;
  _count: {
    _all: number;
  };
}

type CohortGender = Gender | null;

interface CohortSpec {
  examType: ExamType;
  gender: CohortGender;
  recruitCount: number;
  applicantCount: number | null;
  isApplicantCountExact: boolean;
}

type ParticipantAggregate = {
  participantCount: number;
  scoreSum: number;
};

export interface PassCutPredictionRow {
  regionId: number;
  regionName: string;
  examType: ExamType;
  gender: CohortGender;
  recruitCount: number;
  applicantCount: number | null;
  estimatedApplicants: number;
  isApplicantCountExact: boolean;
  competitionRate: number | null;
  participantCount: number;
  averageScore: number | null;
  oneMultipleCutScore: number | null;
  sureMinScore: number | null;
  likelyMinScore: number | null;
  possibleMinScore: number | null;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function toApplicantInfo(raw: number | null): { applicantCount: number | null; isApplicantCountExact: boolean } {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return {
      applicantCount: Math.floor(raw),
      isApplicantCountExact: true,
    };
  }

  return {
    applicantCount: null,
    isApplicantCountExact: false,
  };
}

function buildCohortKey(regionId: number, examType: ExamType, gender: CohortGender): string {
  const genderKey = gender ?? "ALL";
  return `${regionId}-${examType}-${genderKey}`;
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

function getScoreRange(
  scoreBands: Array<{ score: number; count: number }>,
  startRank: number,
  endRank: number
): { min: number | null; max: number | null } {
  if (!Number.isInteger(startRank) || !Number.isInteger(endRank) || startRank > endRank || startRank < 1) {
    return { min: null, max: null };
  }

  return {
    max: getScoreAtRank(scoreBands, startRank),
    min: getScoreAtRank(scoreBands, endRank),
  };
}

function toSortedScoreBands(scoreCountMap: Map<number, number>): Array<{ score: number; count: number }> {
  return Array.from(scoreCountMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([score, count]) => ({
      score: Number(score),
      count,
    }));
}

function mergeScoreCount(
  target: Map<number, number>,
  source: Map<number, number> | undefined
): void {
  if (!source) return;
  for (const [score, count] of source.entries()) {
    target.set(score, (target.get(score) ?? 0) + count);
  }
}

function buildCohortsForQuota(
  quota: QuotaRow,
  examTypes: ExamType[]
): CohortSpec[] {
  const cohorts: CohortSpec[] = [];

  for (const examType of examTypes) {
    if (examType === ExamType.PUBLIC) {
      cohorts.push({
        examType,
        gender: Gender.MALE,
        recruitCount: quota.recruitPublicMale,
        ...toApplicantInfo(quota.applicantPublicMale),
      });
      cohorts.push({
        examType,
        gender: Gender.FEMALE,
        recruitCount: quota.recruitPublicFemale,
        ...toApplicantInfo(quota.applicantPublicFemale),
      });
      continue;
    }

    if (examType === ExamType.CAREER_RESCUE) {
      cohorts.push({
        examType,
        gender: Gender.MALE,
        recruitCount: quota.recruitRescue,
        ...toApplicantInfo(quota.applicantRescue),
      });
      continue;
    }

    if (examType === ExamType.CAREER_ACADEMIC) {
      if (quota.recruitAcademicCombined > 0) {
        cohorts.push({
          examType,
          gender: null,
          recruitCount: quota.recruitAcademicCombined,
          ...toApplicantInfo(quota.applicantAcademicCombined),
        });
      } else {
        cohorts.push({
          examType,
          gender: Gender.MALE,
          recruitCount: quota.recruitAcademicMale,
          ...toApplicantInfo(quota.applicantAcademicMale),
        });
        cohorts.push({
          examType,
          gender: Gender.FEMALE,
          recruitCount: quota.recruitAcademicFemale,
          ...toApplicantInfo(quota.applicantAcademicFemale),
        });
      }
      continue;
    }

    cohorts.push({
      examType,
      gender: Gender.MALE,
      recruitCount: quota.recruitEmtMale,
      ...toApplicantInfo(quota.applicantEmtMale),
    });
    cohorts.push({
      examType,
      gender: Gender.FEMALE,
      recruitCount: quota.recruitEmtFemale,
      ...toApplicantInfo(quota.applicantEmtFemale),
    });
  }

  return cohorts.filter((cohort) => Number.isInteger(cohort.recruitCount) && cohort.recruitCount > 0);
}

function getParticipantAggregateForCohort(
  participantMap: Map<string, ParticipantAggregate>,
  regionId: number,
  examType: ExamType,
  gender: CohortGender
): { participantCount: number; averageScore: number | null } {
  if (gender !== null) {
    const exact = participantMap.get(buildCohortKey(regionId, examType, gender));
    if (!exact || exact.participantCount < 1) {
      return { participantCount: 0, averageScore: null };
    }
    return {
      participantCount: exact.participantCount,
      averageScore: roundNumber(exact.scoreSum / exact.participantCount),
    };
  }

  const male = participantMap.get(buildCohortKey(regionId, examType, Gender.MALE));
  const female = participantMap.get(buildCohortKey(regionId, examType, Gender.FEMALE));
  const participantCount = (male?.participantCount ?? 0) + (female?.participantCount ?? 0);
  const scoreSum = (male?.scoreSum ?? 0) + (female?.scoreSum ?? 0);
  if (participantCount < 1) {
    return { participantCount: 0, averageScore: null };
  }

  return {
    participantCount,
    averageScore: roundNumber(scoreSum / participantCount),
  };
}

function getScoreBandsForCohort(
  scoreBandMap: Map<string, Map<number, number>>,
  regionId: number,
  examType: ExamType,
  gender: CohortGender
): Array<{ score: number; count: number }> {
  if (gender !== null) {
    return toSortedScoreBands(scoreBandMap.get(buildCohortKey(regionId, examType, gender)) ?? new Map());
  }

  const merged = new Map<number, number>();
  mergeScoreCount(merged, scoreBandMap.get(buildCohortKey(regionId, examType, Gender.MALE)));
  mergeScoreCount(merged, scoreBandMap.get(buildCohortKey(regionId, examType, Gender.FEMALE)));
  return toSortedScoreBands(merged);
}

export async function buildPassCutPredictionRows(params: {
  examId: number;
  includeCareerExamType: boolean;
}): Promise<PassCutPredictionRow[]> {
  const examTypes: ExamType[] = params.includeCareerExamType
    ? [ExamType.PUBLIC, ExamType.CAREER_RESCUE, ExamType.CAREER_ACADEMIC, ExamType.CAREER_EMT]
    : [ExamType.PUBLIC];

  const [quotaRows, participantStats, scoreBandStats] = await Promise.all([
    prisma.$queryRaw<QuotaRow[]>`
      SELECT
        q."regionId",
        r."name" AS "regionName",
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
      WHERE q."examId" = ${params.examId}
      ORDER BY r."name" ASC
    `,
    prisma.submission.groupBy({
      by: ["regionId", "examType", "gender"],
      where: {
        examId: params.examId,
        isSuspicious: false,
        subjectScores: {
          some: {},
          none: {
            isFailed: true,
          },
        },
      },
      _count: {
        _all: true,
      },
      _sum: {
        finalScore: true,
      },
    }),
    prisma.submission.groupBy({
      by: ["regionId", "examType", "gender", "finalScore"],
      where: {
        examId: params.examId,
        isSuspicious: false,
        subjectScores: {
          some: {},
          none: {
            isFailed: true,
          },
        },
      },
      _count: {
        _all: true,
      },
      orderBy: [{ regionId: "asc" }, { examType: "asc" }, { gender: "asc" }, { finalScore: "desc" }],
    }),
  ]);

  const participantMap = new Map<string, ParticipantAggregate>();
  for (const row of participantStats as ParticipantStatRow[]) {
    participantMap.set(
      buildCohortKey(row.regionId, row.examType, row.gender),
      {
        participantCount: row._count._all,
        scoreSum: row._sum.finalScore === null ? 0 : Number(row._sum.finalScore),
      }
    );
  }

  const scoreBandMap = new Map<string, Map<number, number>>();
  for (const row of scoreBandStats as ScoreBandStatRow[]) {
    const key = buildCohortKey(row.regionId, row.examType, row.gender);
    const byScore = scoreBandMap.get(key) ?? new Map<number, number>();
    byScore.set(Number(row.finalScore), (byScore.get(Number(row.finalScore)) ?? 0) + row._count._all);
    scoreBandMap.set(key, byScore);
  }

  const rows: PassCutPredictionRow[] = [];

  for (const quota of quotaRows) {
    const cohorts = buildCohortsForQuota(quota, examTypes);
    for (const cohort of cohorts) {
      const recruitCount = cohort.recruitCount;
      const participant = getParticipantAggregateForCohort(
        participantMap,
        quota.regionId,
        cohort.examType,
        cohort.gender
      );
      const scoreBands = getScoreBandsForCohort(
        scoreBandMap,
        quota.regionId,
        cohort.examType,
        cohort.gender
      );

      const competitionRate =
        recruitCount > 0 && cohort.applicantCount !== null
          ? roundNumber(cohort.applicantCount / recruitCount)
          : null;

      const oneMultipleCutScore = getScoreAtRank(scoreBands, recruitCount);
      const passMultiple = getPassMultiple(recruitCount, cohort.examType);
      const likelyMultiple = getLikelyMultiple(passMultiple);
      const likelyMaxRank = Math.max(1, Math.floor(recruitCount * likelyMultiple));
      const passCount = Math.ceil(recruitCount * passMultiple);

      const likelyRange = getScoreRange(scoreBands, recruitCount + 1, likelyMaxRank);
      const possibleRange = getScoreRange(scoreBands, likelyMaxRank + 1, passCount);
      const sureMinScore = getScoreAtRank(scoreBands, recruitCount);

      rows.push({
        regionId: quota.regionId,
        regionName: quota.regionName,
        examType: cohort.examType,
        gender: cohort.gender,
        recruitCount,
        applicantCount: cohort.applicantCount,
        estimatedApplicants: estimateApplicants({
          applicantCount: cohort.applicantCount,
          recruitCount,
        }),
        isApplicantCountExact: cohort.isApplicantCountExact,
        competitionRate,
        participantCount: participant.participantCount,
        averageScore: participant.averageScore,
        oneMultipleCutScore,
        sureMinScore,
        likelyMinScore: likelyRange.min,
        possibleMinScore: possibleRange.min,
      });
    }
  }

  return rows;
}

export function getCurrentPassCutSnapshot(
  rows: PassCutPredictionRow[],
  regionId: number,
  examType: ExamType,
  gender: CohortGender
): {
  participantCount: number;
  recruitCount: number;
  applicantCount: number | null;
  averageScore: number | null;
  oneMultipleCutScore: number | null;
  sureMinScore: number | null;
  likelyMinScore: number | null;
  possibleMinScore: number | null;
} {
  const matched =
    rows.find(
      (row) =>
        row.regionId === regionId &&
        row.examType === examType &&
        row.gender === gender
    ) ??
    (gender !== null
      ? rows.find(
          (row) =>
            row.regionId === regionId &&
            row.examType === examType &&
            row.gender === null
        )
      : undefined);

  if (!matched) {
    return {
      participantCount: 0,
      recruitCount: 0,
      applicantCount: null,
      averageScore: null,
      oneMultipleCutScore: null,
      sureMinScore: null,
      likelyMinScore: null,
      possibleMinScore: null,
    };
  }

  return {
    participantCount: matched.participantCount,
    recruitCount: matched.recruitCount,
    applicantCount: matched.applicantCount,
    averageScore: matched.averageScore,
    oneMultipleCutScore: matched.oneMultipleCutScore,
    sureMinScore: matched.sureMinScore,
    likelyMinScore: matched.likelyMinScore,
    possibleMinScore: matched.possibleMinScore,
  };
}
