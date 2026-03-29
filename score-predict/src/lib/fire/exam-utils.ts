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
  quota: {
    recruitPublicMale: number;
    recruitPublicFemale: number;
    recruitRescue: number;
    recruitAcademicMale: number;
    recruitAcademicFemale: number;
    recruitAcademicCombined: number;
    recruitEmtMale: number;
    recruitEmtFemale: number;
  },
  examType: ExamType,
  gender?: "MALE" | "FEMALE"
): number {
  if (examType === ExamType.CAREER_RESCUE) return quota.recruitRescue;
  if (examType === ExamType.CAREER_ACADEMIC) {
    // 양성 모집이 있으면 양성 인원, 없으면 성별별 인원
    if (quota.recruitAcademicCombined > 0) return quota.recruitAcademicCombined;
    if (gender === "FEMALE") return quota.recruitAcademicFemale;
    return quota.recruitAcademicMale;
  }
  if (examType === ExamType.CAREER_EMT) {
    if (gender === "FEMALE") return quota.recruitEmtFemale;
    return quota.recruitEmtMale;
  }
  // PUBLIC: 남녀 분리 선발
  if (gender === "FEMALE") return quota.recruitPublicFemale;
  return quota.recruitPublicMale;
}
