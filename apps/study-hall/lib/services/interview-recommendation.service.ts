import { morningCohortRisk, regularCohortRisk } from "@/lib/exam-preview/report-summary";
import { getExamPreview } from "@/lib/exam-preview/service";
import type { InterviewScoreSignal } from "@/lib/interview-recommend";
import { kstDate } from "@/lib/management-policy";
import { reportRange } from "@/lib/student-report";
import { pickCounselingExamTypes } from "@/lib/services/interview-study-context.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

async function optional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/**
 * 면담 권장 대상의 성적 신호. 관리자 반 분석의 '학생별 취약점'과 같은 계산이다.
 * 아침은 상담 자료와 같은 최근 4주, 정기는 가장 최근 회차다. 시험 관리가 꺼진 학원은 빈 목록이다.
 */
export async function getInterviewScoreSignals(slug: string): Promise<InterviewScoreSignal[]> {
  const { featureFlags } = await getDivisionFeatureSettings(slug);
  if (!featureFlags.examManagement) return [];
  const { morningType, regularType } = await pickCounselingExamTypes(slug);
  const viewer = { role: "ADMIN" as const };
  const range = reportRange(kstDate());
  const [morning, regular] = await Promise.all([
    morningType ? optional(() => getExamPreview(slug, "morning", { examTypeId: morningType.id, from: range.from, to: range.to }, viewer)) : null,
    regularType ? optional(() => getExamPreview(slug, "regular", { examTypeId: regularType.id }, viewer)) : null,
  ]);

  const signals: InterviewScoreSignal[] = [];
  if (morning?.morningCohort) {
    for (const row of morningCohortRisk(morning.morningCohort.studentSubjects, morning.morningCohort.subjectDefinitions, morning.failCutoffPercent)) {
      if (row.failed.length || row.declining.length) signals.push({ studentId: row.studentId, source: "morning", failed: row.failed, declining: row.declining });
    }
  }
  if (regular?.regularCohort) {
    for (const row of regularCohortRisk(regular.regularCohort.ranking, regular.regularCohort.subjects, regular.failCutoffPercent)) {
      if (row.failed.length || row.declining.length) signals.push({ studentId: row.studentId, source: "regular", failed: row.failed, declining: row.declining });
    }
  }
  return signals;
}
