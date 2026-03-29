import { ExamType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { validateAdminExamNumberRange } from "@/lib/exam-number";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface QuotaUpdateItem {
  regionId?: unknown;
  isActive?: unknown;
  recruitPublicMale?: unknown;
  recruitPublicFemale?: unknown;
  recruitRescue?: unknown;
  recruitAcademicMale?: unknown;
  recruitAcademicFemale?: unknown;
  recruitAcademicCombined?: unknown;
  recruitEmtMale?: unknown;
  recruitEmtFemale?: unknown;
  applicantPublicMale?: unknown;
  applicantPublicFemale?: unknown;
  applicantRescue?: unknown;
  applicantAcademicMale?: unknown;
  applicantAcademicFemale?: unknown;
  applicantAcademicCombined?: unknown;
  applicantEmtMale?: unknown;
  applicantEmtFemale?: unknown;
  examNumberStartPublicMale?: unknown;
  examNumberEndPublicMale?: unknown;
  examNumberStartPublicFemale?: unknown;
  examNumberEndPublicFemale?: unknown;
  examNumberStartCareerRescue?: unknown;
  examNumberEndCareerRescue?: unknown;
  examNumberStartCareerAcademicMale?: unknown;
  examNumberEndCareerAcademicMale?: unknown;
  examNumberStartCareerAcademicFemale?: unknown;
  examNumberEndCareerAcademicFemale?: unknown;
  examNumberStartCareerAcademicCombined?: unknown;
  examNumberEndCareerAcademicCombined?: unknown;
  examNumberStartCareerEmtMale?: unknown;
  examNumberEndCareerEmtMale?: unknown;
  examNumberStartCareerEmtFemale?: unknown;
  examNumberEndCareerEmtFemale?: unknown;
}

interface QuotaUpdatePayload {
  examId?: unknown;
  regions?: QuotaUpdateItem[];
}

type QuotaUpsertData = {
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
  examNumberStartPublicMale: string | null;
  examNumberEndPublicMale: string | null;
  examNumberStartPublicFemale: string | null;
  examNumberEndPublicFemale: string | null;
  examNumberStartCareerRescue: string | null;
  examNumberEndCareerRescue: string | null;
  examNumberStartCareerAcademicMale: string | null;
  examNumberEndCareerAcademicMale: string | null;
  examNumberStartCareerAcademicFemale: string | null;
  examNumberEndCareerAcademicFemale: string | null;
  examNumberStartCareerAcademicCombined: string | null;
  examNumberEndCareerAcademicCombined: string | null;
  examNumberStartCareerEmtMale: string | null;
  examNumberEndCareerEmtMale: string | null;
  examNumberStartCareerEmtFemale: string | null;
  examNumberEndCareerEmtFemale: string | null;
  examNumberStart: string | null;
  examNumberEnd: string | null;
};

function buildQuotaUpsertQuery(params: {
  examId: number;
  regionId: number;
  quotaData: QuotaUpsertData;
}) {
  const { examId, regionId, quotaData } = params;

  return Prisma.sql`
    INSERT INTO "exam_region_quotas" (
      "examId",
      "regionId",
      "recruitPublicMale",
      "recruitPublicFemale",
      "recruitRescue",
      "recruitAcademicMale",
      "recruitAcademicFemale",
      "recruitAcademicCombined",
      "recruitEmtMale",
      "recruitEmtFemale",
      "applicantPublicMale",
      "applicantPublicFemale",
      "applicantRescue",
      "applicantAcademicMale",
      "applicantAcademicFemale",
      "applicantAcademicCombined",
      "applicantEmtMale",
      "applicantEmtFemale",
      "examNumberStartPublicMale",
      "examNumberEndPublicMale",
      "examNumberStartPublicFemale",
      "examNumberEndPublicFemale",
      "examNumberStartCareerRescue",
      "examNumberEndCareerRescue",
      "examNumberStartCareerAcademicMale",
      "examNumberEndCareerAcademicMale",
      "examNumberStartCareerAcademicFemale",
      "examNumberEndCareerAcademicFemale",
      "examNumberStartCareerAcademicCombined",
      "examNumberEndCareerAcademicCombined",
      "examNumberStartCareerEmtMale",
      "examNumberEndCareerEmtMale",
      "examNumberStartCareerEmtFemale",
      "examNumberEndCareerEmtFemale",
      "examNumberStart",
      "examNumberEnd"
    ) VALUES (
      ${examId},
      ${regionId},
      ${quotaData.recruitPublicMale},
      ${quotaData.recruitPublicFemale},
      ${quotaData.recruitRescue},
      ${quotaData.recruitAcademicMale},
      ${quotaData.recruitAcademicFemale},
      ${quotaData.recruitAcademicCombined},
      ${quotaData.recruitEmtMale},
      ${quotaData.recruitEmtFemale},
      ${quotaData.applicantPublicMale},
      ${quotaData.applicantPublicFemale},
      ${quotaData.applicantRescue},
      ${quotaData.applicantAcademicMale},
      ${quotaData.applicantAcademicFemale},
      ${quotaData.applicantAcademicCombined},
      ${quotaData.applicantEmtMale},
      ${quotaData.applicantEmtFemale},
      ${quotaData.examNumberStartPublicMale},
      ${quotaData.examNumberEndPublicMale},
      ${quotaData.examNumberStartPublicFemale},
      ${quotaData.examNumberEndPublicFemale},
      ${quotaData.examNumberStartCareerRescue},
      ${quotaData.examNumberEndCareerRescue},
      ${quotaData.examNumberStartCareerAcademicMale},
      ${quotaData.examNumberEndCareerAcademicMale},
      ${quotaData.examNumberStartCareerAcademicFemale},
      ${quotaData.examNumberEndCareerAcademicFemale},
      ${quotaData.examNumberStartCareerAcademicCombined},
      ${quotaData.examNumberEndCareerAcademicCombined},
      ${quotaData.examNumberStartCareerEmtMale},
      ${quotaData.examNumberEndCareerEmtMale},
      ${quotaData.examNumberStartCareerEmtFemale},
      ${quotaData.examNumberEndCareerEmtFemale},
      ${quotaData.examNumberStart},
      ${quotaData.examNumberEnd}
    )
    ON CONFLICT ("examId", "regionId") DO UPDATE SET
      "recruitPublicMale" = EXCLUDED."recruitPublicMale",
      "recruitPublicFemale" = EXCLUDED."recruitPublicFemale",
      "recruitRescue" = EXCLUDED."recruitRescue",
      "recruitAcademicMale" = EXCLUDED."recruitAcademicMale",
      "recruitAcademicFemale" = EXCLUDED."recruitAcademicFemale",
      "recruitAcademicCombined" = EXCLUDED."recruitAcademicCombined",
      "recruitEmtMale" = EXCLUDED."recruitEmtMale",
      "recruitEmtFemale" = EXCLUDED."recruitEmtFemale",
      "applicantPublicMale" = EXCLUDED."applicantPublicMale",
      "applicantPublicFemale" = EXCLUDED."applicantPublicFemale",
      "applicantRescue" = EXCLUDED."applicantRescue",
      "applicantAcademicMale" = EXCLUDED."applicantAcademicMale",
      "applicantAcademicFemale" = EXCLUDED."applicantAcademicFemale",
      "applicantAcademicCombined" = EXCLUDED."applicantAcademicCombined",
      "applicantEmtMale" = EXCLUDED."applicantEmtMale",
      "applicantEmtFemale" = EXCLUDED."applicantEmtFemale",
      "examNumberStartPublicMale" = EXCLUDED."examNumberStartPublicMale",
      "examNumberEndPublicMale" = EXCLUDED."examNumberEndPublicMale",
      "examNumberStartPublicFemale" = EXCLUDED."examNumberStartPublicFemale",
      "examNumberEndPublicFemale" = EXCLUDED."examNumberEndPublicFemale",
      "examNumberStartCareerRescue" = EXCLUDED."examNumberStartCareerRescue",
      "examNumberEndCareerRescue" = EXCLUDED."examNumberEndCareerRescue",
      "examNumberStartCareerAcademicMale" = EXCLUDED."examNumberStartCareerAcademicMale",
      "examNumberEndCareerAcademicMale" = EXCLUDED."examNumberEndCareerAcademicMale",
      "examNumberStartCareerAcademicFemale" = EXCLUDED."examNumberStartCareerAcademicFemale",
      "examNumberEndCareerAcademicFemale" = EXCLUDED."examNumberEndCareerAcademicFemale",
      "examNumberStartCareerAcademicCombined" = EXCLUDED."examNumberStartCareerAcademicCombined",
      "examNumberEndCareerAcademicCombined" = EXCLUDED."examNumberEndCareerAcademicCombined",
      "examNumberStartCareerEmtMale" = EXCLUDED."examNumberStartCareerEmtMale",
      "examNumberEndCareerEmtMale" = EXCLUDED."examNumberEndCareerEmtMale",
      "examNumberStartCareerEmtFemale" = EXCLUDED."examNumberStartCareerEmtFemale",
      "examNumberEndCareerEmtFemale" = EXCLUDED."examNumberEndCareerEmtFemale",
      "examNumberStart" = EXCLUDED."examNumberStart",
      "examNumberEnd" = EXCLUDED."examNumberEnd"
  `;
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
}

function parseNullableNonNegativeInt(value: unknown): { ok: boolean; value: number | null } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }

  const parsed = parseNonNegativeInt(value);
  if (parsed === null) {
    return { ok: false, value: null };
  }

  return { ok: true, value: parsed };
}

function parseBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function parseStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function formatPublicPassMultiple(recruitCount: number): string {
  if (recruitCount <= 0) return "-";
  if (recruitCount >= 51) return "1.5배";
  if (recruitCount >= 21) return "2배";
  if (recruitCount >= 11) return "2.5배";
  return "3배";
}

function formatCareerPassMultiple(recruitCount: number): string {
  if (recruitCount <= 0) return "-";
  if (recruitCount >= 51) return "1.5배";
  if (recruitCount >= 6) return "1.8배";

  const smallTable: Record<number, number> = { 5: 10, 4: 9, 3: 8, 2: 6, 1: 3 };
  const passCount = smallTable[recruitCount];
  if (!passCount) return "-";

  return `${(passCount / recruitCount).toFixed(1)}배`;
}

function selectLegacyRange(row: {
  examNumberStartPublicMale: string | null;
  examNumberEndPublicMale: string | null;
  examNumberStartPublicFemale: string | null;
  examNumberEndPublicFemale: string | null;
  examNumberStartCareerRescue: string | null;
  examNumberEndCareerRescue: string | null;
  examNumberStartCareerAcademicMale: string | null;
  examNumberEndCareerAcademicMale: string | null;
  examNumberStartCareerAcademicFemale: string | null;
  examNumberEndCareerAcademicFemale: string | null;
  examNumberStartCareerAcademicCombined: string | null;
  examNumberEndCareerAcademicCombined: string | null;
  examNumberStartCareerEmtMale: string | null;
  examNumberEndCareerEmtMale: string | null;
  examNumberStartCareerEmtFemale: string | null;
  examNumberEndCareerEmtFemale: string | null;
}): { start: string | null; end: string | null } {
  const pairs = [
    [row.examNumberStartPublicMale, row.examNumberEndPublicMale],
    [row.examNumberStartPublicFemale, row.examNumberEndPublicFemale],
    [row.examNumberStartCareerRescue, row.examNumberEndCareerRescue],
    [row.examNumberStartCareerAcademicMale, row.examNumberEndCareerAcademicMale],
    [row.examNumberStartCareerAcademicFemale, row.examNumberEndCareerAcademicFemale],
    [row.examNumberStartCareerAcademicCombined, row.examNumberEndCareerAcademicCombined],
    [row.examNumberStartCareerEmtMale, row.examNumberEndCareerEmtMale],
    [row.examNumberStartCareerEmtFemale, row.examNumberEndCareerEmtFemale],
  ] as const;

  const first = pairs.find(([start, end]) => start && end);
  if (!first) {
    return { start: null, end: null };
  }
  return { start: first[0], end: first[1] };
}

