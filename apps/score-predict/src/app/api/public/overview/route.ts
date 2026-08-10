import { ExamType, Gender } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSoleActiveExam, isActiveExamRouteError } from "@/lib/active-exam";
import { resolveExamOperationStage } from "@/lib/exam-operation-stage";
import { prisma } from "@/lib/prisma";
import {
  canShowSampleAverage,
  canShowSampleOneMultiplePoint,
  getOneMultipleDisclosureTarget,
} from "@/lib/public-sample-policy";
import { getSiteSettingsUncached } from "@/lib/site-settings";
import {
  getTenantApplicantCount,
  getTenantRecruitmentCohorts,
  type TenantQuota,
} from "@/lib/tenant-calculations.server";
import { TENANT_EXAM_TYPES } from "@/lib/tenant-exam";
import { getServerTenantType } from "@/lib/tenant.server";
import type { TenantType } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function examTypeLabel(tenantType: TenantType, examType: ExamType, gender: Gender | null) {
  if (tenantType === "police") return examType === ExamType.CAREER ? "경행경채" : "공채";
  const genderLabel = gender === Gender.MALE ? " 남" : gender === Gender.FEMALE ? " 여" : "";
  if (examType === ExamType.CAREER_RESCUE) return `구조${genderLabel}`;
  if (examType === ExamType.CAREER_ACADEMIC) return `소방학과${genderLabel}`;
  if (examType === ExamType.CAREER_EMT) return `구급${genderLabel}`;
  return `공채${genderLabel}`;
}

function cohortKey(regionId: number, examType: ExamType, gender: Gender | null) {
  return `${regionId}:${examType}:${gender ?? "ALL"}`;
}

export async function GET() {
  try {
    const tenantType = await getServerTenantType();
    const activeExam = await requireSoleActiveExam({
      db: prisma,
      tenantType,
      context: `${tenantType}/public-overview`,
    });

    const [settings, quotas, latestRelease] = await Promise.all([
      getSiteSettingsUncached(),
      prisma.examRegionQuota.findMany({
        where: { examId: activeExam.id, region: { isActive: true } },
        include: { region: { select: { id: true, name: true } } },
        orderBy: { region: { name: "asc" } },
      }),
      prisma.passCutRelease.findFirst({
        where: { examId: activeExam.id },
        orderBy: [{ releaseNumber: "desc" }, { releasedAt: "desc" }],
        include: { snapshots: true },
      }),
    ]);

    const careerExamEnabled = Boolean(settings["site.careerExamEnabled"] ?? true);
    const examTypes = TENANT_EXAM_TYPES[tenantType].filter(
      (examType) => examType === ExamType.PUBLIC || careerExamEnabled
    );
    const snapshots = new Map(
      (latestRelease?.snapshots ?? []).map((snapshot) => [
        cohortKey(snapshot.regionId, snapshot.examType, snapshot.gender),
        snapshot,
      ])
    );

    const rows = quotas.flatMap((quota) =>
      examTypes.flatMap((examType) => {
        const cohorts = getTenantRecruitmentCohorts(
          tenantType,
          quota as TenantQuota,
          examType
        );

        return cohorts
          .filter((cohort) => cohort.recruitCount > 0)
          .map((cohort) => {
            const applicant = getTenantApplicantCount(
              tenantType,
              quota as TenantQuota,
              examType,
              cohort.gender
            );
            const snapshot = snapshots.get(cohortKey(quota.regionId, examType, cohort.gender));
            const participantCount = snapshot?.participantCount ?? 0;
            const averageVisible =
              canShowSampleAverage(participantCount) &&
              typeof snapshot?.averageScore === "number";
            const oneMultipleVisible =
              canShowSampleOneMultiplePoint(participantCount, cohort.recruitCount) &&
              typeof snapshot?.oneMultipleCutScore === "number";

            return {
              regionId: quota.regionId,
              regionName: quota.region.name,
              examType,
              examTypeLabel: examTypeLabel(tenantType, examType, cohort.gender),
              gender: cohort.gender,
              recruitCount: cohort.recruitCount,
              applicantCount: applicant.applicantCount,
              competitionRate:
                applicant.applicantCount !== null && cohort.recruitCount > 0
                  ? Number((applicant.applicantCount / cohort.recruitCount).toFixed(2))
                  : null,
              participantCount,
              averageScore: averageVisible ? snapshot?.averageScore ?? null : null,
              oneMultipleCutScore: oneMultipleVisible
                ? snapshot?.oneMultipleCutScore ?? null
                : null,
              averageVisible,
              oneMultipleVisible,
               oneMultipleDisclosureTarget: getOneMultipleDisclosureTarget(cohort.recruitCount),
               snapshotPublished: Boolean(snapshot),
               snapshotStatus: snapshot?.status ?? null,
            };
          });
      })
    );

    const latestReleaseNumber = latestRelease?.releaseNumber ?? null;
    const operationStage = resolveExamOperationStage({
      preRegistrationEnabled:
        tenantType === "police" && Boolean(settings["site.preRegistrationEnabled"] ?? true),
      answerInputEnabled: Boolean(settings["site.answerInputEnabled"] ?? false),
      latestReleaseNumber,
    });

    return NextResponse.json(
      {
        tenantType,
        exam: {
          id: activeExam.id,
          name: activeExam.name,
          year: activeExam.year,
          round: activeExam.round,
          examDate: activeExam.examDate,
        },
        operationStage,
        latestRelease: latestRelease
          ? {
              releaseNumber: latestRelease.releaseNumber,
              releasedAt: latestRelease.releasedAt,
            }
          : null,
        rows,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    if (isActiveExamRouteError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("공개 시험 현황 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "공개 시험 현황을 불러오지 못했습니다." }, { status: 500 });
  }
}
