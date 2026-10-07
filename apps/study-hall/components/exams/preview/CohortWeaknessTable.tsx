'use client';
import { useState } from 'react';
import { morningCohortRisk, regularCohortRisk } from '@/lib/exam-preview/report-summary';
import type { PreviewData } from '@/lib/exam-preview/types';
import { Chips, number, Table } from './ReportTable';
import styles from './preview.module.css';

/**
 * 관리자 반 분석 첫 화면: 누가 어느 과목이 약한지 한 표로 본다(운영자 요구 2026-09-25).
 * 새 통계를 만들지 않고 반 분석 결과(정기 ranking, 아침 studentSubjects)에 과락 판정만 더한다.
 */
export function CohortWeaknessTable({data,division,query}:{data:PreviewData;division:string;query:string}) {
 const [filter,setFilter]=useState<'all'|'failed'|'declining'|'belowAverage'>('all');
 const regular=data.kind==='regular';
 const subjects=(regular?data.regularCohort?.subjects:data.morningCohort?.subjectDefinitions)??[];
 const rows=regular
  ?(data.regularCohort?regularCohortRisk(data.regularCohort.ranking,subjects,data.failCutoffPercent):[])
  :(data.morningCohort?morningCohortRisk(data.morningCohort.studentSubjects,subjects,data.failCutoffPercent):[]);
 if(!rows.length) return null;
 const failLabel=regular?'과락':'과락선 미만';
 const failedCount=rows.filter(r=>r.failed.length).length, decliningCount=rows.filter(r=>r.declining.length).length;
 const bySubject=subjects.map(s=>({name:s.name,count:rows.filter(r=>r.cells[s.id]?.below).length})).filter(x=>x.count);
 const belowAverageCount=rows.filter(r=>r.belowAverage?.length).length;
 const visible=rows.filter(r=>filter==='all'||(filter==='failed'?r.failed.length>0:filter==='belowAverage'?Boolean(r.belowAverage?.length):r.declining.length>0));
 const href=(id:string)=>`/${division}/admin/exams${data.isPreview?'/preview':''}/students/${id}?${query}`;
 // 취약점을 본 자리에서 바로 학습 면담을 연다(운영자 요청 2026-10-07). 미리보기 데이터는 실제 학생이 아니라 두지 않는다.
 const studyHref=(id:string)=>`/${division}/admin/interviews?studentId=${encodeURIComponent(id)}&category=study`;
 const withStudy=!data.isPreview;
 return <section className="admin-flat-page" aria-label="학생별 취약점" data-cohort-weakness>
  <h2 className="admin-section-title">학생별 취약점</h2>
  <p className="admin-help">{rows.length}명 · {failLabel} {failedCount}명{bySubject.length?` (${bySubject.map(x=>`${x.name} ${x.count}명`).join(', ')})`:''} · {regular?'하락':'점수 하락'} {decliningCount}명{!regular?` · 학원 평균보다 낮음 ${belowAverageCount}명`:''}. 위험 순(과락 → 하락 → 점수 낮은 순)으로 정렬합니다.</p>
  <Chips label="학생 필터" items={[{id:'all',label:`전체 ${rows.length}`},{id:'failed',label:`${failLabel} ${failedCount}`},{id:'declining',label:`${regular?'하락':'점수 하락'} ${decliningCount}`},...(!regular?[{id:'belowAverage',label:`학원 평균보다 낮음 ${belowAverageCount}`}]:[])]} active={filter} onChange={id=>setFilter(id as typeof filter)}/>
  <Table label="학생별 취약점" heads={['학생',regular?'총점 · 반 석차':'기간 평균',...subjects.map(s=>s.name),'확인할 내용',...(withStudy?['작업']:[])]}>
   {visible.map(r=><tr key={r.studentId}>
    <th scope="row"><a className="admin-text-action" href={href(r.studentId)} aria-label={`${r.name} 개인 분석`}>{r.name}</a><br/><span className="admin-help">{r.studentNumber}</span></th>
    <td className="admin-table-amount">{regular?`${number(r.score)} · ${r.rank}위${r.partial?' (부분)':''}`:number(r.score)}</td>
    {subjects.map(s=>{const c=r.cells[s.id];return <td key={s.id} className={`admin-table-amount${c?.below?' text-admin-danger':''}`}>{c?.value==null?'—':number(c.value)}{!regular&&c?.below?` · 미만 ${c.below}회`:''}</td>;})}
    <td className={`${styles.wrapCell}${r.failed.length?' text-admin-danger':r.declining.length?' text-admin-warning':''}`}>{regular?r.summary||'—':<div className="space-y-2"><p>{r.score===null?'성적 없음':r.failed.length?`과락 기준 미달: ${r.failed.join(', ')}`:data.failCutoffPercent>0?'기록된 점수 중 과락 기준 미달 없음':'과락 기준 미사용'}</p>{r.declining.length>0&&<p>점수 하락: {r.declining.join(', ')}</p>}{Boolean(r.belowAverage?.length)&&<p>학원 평균보다 낮음: {r.belowAverage!.join(', ')}</p>}{Boolean(r.evidence?.length)&&<details className="admin-disclosure"><summary>과목별 판단 근거 {r.evidence!.length}건</summary><ul className="admin-disclosure-body space-y-2">{r.evidence!.map((e,i)=><li key={i}><strong>{e.subject} · {e.label}</strong><p>{e.detail}</p></li>)}</ul></details>}</div>}</td>
    {withStudy&&<td><a className="admin-button admin-button-compact" href={studyHref(r.studentId)} aria-label={`${r.name} 학습 면담`}>학습 면담</a></td>}
   </tr>)}
  </Table>
  <p className="admin-help">{data.failCutoffPercent>0?`${failLabel}은 과목 만점의 ${number(data.failCutoffPercent,'%')} 미만입니다(합격 판정 아님). `:''}{regular?'과목 칸은 이번 회차 점수, ':'과목 칸은 조회 기간 평균이며 과락선 미만 회수를 함께 적습니다. '}점수 하락은 이전 성적과의 비교입니다. 학원 평균보다 낮음은 같은 시험 응시자와의 비교이며, 점수가 떨어졌다는 뜻은 아닙니다. 이름을 누르면 개인 분석으로 이동합니다.</p>
 </section>;
}
