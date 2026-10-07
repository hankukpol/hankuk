import { getExamPreview } from "@/lib/exam-preview/service";
import type { PreviewData } from "@/lib/exam-preview/types";
import { kstDate } from "@/lib/management-policy";
import { reportRange, type ReportRange } from "@/lib/student-report";
import { listExamTypes } from "@/lib/services/exam.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";

/** 아침 성적 분석 API 와 같은 상한. 넘으면 아침 분석이 비어 버리므로 미리 줄인다. */
export const INTERVIEW_SCORE_MAX_DAYS = 92;

async function optional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/** 학원에서 쓰는 아침·정기 시험 종류. 상담 자료와 같은 기준(활성 시험 중 첫 번째)이다. */
export async function pickCounselingExamTypes(slug: string) {
  const types = (await optional(() => listExamTypes(slug))) ?? [];
  return {
    morningType: types.find((t) => t.category === "MORNING" && t.isActive !== false) ?? null,
    regularType: types.find((t) => t.category === "REGULAR" && t.isActive !== false) ?? null,
  };
}

/**
 * 면담에 쓰는 학생 한 명의 시험 자료. 관리자 API 에서만 부른다(권한 확인은 호출하는 쪽).
 * 학원 전체 문항을 읽는 무거운 조회라 면담 요약(getInterviewContext)과 따로 두고, 화면이 필요할 때만 부른다.
 */
export async function loadInterviewExamData(slug: string, studentId: string, range: ReportRange) {
  await getStudentDetail(slug, studentId);
  const { featureFlags } = await getDivisionFeatureSettings(slug);
  if (!featureFlags.examManagement) return { enabled: false as const, morningType: null, regularType: null, morning: null as PreviewData | null, regular: null as PreviewData | null };
  const { morningType, regularType } = await pickCounselingExamTypes(slug);
  const viewer = { role: "ADMIN" as const };
  const [morning, regular] = await Promise.all([
    morningType ? optional(() => getExamPreview(slug, "morning", { examTypeId: morningType.id, from: range.from, to: range.to, studentId }, viewer)) : null,
    regularType ? optional(() => getExamPreview(slug, "regular", { examTypeId: regularType.id, studentId }, viewer)) : null,
  ]);
  return {
    enabled: true as const,
    morningType,
    regularType,
    morning: morning && morning.comparisons.length ? morning : null,
    regular: regular && regular.dates.length && regular.regular ? regular : null,
  };
}

export function interviewScoreRange(from?: unknown, to?: unknown): ReportRange {
  return reportRange(kstDate(), from, to, INTERVIEW_SCORE_MAX_DAYS);
}
