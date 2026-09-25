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
 const [filter,setFilter]=useState<'all'|'failed'|'declining'>('all');
 const regular=data.kind==='regular';
 const subjects=(regular?data.regularCohort?.subjects:data.morningCohort?.subjectDefinitions)??[];
 const rows=regular
  ?(data.regularCohort?regularCohortRisk(data.regularCohort.ranking,subjects,data.failCutoffPercent):[])
  :(data.morningCohort?morningCohortRisk(data.morningCohort.studentSubjects,subjects,data.failCutoffPercent):[]);
 if(!rows.length) return null;
 const failLabel=regular?'과락':'과락선 미만';
 const failedCount=rows.filter(r=>r.failed.length).length, decliningCount=rows.filter(r=>r.declining.length).length;
 const bySubject=subjects.map(s=>({name:s.name,count:rows.filter(r=>r.cells[s.id]?.below).length})).filter(x=>x.count);
 const visible=rows.filter(r=>filter==='all'||(filter==='failed'?r.failed.length>0:r.declining.length>0));
 const href=(id:string)=>`/${division}/admin/exams${data.isPreview?'/preview':''}/students/${id}?${query}`;
 return <section className="admin-flat-page" aria-label="학생별 취약점" data-cohort-weakness>
  <h2 className="admin-section-title">학생별 취약점</h2>
  <p className="admin-help">{rows.length}명 · {failLabel} {failedCount}명{bySubject.length?` (${bySubject.map(x=>`${x.name} ${x.count}명`).join(', ')})`:''} · 하락 {decliningCount}명. 위험 순(과락 → 하락 → 점수 낮은 순)으로 정렬합니다.</p>
  <Chips label="학생 필터" items={[{id:'all',label:`전체 ${rows.length}`},{id:'failed',label:`${failLabel} ${failedCount}`},{id:'declining',label:`하락 ${decliningCount}`}]} active={filter} onChange={id=>setFilter(id as typeof filter)}/>
  <Table label="학생별 취약점" heads={['학생',regular?'총점 · 반 석차':'기간 평균',...subjects.map(s=>s.name),'요약']}>
   {visible.map(r=><tr key={r.studentId}>
    <th scope="row"><a className="admin-text-action" href={href(r.studentId)} aria-label={`${r.name} 개인 분석`}>{r.name}</a><br/><span className="admin-help">{r.studentNumber}</span></th>
    <td className="admin-table-amount">{regular?`${number(r.score)} · ${r.rank}위${r.partial?' (부분)':''}`:number(r.score)}</td>
    {subjects.map(s=>{const c=r.cells[s.id];return <td key={s.id} className={`admin-table-amount${c?.below?' text-admin-danger':''}`}>{c?.value==null?'—':number(c.value)}{!regular&&c?.below?` · 미만 ${c.below}회`:''}</td>;})}
    <td className={`${styles.wrapCell}${r.failed.length?' text-admin-danger':r.declining.length?' text-admin-warning':''}`}>{r.summary||'—'}</td>
   </tr>)}
  </Table>
  <p className="admin-help">{data.failCutoffPercent>0?`${failLabel}은 과목 만점의 ${number(data.failCutoffPercent,'%')} 미만입니다(합격 판정 아님). `:''}{regular?'과목 칸은 이번 회차 점수, ':'과목 칸은 조회 기간 평균이며 과락선 미만 회수를 함께 적습니다. '}하락은 총점·석차 하락(정기) 또는 연속 하락·평균 하락(아침) 진단입니다. 이름을 누르면 개인 분석으로 이동합니다.</p>
 </section>;
}
