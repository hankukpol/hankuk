import "server-only";

import { ExamType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getPoliceApplicantCount,
  getPoliceRecruitCount,
  getPoliceWrittenPassCount,
} from "@/lib/police/prediction-policy";
import {
  buildPoliceShadowPrediction,
  type PoliceShadowPredictionResult,
  type PoliceShadowScoreBand,
} from "@/lib/police/shadow-prediction-model";
import { buildPoliceScoredNonCutoffWhere } from "@/lib/police/written-policy";

export interface PoliceShadowPredictionRow extends PoliceShadowPredictionResult {
  regionId: number;
  regionName: string;
  examType: ExamType;
  recruitCount: number;
  writtenPassCount: number;
  applicantCount: number | null;
}

interface ScoreBandGroup {
  regionId: number;
  examType: ExamType;
  finalScore: number;
  _count: {
    _all: number;
  };
}

export async function buildPoliceShadowPredictionRows(params: {
  examId: number;
  includeCareerExamType: boolean;
}): Promise<{
  releaseNumber: 1 | 2 | 3 | 4;
  rows: PoliceShadowPredictionRow[];
}> {
  const examTypes: ExamType[] =
    params.includeCareerExamType
      ? [ExamType.PUBLIC, ExamType.CAREER]
      : [ExamType.PUBLIC];

  const [exam, quotas, latestRelease, scoreBandGroups] = await Promise.all([
    prisma.exam.findUnique({
      where: { id: params.examId },
      select: { id: true },
    }),
    prisma.examRegionQuota.findMany({
      where: {
        examId: params.examId,
        region: { isActive: true },
      },
      orderBy: { region: { name: "asc" } },
      select: {
        regionId: true,
        recruitCount: true,
        recruitCountCareer: true,
        applicantCount: true,
        applicantCountCareer: true,
        region: { select: { name: true } },
      },
    }),
    prisma.passCutRelease.findFirst({
      where: { examId: params.examId },
      orderBy: [{ releaseNumber: "desc" }, { id: "desc" }],
      select: { releaseNumber: true },
    }),
    prisma.submission.groupBy({
      by: ["regionId", "examType", "finalScore"],
      where: {
        examId: params.examId,
        isSuspicious: false,
        OR: examTypes.map((examType) => ({
          examType,
          ...buildPoliceScoredNonCutoffWhere(examType),
        })),
      },
      _count: { _all: true },
      orderBy: [{ regionId: "asc" }, { examType: "asc" }, { finalScore: "desc" }],
    }),
  ]);

  if (!exam) throw new Error("그림자 모델 대상 시험을 찾을 수 없습니다.");

  const rawReleaseNumber = latestRelease?.releaseNumber ?? 1;
  const releaseNumber = Math.min(4, Math.max(1, rawReleaseNumber)) as 1 | 2 | 3 | 4;
  const scoreBandMap = new Map<string, PoliceShadowScoreBand[]>();
  for (const group of scoreBandGroups as ScoreBandGroup[]) {
    if (group.examType !== ExamType.PUBLIC && group.examType !== ExamType.CAREER) continue;
    const key = `${group.regionId}-${group.examType}`;
    const scoreBands = scoreBandMap.get(key) ?? [];
    scoreBands.push({
      score: Number(group.finalScore),
      count: group._count._all,
    });
    scoreBandMap.set(key, scoreBands);
  }

  const rows: PoliceShadowPredictionRow[] = [];
  for (const quota of quotas) {
    for (const examType of examTypes) {
      const recruitCount = getPoliceRecruitCount(quota, examType);
      if (recruitCount < 1) continue;
      const writtenPassCount = getPoliceWrittenPassCount(recruitCount, examType);
      if (!writtenPassCount) continue;
      const applicantCount = getPoliceApplicantCount(quota, examType);
      const prediction = buildPoliceShadowPrediction({
        scoreBands: scoreBandMap.get(`${quota.regionId}-${examType}`) ?? [],
        recruitCount,
        writtenPassCount,
        applicantCount,
        releaseNumber,
      });
      rows.push({
        regionId: quota.regionId,
        regionName: quota.region.name,
        examType,
        recruitCount,
        writtenPassCount,
        applicantCount,
        ...prediction,
      });
    }
  }

  return { releaseNumber, rows };
}
