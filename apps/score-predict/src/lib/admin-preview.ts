import { ExamType, Gender } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantConfigByType, type TenantType } from "@/lib/tenant";
import { TENANT_EXAM_TYPES } from "@/lib/tenant-exam";
import { requireSoleActiveExam } from "@/lib/active-exam";

export interface AdminPreviewCandidate {
  submissionId: number;
  label: string;
}

const MOCK_EXAM_NUMBER_PREFIX = "MOCK-";
const PREVIEW_PRIMARY_GENDER = Gender.MALE;

function examTypeLabel(tenantType: TenantType, examType: ExamType): string {
  return getTenantConfigByType(tenantType).examTypeLabels[examType] ?? examType;
}

function examTypePreviewPriority(tenantType: TenantType, examType: ExamType): number {
  const index = TENANT_EXAM_TYPES[tenantType].indexOf(examType);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function genderLabel(gender: Gender): string {
  return gender === Gender.MALE ? "M" : "F";
}

function previewPrimaryPriority(params: { examType: ExamType; gender: Gender }): number {
  if (params.examType === ExamType.PUBLIC && params.gender === PREVIEW_PRIMARY_GENDER) {
    return 0;
  }
  if (params.examType === ExamType.PUBLIC) {
    return 1;
  }
  return 2;
}

export async function buildAdminPreviewCandidates(
  tenantType: TenantType
): Promise<AdminPreviewCandidate[]> {
  const previewExamTypes = TENANT_EXAM_TYPES[tenantType];
  const activeExam = await requireSoleActiveExam({
    db: prisma,
    tenantType,
    context: "admin-preview",
  });

  const loadRows = async (examId?: number) => {
    const rowsByType = await Promise.all(
      previewExamTypes.map((examType) =>
        prisma.submission.findMany({
          where: {
            examNumber: { startsWith: MOCK_EXAM_NUMBER_PREFIX },
            ...(examId ? { examId } : {}),
            examType,
            isSuspicious: false,
            subjectScores: {
              some: {},
              none: { isFailed: true },
            },
          },
          orderBy: [{ finalScore: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: 40,
          select: {
            id: true,
            examType: true,
            gender: true,
            examNumber: true,
            finalScore: true,
            user: {
              select: { name: true, phone: true },
            },
            region: {
              select: { name: true },
            },
            exam: {
              select: { year: true, round: true, name: true },
            },
          },
        })
      )
    );

    const dedupedById = new Map<number, (typeof rowsByType)[number][number]>();
    for (const rows of rowsByType) {
      for (const row of rows) {
        if (!dedupedById.has(row.id)) {
          dedupedById.set(row.id, row);
        }
      }
    }

    return [...dedupedById.values()].sort((left, right) => {
      const previewPriorityDiff =
        previewPrimaryPriority({ examType: left.examType, gender: left.gender }) -
        previewPrimaryPriority({ examType: right.examType, gender: right.gender });
      if (previewPriorityDiff !== 0) return previewPriorityDiff;

      const scoreDiff = Number(right.finalScore) - Number(left.finalScore);
      if (scoreDiff !== 0) return scoreDiff;

      const priorityDiff =
        examTypePreviewPriority(tenantType, left.examType) -
        examTypePreviewPriority(tenantType, right.examType);
      if (priorityDiff !== 0) return priorityDiff;
      return right.id - left.id;
    });
  };

  const targetRows = await loadRows(activeExam.id);

  return targetRows.map((row) => ({
    submissionId: row.id,
    label: `#${row.id} | ${row.exam.year}-${row.exam.round} ${examTypeLabel(tenantType, row.examType)} ${genderLabel(row.gender)} | ${row.region.name} | score ${Number(row.finalScore).toFixed(2)} | ${row.user.name}(${row.user.phone}) | ${row.examNumber}`,
  }));
}
