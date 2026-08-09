import { ExamType, Gender } from "@prisma/client";
import { isPoliceExamType } from "@/lib/tenant-exam";

export interface PoliceRecruitmentCohort {
  gender: null;
  populationGender: Gender | null;
  recruitCount: number;
}

export function getPolicePassMultiple(recruitCount: number): number | null {
  if (!Number.isInteger(recruitCount) || recruitCount < 1) return null;
  return 2;
}

export function getPoliceRecruitCount(
  quota: { recruitCount: number; recruitCountCareer: number },
  examType: ExamType
): number {
  if (!isPoliceExamType(examType)) {
    throw new Error("경찰 서비스에서 사용할 수 없는 채용유형입니다.");
  }
  return examType === ExamType.CAREER ? quota.recruitCountCareer : quota.recruitCount;
}

export function getPoliceRecruitmentCohorts(
  quota: { recruitCount: number; recruitCountCareer: number },
  examType: ExamType
): PoliceRecruitmentCohort[] {
  if (!isPoliceExamType(examType)) {
    throw new Error("경찰 서비스에서 사용할 수 없는 채용유형입니다.");
  }
  return [
    {
      gender: null,
      populationGender: null,
      recruitCount: getPoliceRecruitCount(quota, examType),
    },
  ];
}

export function getPoliceApplicantCount(
  quota: { applicantCount: number | null; applicantCountCareer: number | null },
  examType: ExamType
): number | null {
  if (!isPoliceExamType(examType)) {
    throw new Error("경찰 서비스에서 사용할 수 없는 채용유형입니다.");
  }
  return examType === ExamType.CAREER ? quota.applicantCountCareer : quota.applicantCount;
}
