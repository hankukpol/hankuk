"use client";

import { useId, useState, type ReactNode } from 'react';
import type { RegularStudentReport } from '@/lib/exam-analysis-types';
import type { MorningStudentReport } from '@/lib/morning-exam-analysis-types';
import { morningLearningPlan, regularLearningPlan } from '@/lib/exam-learning-plan';
import type { ItemDiagnosticRow } from '@/lib/exam-analysis-meta';
import { ReportMetrics, useReportDocument } from './ReportPresentation';
import { SubjectScoreComparison } from './charts/SubjectInsightCharts';
const number = (value: number | null) => value == null ? '자료 없음' : Number(value.toFixed(1)).toString();
const items = (rows: ItemDiagnosticRow[]) => rows.length ? rows.map(row => row.itemNo).join(', ') : '없음';

export function SubjectTabs({ subjects, label = "학습 진단 과목" }: { label?: string; subjects: { id: string; name: string; content: ReactNode }[] }) {
  const prefix = useId();
  const document = useReportDocument();
  const [selected, setSelected] = useState(subjects[0]?.id ?? '');
  const active = subjects.some(subject => subject.id === selected) ? selected : subjects[0]?.id ?? '';
  if (!subjects.length) return <p className="admin-empty-state">표시할 과목이 없습니다.</p>;
  return <>
    {document && subjects.length > 1 && <div data-report-navigation className="admin-filter-bar">
      <label className="admin-label">{label}
        <select value={active} onChange={event => setSelected(event.target.value)}>
          {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </label>
    </div>}
    {!document && <div data-report-navigation className="admin-choice-group" role="group" aria-label={label}>
      {subjects.map(subject => <button key={subject.id} type="button" className="admin-choice-button admin-choice-button-auto"
        aria-pressed={active === subject.id} data-active={active === subject.id} onClick={() => setSelected(subject.id)}>{subject.name}</button>)}
    </div>}
    {subjects.map(subject => <section key={subject.id} id={prefix + '-panel-' + subject.id} aria-label={subject.name} hidden={active !== subject.id} data-report-panel className="admin-section">
      <h3 className="admin-section-title">{subject.name}</h3>
      {subject.content}
    </section>)}
  </>;
}

export function PaperReviewExam({ date, examName, scope, easyWrong, unanswered, otherWrong }: { date: string; examName: string; scope?: string | null; easyWrong: ItemDiagnosticRow[]; unanswered: ItemDiagnosticRow[]; otherWrong: ItemDiagnosticRow[] }) {
  const document = useReportDocument();
  if (document) return <article className="admin-section" data-paper-review>
    <h4 className="admin-section-title">{date} · {examName}</h4>
    {scope && <p className="admin-help">시험 범위: {scope}</p>}
    <div className="admin-table-frame"><table className="report-detail-table">
      <thead><tr><th scope="col">복습 항목</th><th scope="col">문항 번호</th></tr></thead>
      <tbody>
        <tr><th scope="row">정답률 높은 문항의 오답</th><td>{items(easyWrong)}</td></tr>
        <tr><th scope="row">무응답</th><td>{items(unanswered)}</td></tr>
        <tr><th scope="row">기타 오답</th><td>{items(otherWrong)}</td></tr>
      </tbody>
    </table></div>
    {!easyWrong.length && !unanswered.length && !otherWrong.length && <p className="admin-help">이 시험에 복습할 오답이 없습니다.</p>}
  </article>;
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
  return <section className="admin-section" data-learning-summary>
    <h2 className="admin-section-title">먼저 복습할 문항</h2>
    <p className="admin-help">최근 6개월 비교 가능 {plan.compatibleCount}회 · 평균 {number(plan.average)}점
      {plan.change == null ? ' · 변화 판단 보류' : ' · 총점 변화 ' + (plan.change > 0 ? '+' : '') + number(plan.change) + '점'}
      {plan.excludedCount > 0 ? ' · 과목·만점 차이 또는 일부 미응시 ' + plan.excludedCount + '회 제외' : ''}
    </p>
    <SubjectTabs subjects={plan.priorities.map(subject => ({ id: subject.subjectId, name: subject.name, content: <>
      <SubjectScoreComparison name={subject.name} mine={subject.my} external={subject.externalAvg} internal={subject.internalAvg} maximum={subject.fullScore} />
      <ReportMetrics entries={[["내 점수 / 만점", `${number(subject.my)} / ${number(subject.fullScore)}`], ["외부 평균 대비", number(subject.gap)]]} />
      <p className="admin-help">총점 비중 {number(subject.examWeight)}% · 쉬운 문항 오답 {subject.easyWrong.length}개 · 무응답 {subject.unanswered.length}개</p>
      <PaperReviewExam date={report.session.examDate.slice(0, 10)} examName={report.session.examTypeName} easyWrong={subject.easyWrong} unanswered={subject.unanswered} otherWrong={subject.otherWrong} />
    </> }))} />
  </section>;
}

export function MorningLearningSummary({ report }: { report: MorningStudentReport }) {
  const plan = morningLearningPlan(report);
  return <section className="admin-section" data-learning-summary>
    <h2 className="admin-section-title">먼저 복습할 문항</h2>
    <SubjectTabs subjects={plan.map(subject => {
      const tasks = subject.tasks.filter(task => task.easyWrong.length || task.unanswered.length || task.otherWrong.length).sort((a, b) => Number(Boolean(b.easyWrong.length || b.unanswered.length)) - Number(Boolean(a.easyWrong.length || a.unanswered.length)) || b.date.localeCompare(a.date));
      return { id: subject.subjectId, name: subject.name, content: <>
        <p className="admin-help">응시 {subject.attended}/{subject.expected}회{subject.attended > 0 ? ' · 쉬운 문항 오답 ' + subject.easyWrongCount + '개 · 무응답 ' + subject.unansweredCount + '개' : ''}</p>
        {subject.attended === 0 ? <p className="admin-empty-state">선택한 기간에 응시 기록이 없습니다.</p> : <>
          <SubjectScoreComparison name={subject.name} mine={subject.average} external={subject.externalAvg} internal={subject.internalAvg} />
          {subject.withheld && <p className="admin-help">비교 자료 부족 · 추세 판단 보류</p>}
          {tasks.length > 0 ? tasks.map(task => <PaperReviewExam key={task.date} date={task.date} examName={report.examType.name} scope={task.topic} easyWrong={task.easyWrong} unanswered={task.unanswered} otherWrong={task.otherWrong} />) : <p className="admin-empty-state">{subject.tasks.length ? '이 기간에 복습할 오답이 없습니다.' : '문항별 응답 자료가 없습니다.'}</p>}
        </>}
      </> };
    })} />
  </section>;
}
