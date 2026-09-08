"use client";

import type { RegularStudentReport } from '@/lib/exam-analysis-types';
import type { MorningStudentReport } from '@/lib/morning-exam-analysis-types';
import { morningLearningPlan, regularLearningPlan } from '@/lib/exam-learning-plan';
import type { ItemDiagnosticRow } from '@/lib/exam-analysis-meta';
const number = (value: number | null) => value == null ? '자료 없음' : Number(value.toFixed(1)).toString();
const items = (rows: ItemDiagnosticRow[]) => rows.length ? rows.map(row => row.itemNo).join(', ') : '없음';

function ReviewMethod() {
  return <section className="admin-section"><h3 className="admin-section-title">복습 실행 방법</h3>
    <ol className="list-decimal pl-4 space-y-2">
      <li>아래 문항을 해설 없이 다시 풀고, 선택한 답의 근거를 적습니다.</li>
      <li>해설·교재에서 관련 조문, 판례 또는 개념을 확인하고 틀린 선택지를 고쳐 씁니다.</li>
      <li>무응답은 시간 부족·마킹 누락·미학습 중 실제 원인을 직접 확인합니다.</li>
      <li>다음 복습 때 다시 풀어 정답과 근거를 함께 설명할 수 있는지 점검합니다.</li>
    </ol>
    <p className="admin-help">정답률은 가져온 시험 응시 집단 기준입니다. 쉬운 문항의 오답이 반드시 실수를 뜻하지는 않습니다. 문항별 풀이 시간과 오답 사유는 수집하지 않아 원인을 자동 확정하지 않습니다.</p>
    <p className="admin-help">복습 기록: 확인한 원인 __________ · 교재/페이지 __________ · 재풀이 날짜 __________ · 재풀이 결과 __________ (출력 후 작성)</p>
  </section>;
}

export function RegularLearningSummary({ report }: { report: RegularStudentReport }) {
  const plan = regularLearningPlan(report);
  return <section className="admin-section admin-flat-page" data-learning-summary>
    <h2 className="admin-section-title">개인 학습 진단 · 다음 시험 준비</h2>
    <p className="admin-help">등록된 과목 만점과 실제 응시 과목을 기준으로 분석합니다. 쉬운 문항 오답 수, 잃은 점수 순으로 복습할 과목을 안내합니다. 예상 상승 점수나 합격 가능성을 뜻하지 않습니다.</p>
    <p className="admin-notice">최근 6개월 중 같은 만점·같은 응시 과목으로 전과목 응시한 {plan.compatibleCount}회 평균 {number(plan.average)}점.
      {plan.change == null ? ' 비교 가능한 시험이 부족해 변화를 판단하지 않습니다.' : ` ${plan.firstDate} → ${plan.lastDate} 총점 변화 ${plan.change > 0 ? '+' : ''}${number(plan.change)}점.`}
      {plan.excludedCount > 0 ? ` 일부 미응시 또는 과목·만점이 다른 ${plan.excludedCount}회는 이 평균에서 제외했습니다.` : ''}</p>
    <p className="admin-help">난이도가 보정된 실력 변화는 아닙니다. 전체 리포트의 월별 외부 상위%와 응시 인원을 함께 확인하세요. 집단이 달라 석차 변화도 그대로 실력 변화로 단정할 수 없습니다.</p>
    <div className="admin-table-frame"><table><thead><tr>{['과목','총점 내 비중','내 점수 / 만점','잃은 점수','외부 평균 대비','쉬운 문항 오답','무응답'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{plan.priorities.map(subject => <tr key={subject.subjectId}><th scope="row">{subject.name}</th><td>{number(subject.examWeight)}%</td><td>{number(subject.my)} / {number(subject.fullScore)}</td><td>{number(subject.lostPoints)}</td><td>{number(subject.gap)}</td><td>{subject.easyWrong.length}개</td><td>{subject.unanswered.length}개</td></tr>)}</tbody></table></div>
    {!plan.priorities.length && <p className="admin-empty-state">응시 과목이 없어 복습 과제를 만들 수 없습니다.</p>}
    <p className="admin-help">잃은 점수 = 응시 과목 만점 − 내 점수. 쉬움 기준은 관리자가 설정한 외부 정답률 기준입니다. 무응답은 쉬운 문항 오답 수와 중복 집계하지 않습니다.</p>
    <h3 className="admin-section-title">{report.session.examDate.slice(0,10)} 복습 문항</h3>
    <div className="admin-table-frame"><table><thead><tr><th>과목</th><th>먼저 다시 풀 쉬운 문항</th><th>무응답 확인</th><th>그 밖의 오답</th></tr></thead><tbody>{plan.priorities.map(subject => <tr key={subject.subjectId}><th scope="row">{subject.name}</th><td>{items(subject.easyWrong)}</td><td>{items(subject.unanswered)}</td><td>{items(subject.otherWrong)}</td></tr>)}</tbody></table></div>
    <ReviewMethod />
  </section>;
}

export function MorningLearningSummary({ report }: { report: MorningStudentReport }) {
  const plan = morningLearningPlan(report);
  return <section className="admin-section admin-flat-page" data-learning-summary>
    <h2 className="admin-section-title">진도 학습 진단 · 다음 복습 과제</h2>
    <p className="admin-help">과목별 시험 범위가 달라 전체 평균만으로 학습 상태를 판단하지 않습니다. 실제 입력된 단원 라벨과 문항 정오를 근거로 복습 과제를 제시합니다.</p>
    {!plan.length && <p className="admin-empty-state">응시 기록이 없어 진도 학습 진단을 만들 수 없습니다.</p>}
    {plan.map(subject => <section className="admin-section" key={subject.subjectId}>
      <h3 className="admin-section-title">{subject.name}</h3>
      <p>응시 {subject.attended}/{subject.expected}회 · 쉬운 문항 오답 {subject.easyWrongCount}개 · 무응답 {subject.unansweredCount}개</p>
      {subject.withheld ? <p className="admin-notice">응시율 또는 비교 기록이 부족해 추세 판정을 보류합니다. 아래는 실제 응시한 문항의 복습 목록입니다.</p> : <p className="admin-help">과목별 이동평균과 추세는 전체 리포트의 상세 분석에서 확인하세요.</p>}
      <p className="admin-help">{subject.topics.length ? '반 평균보다 낮았던 단원 (격차가 큰 순): ' + subject.topics.map(topic => `${topic.topic} ${number(topic.gap)}점, ${topic.count}회`).join(' / ') : '반 평균보다 낮은 단원이 없거나 단원 비교 자료가 없습니다.'} 단원별 비교는 입력된 라벨 기준이며, 한 번의 결과만으로 지속적 약점이라고 확정하지 않습니다.</p>
      <div className="admin-table-frame"><table><thead><tr><th>시험일</th><th>진도</th><th>쉬운 문항 오답</th><th>무응답</th></tr></thead><tbody>{subject.tasks.filter(task => task.easyWrong.length || task.unanswered.length).map(task => <tr key={task.date}><th scope="row">{task.date}</th><td>{task.topic || '진도 라벨 없음'}</td><td>{items(task.easyWrong)}</td><td>{items(task.unanswered)}</td></tr>)}</tbody></table></div>
      {!subject.easyWrongCount && !subject.unansweredCount && <p className="admin-help">이 과목은 쉬운 문항 오답과 무응답이 없습니다. 그 밖의 오답은 날짜별 문항 분석에서 확인하세요.</p>}
    </section>)}
    <ReviewMethod />
  </section>;
}
