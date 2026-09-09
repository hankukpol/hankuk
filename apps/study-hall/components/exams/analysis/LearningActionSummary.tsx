"use client";

import { useId, useState, type ReactNode } from 'react';
import { AdminTabs } from '@/components/ui/AdminTabs';
import type { RegularStudentReport } from '@/lib/exam-analysis-types';
import type { MorningStudentReport } from '@/lib/morning-exam-analysis-types';
import { morningLearningPlan, regularLearningPlan } from '@/lib/exam-learning-plan';
import type { ItemDiagnosticRow } from '@/lib/exam-analysis-meta';
const number = (value: number | null) => value == null ? '자료 없음' : Number(value.toFixed(1)).toString();
const items = (rows: ItemDiagnosticRow[]) => rows.length ? rows.map(row => row.itemNo).join(', ') : '없음';

export function SubjectTabs({ subjects, label = "학습 진단 과목" }: { label?: string; subjects: { id: string; name: string; content: ReactNode }[] }) {
  const prefix = useId();
  const [selected, setSelected] = useState(subjects[0]?.id ?? '');
  const active = subjects.some(subject => subject.id === selected) ? selected : subjects[0]?.id ?? '';
  if (!subjects.length) return <p className="admin-empty-state">표시할 과목이 없습니다.</p>;
  return <>
    <div data-report-navigation><AdminTabs variant="secondary" scrollable className="exam-subject-tabs" label={label} idPrefix={prefix} items={subjects.map(subject => ({ id: subject.id, label: subject.name }))} activeId={active} onChange={setSelected} /></div>
    {subjects.map(subject => <section key={subject.id} role="tabpanel" id={prefix + '-panel-' + subject.id} aria-labelledby={prefix + '-' + subject.id} hidden={active !== subject.id} data-report-panel className="admin-section">
      <h3 className="admin-section-title">{subject.name}</h3>
      {subject.content}
    </section>)}
  </>;
}

export function PaperReviewExam({ date, examName, scope, easyWrong, unanswered, otherWrong }: { date: string; examName: string; scope?: string | null; easyWrong: ItemDiagnosticRow[]; unanswered: ItemDiagnosticRow[]; otherWrong: ItemDiagnosticRow[] }) {
  return <article className="admin-section paper-review-row" data-paper-review>
    <h4 className="admin-label paper-review-heading"><span>{date}</span><span>{examName}</span></h4>
    {scope && <p className="admin-help">시험 범위: {scope}</p>}
    {(easyWrong.length > 0 || unanswered.length > 0) && <dl className="paper-review-answers">
      <div><dt className="admin-label">정답률 높은 문항의 오답 번호</dt><dd>{items(easyWrong)}</dd></div>
      <div><dt className="admin-label">무응답 번호</dt><dd>{items(unanswered)}</dd></div>
    </dl>}
    {otherWrong.length > 0 && <details className="admin-disclosure"><summary>기타 오답 {otherWrong.length}문항</summary><div className="admin-disclosure-body">{items(otherWrong)}</div></details>}
    {!easyWrong.length && !unanswered.length && !otherWrong.length && <p className="admin-empty-state">이 시험에 복습할 오답이 없습니다.</p>}
  </article>;
}

export function RegularLearningSummary({ report }: { report: RegularStudentReport }) {
  const plan = regularLearningPlan(report);
  return <section className="admin-section" data-learning-summary id="personal-diagnosis">
    <h2 className="admin-section-title">먼저 복습할 문항</h2>
    <p className="admin-help">최근 6개월 비교 가능 {plan.compatibleCount}회 · 평균 {number(plan.average)}점
      {plan.change == null ? ' · 변화 판단 보류' : ' · 총점 변화 ' + (plan.change > 0 ? '+' : '') + number(plan.change) + '점'}
      {plan.excludedCount > 0 ? ' · 과목·만점 차이 또는 일부 미응시 ' + plan.excludedCount + '회 제외' : ''}
    </p>
    <SubjectTabs subjects={plan.priorities.map(subject => ({ id: subject.subjectId, name: subject.name, content: <>
      <div className="admin-metric-strip">
        <div className="admin-metric-box"><p className="admin-metric-box-label">내 점수 / 만점</p><p className="admin-metric-box-value">{number(subject.my)} / {number(subject.fullScore)}</p></div>
        <div className="admin-metric-box"><p className="admin-metric-box-label">외부 평균 대비</p><p className={subject.gap == null ? "admin-metric-box-value admin-metric-box-status" : "admin-metric-box-value"}>{number(subject.gap)}</p></div>
      </div>
      <p className="admin-help">총점 비중 {number(subject.examWeight)}% · 쉬운 문항 오답 {subject.easyWrong.length}개 · 무응답 {subject.unanswered.length}개</p>
      <PaperReviewExam date={report.session.examDate.slice(0, 10)} examName={report.session.examTypeName} easyWrong={subject.easyWrong} unanswered={subject.unanswered} otherWrong={subject.otherWrong} />
    </> }))} />
  </section>;
}

export function MorningLearningSummary({ report }: { report: MorningStudentReport }) {
  const plan = morningLearningPlan(report);
  return <section className="admin-section" data-learning-summary id="personal-diagnosis">
    <h2 className="admin-section-title">먼저 복습할 문항</h2>
    <SubjectTabs subjects={plan.map(subject => {
      const tasks = subject.tasks.filter(task => task.easyWrong.length || task.unanswered.length || task.otherWrong.length).sort((a, b) => Number(Boolean(b.easyWrong.length || b.unanswered.length)) - Number(Boolean(a.easyWrong.length || a.unanswered.length)) || b.date.localeCompare(a.date));
      return { id: subject.subjectId, name: subject.name, content: <>
        <p className="admin-help">응시 {subject.attended}/{subject.expected}회{subject.attended > 0 ? ' · 쉬운 문항 오답 ' + subject.easyWrongCount + '개 · 무응답 ' + subject.unansweredCount + '개' : ''}</p>
        {subject.attended === 0 ? <p className="admin-empty-state">선택한 기간에 응시 기록이 없습니다.</p> : <>
          {subject.withheld && <p className="admin-help">비교 자료 부족 · 추세 판단 보류</p>}
          {tasks.length > 0 ? tasks.map(task => <PaperReviewExam key={task.date} date={task.date} examName={report.examType.name} scope={task.topic} easyWrong={task.easyWrong} unanswered={task.unanswered} otherWrong={task.otherWrong} />) : <p className="admin-empty-state">{subject.tasks.length ? '이 기간에 복습할 오답이 없습니다.' : '문항별 응답 자료가 없습니다.'}</p>}
        </>}
      </> };
    })} />
  </section>;
}
