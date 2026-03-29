import { ExamType, Gender } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface AdminPreviewCandidate {
  submissionId: number;
  label: string;
}

const MOCK_EXAM_NUMBER_PREFIX = "MOCK-";
const PREVIEW_PRIMARY_EXAM_TYPE = ExamType.PUBLIC;
const PREVIEW_PRIMARY_GENDER = Gender.MALE;
const PREVIEW_EXAM_TYPES: readonly ExamType[] = [
  ExamType.PUBLIC,
  ExamType.CAREER_RESCUE,
  ExamType.CAREER_ACADEMIC,
  ExamType.CAREER_EMT,
];

function examTypeLabel(examType: ExamType): string {
  if (examType === ExamType.CAREER_RESCUE) return "Rescue Career";
  if (examType === ExamType.CAREER_ACADEMIC) return "Academic Career";
  if (examType === ExamType.CAREER_EMT) return "EMT Career";
  return "Public";
}

function examTypePreviewPriority(examType: ExamType): number {
  if (examType === ExamType.PUBLIC) return 0;
  if (examType === ExamType.CAREER_RESCUE) return 1;
  if (examType === ExamType.CAREER_ACADEMIC) return 2;
  return 3;
}

function genderLabel(gender: Gender): string {
  return gender === Gender.MALE ? "M" : "F";
}

function previewPrimaryPriority(params: { examType: ExamType; gender: Gender }): number {
  if (params.examType === PREVIEW_PRIMARY_EXAM_TYPE && params.gender === PREVIEW_PRIMARY_GENDER) {
    return 0;
  }
  if (params.examType === PREVIEW_PRIMARY_EXAM_TYPE) {
    return 1;
  }
  return 2;
}

export async function buildAdminPreviewCandidates(): Promise<AdminPreviewCandidate[]> {
  const activeExam = await prisma.exam.findFirst({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  const loadRows = async (examId?: number) => {
    const rowsByType = await Promise.all(
      PREVIEW_EXAM_TYPES.map((examType) =>
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

      const priorityDiff = examTypePreviewPriority(left.examType) - examTypePreviewPriority(right.examType);
      if (priorityDiff !== 0) return priorityDiff;
      return right.id - left.id;
    });
  };

  const rows = activeExam ? await loadRows(activeExam.id) : await loadRows();
  const fallbackRows = rows.length < 1 && activeExam ? await loadRows() : [];
  const targetRows = rows.length > 0 ? rows : fallbackRows;

  return targetRows.map((row) => ({
    submissionId: row.id,
    label: `#${row.id} | ${row.exam.year}-${row.exam.round} ${examTypeLabel(row.examType)} ${genderLabel(row.gender)} | ${row.region.name} | score ${Number(row.finalScore).toFixed(2)} | ${row.user.name}(${row.user.phone}) | ${row.examNumber}`,
  }));
}