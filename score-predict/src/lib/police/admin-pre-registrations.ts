import { ExamType, Prisma } from "@prisma/client";

export type AdminPreRegistrationFilters = {
  examId?: number | null;
  regionId?: number | null;
  examType?: ExamType | null;
  search?: string;
};

export function parseAdminExamType(value: string | null): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER) return ExamType.CAREER;
  return null;
}

export function buildAdminPreRegistrationWhere(
  filters: AdminPreRegistrationFilters
): Prisma.PreRegistrationWhereInput {
  const search = filters.search?.trim() ?? "";

  return {
    ...(filters.examId ? { examId: filters.examId } : {}),
    ...(filters.regionId ? { regionId: filters.regionId } : {}),
    ...(filters.examType ? { examType: filters.examType } : {}),
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search, mode: "insensitive" } } },
            { user: { phone: { contains: search, mode: "insensitive" } } },
            { examNumber: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