function validateRangeRow(row: {
  examNumberStartPublicMale: string | null;
  examNumberEndPublicMale: string | null;
  examNumberStartPublicFemale: string | null;
  examNumberEndPublicFemale: string | null;
  examNumberStartCareerRescue: string | null;
  examNumberEndCareerRescue: string | null;
  examNumberStartCareerAcademicMale: string | null;
  examNumberEndCareerAcademicMale: string | null;
  examNumberStartCareerAcademicFemale: string | null;
  examNumberEndCareerAcademicFemale: string | null;
  examNumberStartCareerAcademicCombined: string | null;
  examNumberEndCareerAcademicCombined: string | null;
  examNumberStartCareerEmtMale: string | null;
  examNumberEndCareerEmtMale: string | null;
  examNumberStartCareerEmtFemale: string | null;
  examNumberEndCareerEmtFemale: string | null;
}): string | null {
  const checks = [
    {
      label: "공채(남)",
      cohort: "PUBLIC_MALE" as const,
      start: row.examNumberStartPublicMale,
      end: row.examNumberEndPublicMale,
    },
    {
      label: "공채(여)",
      cohort: "PUBLIC_FEMALE" as const,
      start: row.examNumberStartPublicFemale,
      end: row.examNumberEndPublicFemale,
    },
    {
      label: "구조",
      cohort: "CAREER_RESCUE" as const,
      start: row.examNumberStartCareerRescue,
      end: row.examNumberEndCareerRescue,
    },
    {
      label: "소방관련학과(남)",
      cohort: "CAREER_ACADEMIC_MALE" as const,
      start: row.examNumberStartCareerAcademicMale,
      end: row.examNumberEndCareerAcademicMale,
    },
    {
      label: "소방관련학과(여)",
      cohort: "CAREER_ACADEMIC_FEMALE" as const,
      start: row.examNumberStartCareerAcademicFemale,
      end: row.examNumberEndCareerAcademicFemale,
    },
    {
      label: "소방관련학과(양성)",
      cohort: "CAREER_ACADEMIC_COMBINED" as const,
      start: row.examNumberStartCareerAcademicCombined,
      end: row.examNumberEndCareerAcademicCombined,
    },
    {
      label: "구급(남)",
      cohort: "CAREER_EMT_MALE" as const,
      start: row.examNumberStartCareerEmtMale,
      end: row.examNumberEndCareerEmtMale,
    },
    {
      label: "구급(여)",
      cohort: "CAREER_EMT_FEMALE" as const,
      start: row.examNumberStartCareerEmtFemale,
      end: row.examNumberEndCareerEmtFemale,
    },
  ];

  for (const check of checks) {
    const error = validateAdminExamNumberRange({
      cohort: check.cohort,
      label: check.label,
      start: check.start,
      end: check.end,
    });
    if (error) return error;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("regions");
  if (featureError) return featureError;

  try {
    const exams = await prisma.exam.findMany({
      orderBy: [{ isActive: "desc" }, { examDate: "desc" }],
      select: { id: true, name: true, year: true, round: true, isActive: true },
    });

    const examIdParam = request.nextUrl.searchParams.get("examId");
    let examId: number | null = null;
    if (examIdParam) {
      examId = parsePositiveInt(examIdParam);
    }
    if (!examId) {
      const activeExam = exams.find((e) => e.isActive);
      examId = activeExam?.id ?? exams[0]?.id ?? null;
    }

    const regions = await prisma.region.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true },
    });

    const quotas = examId
      ? await prisma.examRegionQuota.findMany({
          where: { examId },
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
            applicantPublicMale: true,
            applicantPublicFemale: true,
            applicantRescue: true,
            applicantAcademicMale: true,
            applicantAcademicFemale: true,
            applicantAcademicCombined: true,
            applicantEmtMale: true,
            applicantEmtFemale: true,
            examNumberStartPublicMale: true,
            examNumberEndPublicMale: true,
            examNumberStartPublicFemale: true,
            examNumberEndPublicFemale: true,
            examNumberStartCareerRescue: true,
            examNumberEndCareerRescue: true,
            examNumberStartCareerAcademicMale: true,
            examNumberEndCareerAcademicMale: true,
            examNumberStartCareerAcademicFemale: true,
            examNumberEndCareerAcademicFemale: true,
            examNumberStartCareerAcademicCombined: true,
            examNumberEndCareerAcademicCombined: true,
            examNumberStartCareerEmtMale: true,
            examNumberEndCareerEmtMale: true,
            examNumberStartCareerEmtFemale: true,
            examNumberEndCareerEmtFemale: true,
          },
        })
      : [];

    const quotaByRegionId = new Map(quotas.map((q) => [q.regionId, q]));

    const groupedCounts = examId
      ? await prisma.submission.groupBy({
          by: ["regionId", "examType"],
          where: { examId },
          _count: { _all: true },
        })
      : [];

    const countByRegion = new Map<
      number,
      { total: number; publicCount: number; careerRescueCount: number; careerAcademicCount: number; careerEmtCount: number }
    >();

    for (const row of groupedCounts) {
      const existing = countByRegion.get(row.regionId) ?? {
        total: 0,
        publicCount: 0,
        careerRescueCount: 0,
        careerAcademicCount: 0,
        careerEmtCount: 0,
      };

      const count = row._count._all;
      existing.total += count;
      if (row.examType === ExamType.PUBLIC) {
        existing.publicCount += count;
      } else if (row.examType === ExamType.CAREER_RESCUE) {
        existing.careerRescueCount += count;
      } else if (row.examType === ExamType.CAREER_ACADEMIC) {
        existing.careerAcademicCount += count;
      } else if (row.examType === ExamType.CAREER_EMT) {
        existing.careerEmtCount += count;
      }
      countByRegion.set(row.regionId, existing);
    }

    return NextResponse.json({
      exams,
      selectedExamId: examId,
      regions: regions.map((region) => {
        const quota = quotaByRegionId.get(region.id);
        const counts = countByRegion.get(region.id) ?? {
          total: 0,
          publicCount: 0,
          careerRescueCount: 0,
          careerAcademicCount: 0,
          careerEmtCount: 0,
        };

        return {
          id: region.id,
          name: region.name,
          isActive: region.isActive,
          recruitPublicMale: quota?.recruitPublicMale ?? 0,
          recruitPublicFemale: quota?.recruitPublicFemale ?? 0,
          recruitRescue: quota?.recruitRescue ?? 0,
          recruitAcademicMale: quota?.recruitAcademicMale ?? 0,
          recruitAcademicFemale: quota?.recruitAcademicFemale ?? 0,
          recruitAcademicCombined: quota?.recruitAcademicCombined ?? 0,
          recruitEmtMale: quota?.recruitEmtMale ?? 0,
          recruitEmtFemale: quota?.recruitEmtFemale ?? 0,
          applicantPublicMale: quota?.applicantPublicMale ?? null,
          applicantPublicFemale: quota?.applicantPublicFemale ?? null,
          applicantRescue: quota?.applicantRescue ?? null,
          applicantAcademicMale: quota?.applicantAcademicMale ?? null,
          applicantAcademicFemale: quota?.applicantAcademicFemale ?? null,
          applicantAcademicCombined: quota?.applicantAcademicCombined ?? null,
          applicantEmtMale: quota?.applicantEmtMale ?? null,
          applicantEmtFemale: quota?.applicantEmtFemale ?? null,
          passMultiplePublicMale: formatPublicPassMultiple(quota?.recruitPublicMale ?? 0),
          passMultiplePublicFemale: formatPublicPassMultiple(quota?.recruitPublicFemale ?? 0),
          passMultipleRescue: formatCareerPassMultiple(quota?.recruitRescue ?? 0),
          passMultipleAcademicMale: formatCareerPassMultiple(quota?.recruitAcademicMale ?? 0),
          passMultipleAcademicFemale: formatCareerPassMultiple(quota?.recruitAcademicFemale ?? 0),
          passMultipleAcademicCombined: formatCareerPassMultiple(quota?.recruitAcademicCombined ?? 0),
          passMultipleEmtMale: formatCareerPassMultiple(quota?.recruitEmtMale ?? 0),
          passMultipleEmtFemale: formatCareerPassMultiple(quota?.recruitEmtFemale ?? 0),
          examNumberStartPublicMale: quota?.examNumberStartPublicMale ?? null,
          examNumberEndPublicMale: quota?.examNumberEndPublicMale ?? null,
          examNumberStartPublicFemale: quota?.examNumberStartPublicFemale ?? null,
          examNumberEndPublicFemale: quota?.examNumberEndPublicFemale ?? null,
          examNumberStartCareerRescue: quota?.examNumberStartCareerRescue ?? null,
          examNumberEndCareerRescue: quota?.examNumberEndCareerRescue ?? null,
          examNumberStartCareerAcademicMale: quota?.examNumberStartCareerAcademicMale ?? null,
          examNumberEndCareerAcademicMale: quota?.examNumberEndCareerAcademicMale ?? null,
          examNumberStartCareerAcademicFemale: quota?.examNumberStartCareerAcademicFemale ?? null,
          examNumberEndCareerAcademicFemale: quota?.examNumberEndCareerAcademicFemale ?? null,
          examNumberStartCareerAcademicCombined: quota?.examNumberStartCareerAcademicCombined ?? null,
          examNumberEndCareerAcademicCombined: quota?.examNumberEndCareerAcademicCombined ?? null,
          examNumberStartCareerEmtMale: quota?.examNumberStartCareerEmtMale ?? null,
          examNumberEndCareerEmtMale: quota?.examNumberEndCareerEmtMale ?? null,
          examNumberStartCareerEmtFemale: quota?.examNumberStartCareerEmtFemale ?? null,
          examNumberEndCareerEmtFemale: quota?.examNumberEndCareerEmtFemale ?? null,
          submissionCount: counts.total,
          submissionCountPublic: counts.publicCount,
          submissionCountCareerRescue: counts.careerRescueCount,
          submissionCountCareerAcademic: counts.careerAcademicCount,
          submissionCountCareerEmt: counts.careerEmtCount,
        };
      }),
    });
  } catch (error) {
    console.error("모집인원 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "모집인원 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("regions");
  if (featureError) return featureError;

  try {
    const body = (await request.json()) as QuotaUpdatePayload;

    const examId = parsePositiveInt(body.examId);
    if (!examId) {
      return NextResponse.json({ error: "유효한 시험 ID가 필요합니다." }, { status: 400 });
    }

    if (!Array.isArray(body.regions) || body.regions.length === 0) {
      return NextResponse.json({ error: "수정할 지역 데이터가 없습니다." }, { status: 400 });
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
    if (!exam) {
      return NextResponse.json({ error: "존재하지 않는 시험입니다." }, { status: 404 });
    }

    const normalized = body.regions.map((item) => {
      const regionId = parsePositiveInt(item.regionId);
      const isActive = parseBoolean(item.isActive);
      const recruitPublicMale = parseNonNegativeInt(item.recruitPublicMale);
      const recruitPublicFemale = parseNonNegativeInt(item.recruitPublicFemale);
      const recruitRescue = parseNonNegativeInt(item.recruitRescue);
      const recruitAcademicMale = parseNonNegativeInt(item.recruitAcademicMale);
      const recruitAcademicFemale = parseNonNegativeInt(item.recruitAcademicFemale);
      const recruitAcademicCombined = parseNonNegativeInt(item.recruitAcademicCombined);
      const recruitEmtMale = parseNonNegativeInt(item.recruitEmtMale);
      const recruitEmtFemale = parseNonNegativeInt(item.recruitEmtFemale);
      const applicantPublicMaleParsed = parseNullableNonNegativeInt(item.applicantPublicMale);
      const applicantPublicFemaleParsed = parseNullableNonNegativeInt(item.applicantPublicFemale);
      const applicantRescueParsed = parseNullableNonNegativeInt(item.applicantRescue);
      const applicantAcademicMaleParsed = parseNullableNonNegativeInt(item.applicantAcademicMale);
      const applicantAcademicFemaleParsed = parseNullableNonNegativeInt(item.applicantAcademicFemale);
      const applicantAcademicCombinedParsed = parseNullableNonNegativeInt(item.applicantAcademicCombined);
      const applicantEmtMaleParsed = parseNullableNonNegativeInt(item.applicantEmtMale);
      const applicantEmtFemaleParsed = parseNullableNonNegativeInt(item.applicantEmtFemale);

      return {
        regionId,
        isActive,
        recruitPublicMale,
        recruitPublicFemale,
        recruitRescue,
        recruitAcademicMale,
        recruitAcademicFemale,
        recruitAcademicCombined,
        recruitEmtMale,
        recruitEmtFemale,
        applicantPublicMale: applicantPublicMaleParsed.value,
        applicantPublicFemale: applicantPublicFemaleParsed.value,
        applicantRescue: applicantRescueParsed.value,
        applicantAcademicMale: applicantAcademicMaleParsed.value,
        applicantAcademicFemale: applicantAcademicFemaleParsed.value,
        applicantAcademicCombined: applicantAcademicCombinedParsed.value,
        applicantEmtMale: applicantEmtMaleParsed.value,
        applicantEmtFemale: applicantEmtFemaleParsed.value,
        applicantCountValid:
          applicantPublicMaleParsed.ok &&
          applicantPublicFemaleParsed.ok &&
          applicantRescueParsed.ok &&
          applicantAcademicMaleParsed.ok &&
          applicantAcademicFemaleParsed.ok &&
          applicantAcademicCombinedParsed.ok &&
          applicantEmtMaleParsed.ok &&
          applicantEmtFemaleParsed.ok,
        examNumberStartPublicMale: parseStringOrNull(item.examNumberStartPublicMale),
        examNumberEndPublicMale: parseStringOrNull(item.examNumberEndPublicMale),
        examNumberStartPublicFemale: parseStringOrNull(item.examNumberStartPublicFemale),
        examNumberEndPublicFemale: parseStringOrNull(item.examNumberEndPublicFemale),
        examNumberStartCareerRescue: parseStringOrNull(item.examNumberStartCareerRescue),
        examNumberEndCareerRescue: parseStringOrNull(item.examNumberEndCareerRescue),
        examNumberStartCareerAcademicMale: parseStringOrNull(item.examNumberStartCareerAcademicMale),
        examNumberEndCareerAcademicMale: parseStringOrNull(item.examNumberEndCareerAcademicMale),
        examNumberStartCareerAcademicFemale: parseStringOrNull(item.examNumberStartCareerAcademicFemale),
        examNumberEndCareerAcademicFemale: parseStringOrNull(item.examNumberEndCareerAcademicFemale),
        examNumberStartCareerAcademicCombined: parseStringOrNull(item.examNumberStartCareerAcademicCombined),
        examNumberEndCareerAcademicCombined: parseStringOrNull(item.examNumberEndCareerAcademicCombined),
        examNumberStartCareerEmtMale: parseStringOrNull(item.examNumberStartCareerEmtMale),
        examNumberEndCareerEmtMale: parseStringOrNull(item.examNumberEndCareerEmtMale),
        examNumberStartCareerEmtFemale: parseStringOrNull(item.examNumberStartCareerEmtFemale),
        examNumberEndCareerEmtFemale: parseStringOrNull(item.examNumberEndCareerEmtFemale),
      };
    });

    for (const row of normalized) {
      if (!row.regionId) {
        return NextResponse.json({ error: "유효한 지역 ID가 필요합니다." }, { status: 400 });
      }
      if (row.isActive === null) {
        return NextResponse.json({ error: "isActive 값이 올바르지 않습니다." }, { status: 400 });
      }
      if (
        row.recruitPublicMale === null ||
        row.recruitPublicFemale === null ||
        row.recruitRescue === null ||
        row.recruitAcademicMale === null ||
        row.recruitAcademicFemale === null ||
        row.recruitAcademicCombined === null ||
        row.recruitEmtMale === null ||
        row.recruitEmtFemale === null
      ) {
        return NextResponse.json({ error: "모집인원은 0 이상의 정수여야 합니다." }, { status: 400 });
      }
      if (!row.applicantCountValid) {
        return NextResponse.json({ error: "응시인원은 비우거나 0 이상의 정수여야 합니다." }, { status: 400 });
      }

      const rangeError = validateRangeRow(row);
      if (rangeError) {
        return NextResponse.json({ error: rangeError }, { status: 400 });
      }
    }

    const uniqueIds = new Set<number>();
    for (const row of normalized) {
      const rowId = row.regionId as number;
      if (uniqueIds.has(rowId)) {
        return NextResponse.json({ error: "중복된 지역 ID가 포함되어 있습니다." }, { status: 400 });
      }
      uniqueIds.add(rowId);
    }

    const existingRegions = await prisma.region.findMany({
      where: { id: { in: Array.from(uniqueIds) } },
      select: { id: true },
    });
    if (existingRegions.length !== uniqueIds.size) {
      return NextResponse.json({ error: "존재하지 않는 지역 ID가 포함되어 있습니다." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      for (const row of normalized) {
        const regionId = row.regionId as number;

        if (row.isActive !== undefined) {
          await tx.region.update({
            where: { id: regionId },
            data: { isActive: row.isActive as boolean },
          });
        }

        const legacyRange = selectLegacyRange(row);
        const quotaData: QuotaUpsertData = {
          recruitPublicMale: row.recruitPublicMale as number,
          recruitPublicFemale: row.recruitPublicFemale as number,
          recruitRescue: row.recruitRescue as number,
          recruitAcademicMale: row.recruitAcademicMale as number,
          recruitAcademicFemale: row.recruitAcademicFemale as number,
          recruitAcademicCombined: row.recruitAcademicCombined as number,
          recruitEmtMale: row.recruitEmtMale as number,
          recruitEmtFemale: row.recruitEmtFemale as number,
          applicantPublicMale: row.applicantPublicMale,
          applicantPublicFemale: row.applicantPublicFemale,
          applicantRescue: row.applicantRescue,
          applicantAcademicMale: row.applicantAcademicMale,
          applicantAcademicFemale: row.applicantAcademicFemale,
          applicantAcademicCombined: row.applicantAcademicCombined,
          applicantEmtMale: row.applicantEmtMale,
          applicantEmtFemale: row.applicantEmtFemale,
          examNumberStartPublicMale: row.examNumberStartPublicMale,
          examNumberEndPublicMale: row.examNumberEndPublicMale,
          examNumberStartPublicFemale: row.examNumberStartPublicFemale,
          examNumberEndPublicFemale: row.examNumberEndPublicFemale,
          examNumberStartCareerRescue: row.examNumberStartCareerRescue,
          examNumberEndCareerRescue: row.examNumberEndCareerRescue,
          examNumberStartCareerAcademicMale: row.examNumberStartCareerAcademicMale,
          examNumberEndCareerAcademicMale: row.examNumberEndCareerAcademicMale,
          examNumberStartCareerAcademicFemale: row.examNumberStartCareerAcademicFemale,
          examNumberEndCareerAcademicFemale: row.examNumberEndCareerAcademicFemale,
          examNumberStartCareerAcademicCombined: row.examNumberStartCareerAcademicCombined,
          examNumberEndCareerAcademicCombined: row.examNumberEndCareerAcademicCombined,
          examNumberStartCareerEmtMale: row.examNumberStartCareerEmtMale,
          examNumberEndCareerEmtMale: row.examNumberEndCareerEmtMale,
          examNumberStartCareerEmtFemale: row.examNumberStartCareerEmtFemale,
          examNumberEndCareerEmtFemale: row.examNumberEndCareerEmtFemale,
          examNumberStart: legacyRange.start,
          examNumberEnd: legacyRange.end,
        };

        await tx.$executeRaw(buildQuotaUpsertQuery({ examId, regionId, quotaData }));
      }
    });

    return NextResponse.json({
      success: true,
      updatedCount: normalized.length,
      message: `${normalized.length}개 지역의 설정을 업데이트했습니다.`,
    });
  } catch (error) {
    console.error("모집인원 저장 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "모집인원 저장에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("regions");
  if (featureError) return featureError;

  try {
    const body = (await request.json()) as { sourceExamId?: unknown; targetExamId?: unknown };
    const sourceExamId = parsePositiveInt(body.sourceExamId);
    const targetExamId = parsePositiveInt(body.targetExamId);

    if (!sourceExamId || !targetExamId) {
      return NextResponse.json({ error: "원본 시험 ID와 대상 시험 ID가 필요합니다." }, { status: 400 });
    }
    if (sourceExamId === targetExamId) {
      return NextResponse.json({ error: "같은 시험으로 복사할 수 없습니다." }, { status: 400 });
    }

    const sourceQuotas = await prisma.examRegionQuota.findMany({
      where: { examId: sourceExamId },
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
        applicantPublicMale: true,
        applicantPublicFemale: true,
        applicantRescue: true,
        applicantAcademicMale: true,
        applicantAcademicFemale: true,
        applicantAcademicCombined: true,
        applicantEmtMale: true,
        applicantEmtFemale: true,
        examNumberStartPublicMale: true,
        examNumberEndPublicMale: true,
        examNumberStartPublicFemale: true,
        examNumberEndPublicFemale: true,
        examNumberStartCareerRescue: true,
        examNumberEndCareerRescue: true,
        examNumberStartCareerAcademicMale: true,
        examNumberEndCareerAcademicMale: true,
        examNumberStartCareerAcademicFemale: true,
        examNumberEndCareerAcademicFemale: true,
        examNumberStartCareerAcademicCombined: true,
        examNumberEndCareerAcademicCombined: true,
        examNumberStartCareerEmtMale: true,
        examNumberEndCareerEmtMale: true,
        examNumberStartCareerEmtFemale: true,
        examNumberEndCareerEmtFemale: true,
        examNumberStart: true,
        examNumberEnd: true,
      },
    });
    if (sourceQuotas.length === 0) {
      return NextResponse.json({ error: "원본 시험에 모집인원 데이터가 없습니다." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      for (const sq of sourceQuotas) {
        const quotaData: QuotaUpsertData = {
          recruitPublicMale: sq.recruitPublicMale,
          recruitPublicFemale: sq.recruitPublicFemale,
          recruitRescue: sq.recruitRescue,
          recruitAcademicMale: sq.recruitAcademicMale,
          recruitAcademicFemale: sq.recruitAcademicFemale,
          recruitAcademicCombined: sq.recruitAcademicCombined,
          recruitEmtMale: sq.recruitEmtMale,
          recruitEmtFemale: sq.recruitEmtFemale,
          applicantPublicMale: sq.applicantPublicMale,
          applicantPublicFemale: sq.applicantPublicFemale,
          applicantRescue: sq.applicantRescue,
          applicantAcademicMale: sq.applicantAcademicMale,
          applicantAcademicFemale: sq.applicantAcademicFemale,
          applicantAcademicCombined: sq.applicantAcademicCombined,
          applicantEmtMale: sq.applicantEmtMale,
          applicantEmtFemale: sq.applicantEmtFemale,
          examNumberStartPublicMale: sq.examNumberStartPublicMale,
          examNumberEndPublicMale: sq.examNumberEndPublicMale,
          examNumberStartPublicFemale: sq.examNumberStartPublicFemale,
          examNumberEndPublicFemale: sq.examNumberEndPublicFemale,
          examNumberStartCareerRescue: sq.examNumberStartCareerRescue,
          examNumberEndCareerRescue: sq.examNumberEndCareerRescue,
          examNumberStartCareerAcademicMale: sq.examNumberStartCareerAcademicMale,
          examNumberEndCareerAcademicMale: sq.examNumberEndCareerAcademicMale,
          examNumberStartCareerAcademicFemale: sq.examNumberStartCareerAcademicFemale,
          examNumberEndCareerAcademicFemale: sq.examNumberEndCareerAcademicFemale,
          examNumberStartCareerAcademicCombined: sq.examNumberStartCareerAcademicCombined,
          examNumberEndCareerAcademicCombined: sq.examNumberEndCareerAcademicCombined,
          examNumberStartCareerEmtMale: sq.examNumberStartCareerEmtMale,
          examNumberEndCareerEmtMale: sq.examNumberEndCareerEmtMale,
          examNumberStartCareerEmtFemale: sq.examNumberStartCareerEmtFemale,
          examNumberEndCareerEmtFemale: sq.examNumberEndCareerEmtFemale,
          examNumberStart: sq.examNumberStart,
          examNumberEnd: sq.examNumberEnd,
        };

        await tx.$executeRaw(
          buildQuotaUpsertQuery({
            examId: targetExamId,
            regionId: sq.regionId,
            quotaData,
          })
        );
      }
    });

    return NextResponse.json({
      success: true,
      copiedCount: sourceQuotas.length,
      message: `${sourceQuotas.length}개 지역 모집인원을 복사했습니다.`,
    });
  } catch (error) {
    console.error("모집인원 복사 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "모집인원 복사에 실패했습니다." }, { status: 500 });
  }
}

