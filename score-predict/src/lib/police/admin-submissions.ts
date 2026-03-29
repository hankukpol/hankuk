import { ExamType, Prisma } from "@prisma/client";

export type AdminSubmissionFilters = {
  examId?: number | null;
  regionId?: number | null;
  userId?: number | null;
  examType?: ExamType | null;
  search?: string;
  suspicious?: string | null;
};

type BuildAdminSubmissionWhereOptions = {
  excludeRegionId?: boolean;
  predictionEligibleOnly?: boolean;
};

export function parseAdminSubmissionExamType(value: string | null): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER) return ExamType.CAREER;
  return null;
}

export function buildAdminSubmissionWhere(
  filters: AdminSubmissionFilters,
  options: BuildAdminSubmissionWhereOptions = {}
): Prisma.SubmissionWhereInput {
  const search = filters.search?.trim() ?? "";
  const suspicious =
    filters.suspicious === "true" || filters.suspicious === "false" ? filters.suspicious : null;

  return {
    ...(filters.examId ? { examId: filters.examId } : {}),
    ...(!options.excludeRegionId && filters.regionId ? { regionId: filters.regionId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.examType ? { examType: filters.examType } : {}),
    ...(options.predictionEligibleOnly
      ? {
          isSuspicious: false,
          subjectScores: {
            some: {},
            none: {
              isFailed: true,
            },
          },
        }
      : suspicious === "true"
        ? { isSuspicious: true }
        : suspicious === "false"
          ? { isSuspicious: false }
          : {}),
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search } } },
            { user: { phone: { contains: search } } },
            { user: { contactPhone: { contains: search } } },
            { examNumber: { contains: search } },
          ],
        }
      : {}),
  };
}
