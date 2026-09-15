"use client";

import type { RegularStudentReport } from "@/lib/exam-analysis-types";
import type { MorningStudentReport } from "@/lib/morning-exam-analysis-types";
import { morningLearningPlan, regularLearningPlan } from "@/lib/exam-learning-plan";
import { SubjectTabs } from "./LearningActionSummary";
import { SubjectScoreComparison } from "./charts/SubjectInsightCharts";

function ReviewPriority({ easy, unanswered, other, hasEvidence }: { easy: number; unanswered: number; other: number; hasEvidence: boolean }) {
  return <div className="admin-notice">
    <p className="admin-label">우선 복습</p>
    <p>{!hasEvidence ? "문항별 응답 자료가 부족해 취약점을 판단할 수 없습니다." : easy > 0 ? `정답률이 높은 문항에서 ${easy}개를 틀렸습니다. 학습 진단에서 해당 문항부터 확인하세요.` : unanswered > 0 ? `무응답 ${unanswered}개가 있습니다. 풀지 못한 문항을 먼저 확인하세요.` : other > 0 ? `오답 ${other}개가 있습니다. 학습 진단에서 문항 번호를 확인하세요.` : "기록된 문항에 복습할 오답이 없습니다."}</p>
    {hasEvidence && <p className="admin-help">쉬운 문항 오답 {easy}개 · 무응답 {unanswered}개 · 기타 오답 {other}개</p>}
  </div>;
}

export function RegularSubjectOverview({ report }: { report: RegularStudentReport }) {
  const plan = regularLearningPlan(report);
  return <section className="admin-section">
    <h2 className="admin-section-title">과목별 핵심 진단</h2>
    <SubjectTabs label="핵심 진단 과목" subjects={plan.priorities.map(subject => ({ id: subject.subjectId, name: subject.name, content: <>
      <ReviewPriority easy={subject.easyWrong.length} unanswered={subject.unanswered.length} other={subject.otherWrong.length} hasEvidence={report.items.list.some(item => item.subjectId === subject.subjectId) && (report.items.responseCorrectness === undefined || report.items.responseCorrectness.some(row => row.subjectId === subject.subjectId && row.correctness !== null))} />
      <SubjectScoreComparison name={subject.name} mine={subject.my} external={subject.externalAvg} internal={subject.internalAvg} maximum={subject.fullScore} />
    </> }))} />
  </section>;
}

export function MorningSubjectOverview({ report }: { report: MorningStudentReport }) {
  const plan = morningLearningPlan(report);
  return <section className="admin-section">
    <h2 className="admin-section-title">과목별 핵심 진단</h2>
    <SubjectTabs label="핵심 진단 과목" subjects={plan.map(subject => ({ id: subject.subjectId, name: subject.name, content: <>
      <ReviewPriority easy={subject.easyWrongCount} unanswered={subject.unansweredCount} other={subject.tasks.reduce((sum, task) => sum + task.otherWrong.length, 0)} hasEvidence={subject.tasks.length > 0} />
      <p className="admin-help">응시 {subject.attended}/{subject.expected}회{subject.withheld ? " · 비교 자료 부족으로 추세 판단 보류" : ""}</p>
      <SubjectScoreComparison name={subject.name} mine={subject.average} external={subject.externalAvg} internal={subject.internalAvg} />
    </> }))} />
  </section>;
}
