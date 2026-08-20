import "server-only";

import {
  CalibrationScoreBasis,
  CalibrationSnapshotPhase,
  CalibrationSourceType,
  ExamType,
  Prisma,
  type BonusType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getPoliceApplicantCount,
  getPolicePassMultiple,
  getPoliceRecruitCount,
} from "@/lib/police/prediction-policy";
import { POLICE_PREDICTION_MODEL_VERSION } from "@/lib/police/prediction-model";
import { hasPoliceWrittenCutoff } from "@/lib/police/written-policy";

interface DistributionBand {
  score: number;
  count: number;
  rank: number;
  endRank: number;
}

export interface OfficialCalibrationInput {
  cutScore: number;
  passCount: number;
  scoreBasis: CalibrationScoreBasis;
  sourceType: CalibrationSourceType;
  sourceReference: string;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildDistribution(values: number[]): DistributionBand[] {
  const countByScore = new Map<number, number>();
  for (const value of values) {
    const score = roundNumber(value);
    countByScore.set(score, (countByScore.get(score) ?? 0) + 1);
  }

  let processed = 0;
  return [...countByScore.entries()]
    .sort(([left], [right]) => right - left)
    .map(([score, count]) => {
      const band = { score, count, rank: processed + 1, endRank: processed + count };
      processed += count;
      return band;
    });
}

function scoreAtRank(distribution: DistributionBand[], rank: number): number | null {
  if (!Number.isInteger(rank) || rank < 1) return null;
  return distribution.find((band) => band.rank <= rank && rank <= band.endRank)?.score ?? null;
}

function tieCountAtRank(distribution: DistributionBand[], rank: number): number | null {
  if (!Number.isInteger(rank) || rank < 1) return null;
  return distribution.find((band) => band.rank <= rank && rank <= band.endRank)?.count ?? null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function capturePoliceCalibrationSnapshots(params: {
  examId: number;
  phase: CalibrationSnapshotPhase;
  regionId?: number;
  examType?: ExamType;
  official?: OfficialCalibrationInput;
}) {
  const exam = await prisma.exam.findUnique({
    where: { id: params.examId },
    select: {
      id: true,
      policeWrittenPassMultiple: true,
      policePredictionModelVersion: true,
    },
  });
  if (!exam) throw new Error("캘리브레이션 대상 시험을 찾을 수 없습니다.");

  const quotas = await prisma.examRegionQuota.findMany({
    where: {
      examId: params.examId,
      ...(params.regionId ? { regionId: params.regionId } : {}),
      region: {
        isActive: true,
      },
    },
    select: {
      regionId: true,
      recruitCount: true,
      recruitCountCareer: true,
      applicantCount: true,
      applicantCountCareer: true,
    },
  });
  const examTypes = params.examType
    ? [params.examType]
    : [ExamType.PUBLIC, ExamType.CAREER];
  const results: Array<{ id: number; regionId: number; examType: ExamType }> = [];

  for (const quota of quotas) {
    for (const examType of examTypes) {
      if (examType !== ExamType.PUBLIC && examType !== ExamType.CAREER) continue;
      const recruitCount = getPoliceRecruitCount(quota, examType);
      if (recruitCount < 1) continue;

      const submissions = await prisma.submission.findMany({
        where: {
          examId: params.examId,
          regionId: quota.regionId,
          examType,
          subjectScores: { some: {} },
        },
        select: {
          totalScore: true,
          finalScore: true,
          bonusType: true,
          isSuspicious: true,
          subjectScores: {
            select: {
              rawScore: true,
              isFailed: true,
              subject: { select: { id: true, name: true } },
            },
          },
        },
      });

      const suspiciousCount = submissions.filter((row) => row.isSuspicious).length;
      const nonSuspicious = submissions.filter((row) => !row.isSuspicious);
      const isCutoff = (row: (typeof nonSuspicious)[number]) =>
        hasPoliceWrittenCutoff({
          examType,
          totalScore: Number(row.totalScore),
          subjectScores: row.subjectScores,
        });
      const cutoffCount = nonSuspicious.filter(isCutoff).length;
      const valid = nonSuspicious.filter((row) => !isCutoff(row));
      const rawValues = valid.map((row) => Number(row.totalScore));
      const finalValues = valid.map((row) => Number(row.finalScore));
      const rawDistribution = buildDistribution(rawValues);
      const finalDistribution = buildDistribution(finalValues);
      const bonusTypeCounts = valid.reduce<Record<BonusType, number>>((counts, row) => {
        counts[row.bonusType] = (counts[row.bonusType] ?? 0) + 1;
        return counts;
      }, {} as Record<BonusType, number>);

      const subjectRows = new Map<number, { subjectId: number; subjectName: string; values: number[] }>();
      for (const submission of nonSuspicious) {
        for (const score of submission.subjectScores) {
          const current = subjectRows.get(score.subject.id) ?? {
            subjectId: score.subject.id,
            subjectName: score.subject.name,
            values: [],
          };
          current.values.push(Number(score.rawScore));
          subjectRows.set(score.subject.id, current);
        }
      }
      const subjectScoreDistributions = [...subjectRows.values()].map((subject) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        distribution: buildDistribution(subject.values),
      }));

      const officialValues = params.official?.scoreBasis === CalibrationScoreBasis.RAW
        ? rawValues
        : finalValues;
      const officialCutAboveSampleRatio = params.official
        ? roundNumber(
            officialValues.filter((score) => score >= params.official!.cutScore).length / recruitCount
          )
        : null;
      const passMultiple = getPolicePassMultiple(recruitCount, examType) ?? 2;
      const modelVersion = exam.policePredictionModelVersion
        ?? POLICE_PREDICTION_MODEL_VERSION;

      const snapshot = await prisma.predictionCalibrationSnapshot.upsert({
        where: {
          examId_regionId_examType_phase_modelVersion: {
            examId: params.examId,
            regionId: quota.regionId,
            examType,
            phase: params.phase,
            modelVersion,
          },
        },
        update: {
          capturedAt: new Date(),
          recruitCount,
          applicantCount: getPoliceApplicantCount(quota, examType),
          passMultiple,
          modelVersion,
          validParticipantCount: valid.length,
          cutoffCount,
          suspiciousCount,
          rawAverageScore: average(rawValues),
          finalAverageScore: average(finalValues),
          sampleRankAtRecruitCountRawScore: scoreAtRank(rawDistribution, recruitCount),
          sampleRankAtRecruitCountFinalScore: scoreAtRank(finalDistribution, recruitCount),
          rawBoundaryTieCount: tieCountAtRank(rawDistribution, recruitCount),
          finalBoundaryTieCount: tieCountAtRank(finalDistribution, recruitCount),
          rawScoreDistribution: toInputJson(rawDistribution),
          finalScoreDistribution: toInputJson(finalDistribution),
          bonusTypeCounts: toInputJson(bonusTypeCounts),
          subjectScoreDistributions: toInputJson(subjectScoreDistributions),
          officialCutScore: params.official?.cutScore ?? null,
          officialPassCount: params.official?.passCount ?? null,
          officialScoreBasis: params.official?.scoreBasis ?? null,
          officialSourceType: params.official?.sourceType ?? null,
          officialSourceReference: params.official?.sourceReference ?? null,
          officialCutAboveSampleRatio,
        },
        create: {
          examId: params.examId,
          regionId: quota.regionId,
          examType,
          phase: params.phase,
          recruitCount,
          applicantCount: getPoliceApplicantCount(quota, examType),
          passMultiple,
          modelVersion,
          validParticipantCount: valid.length,
          cutoffCount,
          suspiciousCount,
          rawAverageScore: average(rawValues),
          finalAverageScore: average(finalValues),
          sampleRankAtRecruitCountRawScore: scoreAtRank(rawDistribution, recruitCount),
          sampleRankAtRecruitCountFinalScore: scoreAtRank(finalDistribution, recruitCount),
          rawBoundaryTieCount: tieCountAtRank(rawDistribution, recruitCount),
          finalBoundaryTieCount: tieCountAtRank(finalDistribution, recruitCount),
          rawScoreDistribution: toInputJson(rawDistribution),
          finalScoreDistribution: toInputJson(finalDistribution),
          bonusTypeCounts: toInputJson(bonusTypeCounts),
          subjectScoreDistributions: toInputJson(subjectScoreDistributions),
          officialCutScore: params.official?.cutScore ?? null,
          officialPassCount: params.official?.passCount ?? null,
          officialScoreBasis: params.official?.scoreBasis ?? null,
          officialSourceType: params.official?.sourceType ?? null,
          officialSourceReference: params.official?.sourceReference ?? null,
          officialCutAboveSampleRatio,
        },
        select: { id: true, regionId: true, examType: true },
      });
      results.push(snapshot);
    }
  }

  return results;
}
