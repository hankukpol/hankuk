import { ExamType } from "@prisma/client";

export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function normalizeSubjectName(name: string): string {
  return name.replace(/\s+/g, "").trim();
}

export function getRegionRecruitCount(
  quota: { recruitCount: number; recruitCountCareer: number },
  examType: ExamType
): number {
  return examType === ExamType.CAREER ? quota.recruitCountCareer : quota.recruitCount;
}
