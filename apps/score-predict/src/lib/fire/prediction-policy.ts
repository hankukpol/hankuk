import { ExamType, Gender } from "@prisma/client";
import { isFireExamType } from "@/lib/tenant-exam";

export interface FireRecruitmentCohort {
  gender: Gender | null;
  populationGender: Gender | null;
  recruitCount: number;
}

const SMALL_RECRUIT_PASS_COUNTS: Record<number, number> = {
  1: 3,
  2: 6,
  3: 8,
  4: 9,
  5: 10,
};

export function getFirePassMultiple(recruitCount: number, examType: ExamType): number | null {
  if (!isFireExamType(examType)) {
    throw new Error("소방 서비스에서 사용할 수 없는 채용유형입니다.");
  }
  if (examType === ExamType.PUBLIC) {
    if (recruitCount >= 51) return 1.5;
    if (recruitCount >= 21) return 2.0;
    if (recruitCount >= 11) return 2.5;
    return 3.0;
  }

  if (!Number.isInteger(recruitCount) || recruitCount < 1) return null;
  if (recruitCount >= 51) return 1.5;
  if (recruitCount >= 6) return 1.8;
  const passCount = SMALL_RECRUIT_PASS_COUNTS[recruitCount];
  return passCount ? passCount / recruitCount : null;
}

export function getFireRecruitCount(
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
  gender?: Gender | null
): number {
  if (!isFireExamType(examType)) {
    throw new Error("소방 서비스에서 사용할 수 없는 채용유형입니다.");
  }
  switch (examType) {
    case ExamType.PUBLIC:
      return gender === Gender.MALE
        ? quota.recruitPublicMale
        : gender === Gender.FEMALE
          ? quota.recruitPublicFemale
          : quota.recruitPublicMale + quota.recruitPublicFemale;
    case ExamType.CAREER_RESCUE:
      return quota.recruitRescue;
    case ExamType.CAREER_ACADEMIC:
      if (quota.recruitAcademicCombined > 0) return quota.recruitAcademicCombined;
      return gender === Gender.FEMALE ? quota.recruitAcademicFemale : quota.recruitAcademicMale;
    case ExamType.CAREER_EMT:
      return gender === Gender.FEMALE ? quota.recruitEmtFemale : quota.recruitEmtMale;
    default:
      return 0;
  }
}

export function getFireRecruitmentCohorts(
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
  examType: ExamType
): FireRecruitmentCohort[] {
  if (!isFireExamType(examType)) {
    throw new Error("소방 서비스에서 사용할 수 없는 채용유형입니다.");
  }
  if (examType === ExamType.CAREER_RESCUE) {
    return [{ gender: null, populationGender: Gender.MALE, recruitCount: quota.recruitRescue }];
  }

  if (examType === ExamType.CAREER_ACADEMIC && quota.recruitAcademicCombined > 0) {
    return [
      {
        gender: null,
        populationGender: null,
        recruitCount: quota.recruitAcademicCombined,
      },
    ];
  }

  return [Gender.MALE, Gender.FEMALE].map((gender) => ({
    gender,
    populationGender: gender,
    recruitCount: getFireRecruitCount(quota, examType, gender),
  }));
}

export function getFireApplicantCount(
  quota: {
    recruitAcademicCombined: number;
    applicantPublicMale: number | null;
    applicantPublicFemale: number | null;
    applicantRescue: number | null;
    applicantAcademicMale: number | null;
    applicantAcademicFemale: number | null;
    applicantAcademicCombined: number | null;
    applicantEmtMale: number | null;
    applicantEmtFemale: number | null;
  },
  examType: ExamType,
  gender: Gender | null
): number | null {
  if (!isFireExamType(examType)) {
    throw new Error("소방 서비스에서 사용할 수 없는 채용유형입니다.");
  }
  if (examType === ExamType.CAREER_RESCUE) return quota.applicantRescue;
  if (examType === ExamType.CAREER_ACADEMIC) {
    if (quota.recruitAcademicCombined > 0) return quota.applicantAcademicCombined;
    return gender === Gender.FEMALE
      ? quota.applicantAcademicFemale
      : quota.applicantAcademicMale;
  }
  if (examType === ExamType.CAREER_EMT) {
    return gender === Gender.FEMALE ? quota.applicantEmtFemale : quota.applicantEmtMale;
  }
  return gender === Gender.FEMALE ? quota.applicantPublicFemale : quota.applicantPublicMale;
}
