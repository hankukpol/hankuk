import { ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma, withPrismaConnectionRetry } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUBJECT_ORDER: Partial<Record<ExamType, string[]>> = {
  [ExamType.PUBLIC]: ["소방학개론", "소방관계법규", "행정법총론"],
  [ExamType.CAREER_RESCUE]: ["소방학개론", "소방관계법규"],
  [ExamType.CAREER_ACADEMIC]: ["소방학개론", "소방관계법규"],
  [ExamType.CAREER_EMT]: ["소방학개론", "응급처치학개론"],
};

const REGION_ORDER = [
  "강원",
  "경기남부",
  "경기북",
  "경남",
  "경북",
  "광주",
  "대구",
  "대전",
  "부산",
  "서울",
  "101경비단",
  "세종",
  "울산",
  "인천",
  "전남",
  "전북",
  "충남",
  "충북",
  "제주",
] as const;

function regionOrderOf(name: string): number {
  const index = REGION_ORDER.findIndex((keyword) => name.includes(keyword));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sortSubjectsByRule(
  examType: ExamType,
  subjects: Array<{
    id: number;
    name: string;
    questionCount: number;
    pointPerQuestion: number;
    maxScore: number;
  }>
) {
  const order = SUBJECT_ORDER[examType] ?? [];
  return [...subjects].sort((a, b) => {
    const aIndex = order.indexOf(a.name);
    const bIndex = order.indexOf(b.name);
    const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (safeA !== safeB) return safeA - safeB;
    return a.id - b.id;
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";
  const payload = await withPrismaConnectionRetry(async () => {

  const exams = await prisma.exam.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { examDate: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      year: true,
      round: true,
      examDate: true,
      isActive: true,
    },
  });

  const activeExam = exams.find((exam) => exam.isActive) ?? null;

  const [regionsRaw, publicSubjectsRaw, careerRescueSubjectsRaw, careerAcademicSubjectsRaw, careerEmtSubjectsRaw, settings] = await Promise.all([
    prisma.region.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    }),
    prisma.subject.findMany({
      where: { examType: ExamType.PUBLIC },
      select: {
        id: true,
        name: true,
        questionCount: true,
        pointPerQuestion: true,
        maxScore: true,
      },
    }),
    prisma.subject.findMany({
      where: { examType: ExamType.CAREER_RESCUE },
      select: {
        id: true,
        name: true,
        questionCount: true,
        pointPerQuestion: true,
        maxScore: true,
      },
    }),
    prisma.subject.findMany({
      where: { examType: ExamType.CAREER_ACADEMIC },
      select: {
        id: true,
        name: true,
        questionCount: true,
        pointPerQuestion: true,
        maxScore: true,
      },
    }),
    prisma.subject.findMany({
      where: { examType: ExamType.CAREER_EMT },
      select: {
        id: true,
        name: true,
        questionCount: true,
        pointPerQuestion: true,
        maxScore: true,
      },
    }),
    getSiteSettingsUncached(),
  ]);

  // 활성 시험의 모집인원 조회
  const quotas = activeExam
    ? await prisma.examRegionQuota.findMany({
        where: { examId: activeExam.id },
        select: {
          regionId: true,
          recruitPublicMale: true,
          recruitPublicFemale: true,
          recruitRescue: true,
          recruitAcademicMale: true,
          recruitAcademicFemale: true,
          recruitAcademicCombined: true,
          recruitEmtMale: true,
          recruitEmtFemale: true,
        },
      })
    : [];
  const quotaByRegionId = new Map(quotas.map((q) => [q.regionId, q]));

  const careerExamEnabled = Boolean(settings["site.careerExamEnabled"] ?? true);
  const regions = [...regionsRaw]
    .sort((a, b) => {
      const orderA = regionOrderOf(a.name);
      const orderB = regionOrderOf(b.name);
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, "ko-KR");
    })
    .map((r) => {
      const quota = quotaByRegionId.get(r.id);
      return {
        ...r,
        recruitPublicMale: quota?.recruitPublicMale ?? 0,
        recruitPublicFemale: quota?.recruitPublicFemale ?? 0,
        recruitRescue: quota?.recruitRescue ?? 0,
        recruitAcademicMale: quota?.recruitAcademicMale ?? 0,
        recruitAcademicFemale: quota?.recruitAcademicFemale ?? 0,
        recruitAcademicCombined: quota?.recruitAcademicCombined ?? 0,
        recruitEmtMale: quota?.recruitEmtMale ?? 0,
        recruitEmtFemale: quota?.recruitEmtFemale ?? 0,
      };
    });
  const publicSubjects = sortSubjectsByRule(ExamType.PUBLIC, publicSubjectsRaw);
  const careerRescueSubjects = careerExamEnabled
    ? sortSubjectsByRule(ExamType.CAREER_RESCUE, careerRescueSubjectsRaw)
    : [];
  const careerAcademicSubjects = careerExamEnabled
    ? sortSubjectsByRule(ExamType.CAREER_ACADEMIC, careerAcademicSubjectsRaw)
    : [];
  const careerEmtSubjects = careerExamEnabled
    ? sortSubjectsByRule(ExamType.CAREER_EMT, careerEmtSubjectsRaw)
    : [];

  return {
    exams,
    activeExam,
    careerExamEnabled,
    regions,
    subjectGroups: {
      PUBLIC: publicSubjects,
      CAREER_RESCUE: careerRescueSubjects,
      CAREER_ACADEMIC: careerAcademicSubjects,
      CAREER_EMT: careerEmtSubjects,
    },
  };
  }, "api/exams GET");

  return NextResponse.json(payload);
}
