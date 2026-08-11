import { ExamType, Prisma, SubmissionSuspicionStatus } from "@prisma/client";

export type AdminSubmissionFilters = {
  examId?: number | null;
  regionId?: number | null;
  userId?: number | null;
  examType?: ExamType | null;
  search?: string;
  suspicious?: string | null;
  suspicionStatus?: SubmissionSuspicionStatus | null;
};

type BuildAdminSubmissionWhereOptions = {
  excludeRegionId?: boolean;
  predictionEligibleOnly?: boolean;
  allowedExamTypes?: readonly ExamType[];
};

export function buildAdminSubmissionWhere(
  filters: AdminSubmissionFilters,
  options: BuildAdminSubmissionWhereOptions = {}
): Prisma.SubmissionWhereInput {
  const search = filters.search?.trim() ?? "";
  const suspicious =
    filters.suspicious === "true" || filters.suspicious === "false"
      ? filters.suspicious
      : null;

  return {
    ...(filters.examType
      ? { examType: filters.examType }
      : options.allowedExamTypes
        ? { examType: { in: [...options.allowedExamTypes] } }
        : {}),
    ...(filters.examId ? { examId: filters.examId } : {}),
    ...(!options.excludeRegionId && filters.regionId ? { regionId: filters.regionId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.suspicionStatus ? { suspicionStatus: filters.suspicionStatus } : {}),
    ...(options.predictionEligibleOnly
      ? {
          isSuspicious: false,
          subjectScores: { some: {}, none: { isFailed: true } },
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
