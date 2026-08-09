import { ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma, withPrismaConnectionRetry } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";
import { getServerTenantType } from "@/lib/tenant.server";
import { getTenantSubjectOrder, TENANT_EXAM_TYPES } from "@/lib/tenant-exam";
import { sortTenantRegions } from "@/lib/tenant-regions";
import type { TenantType } from "@/lib/tenant";
import {
  isActiveExamRouteError,
  requireSoleActiveExam,
} from "@/lib/active-exam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sortSubjectsByRule(
  tenantType: TenantType,
  examType: ExamType,
  subjects: Array<{
    id: number;
    name: string;
    questionCount: number;
    pointPerQuestion: number;
    maxScore: number;
  }>
) {
  const order = getTenantSubjectOrder(tenantType, examType);
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
  const tenantType = await getServerTenantType();
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";
  try {
    const payload = await withPrismaConnectionRetry(async () => {

  if (activeOnly) {
    await requireSoleActiveExam({
      db: prisma,
      tenantType,
      context: "api/exams?active=true",
    });
  }

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

  const allowedExamTypes = TENANT_EXAM_TYPES[tenantType];
  const [regionsRaw, subjectsRaw, settings] = await Promise.all([
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
      where: { examType: { in: [...allowedExamTypes] } },
      select: {
        id: true,
        examType: true,
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
          recruitCount: true,
          recruitCountCareer: true,
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
  const regions = sortTenantRegions(tenantType, regionsRaw)
    .map((r) => {
      const quota = quotaByRegionId.get(r.id);
      return tenantType === "police"
        ? {
            ...r,
            recruitCount: quota?.recruitCount ?? 0,
            recruitCountCareer: quota?.recruitCountCareer ?? 0,
          }
        : {
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
  const subjectGroups = Object.fromEntries(
    allowedExamTypes.map((examType) => [
      examType,
      examType !== ExamType.PUBLIC && !careerExamEnabled
        ? []
        : sortSubjectsByRule(
            tenantType,
            examType,
            subjectsRaw.filter((subject) => subject.examType === examType)
          ),
    ])
  );

  return {
    exams,
    activeExam,
    careerExamEnabled,
    regions,
    subjectGroups,
  };
    }, "api/exams GET");

    return NextResponse.json(payload);
  } catch (error) {
    if (isActiveExamRouteError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }
}
