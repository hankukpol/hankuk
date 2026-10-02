'use client';

import type { PreviewData } from '@/lib/exam-preview/types';
import { morningLearningPlan } from '@/lib/exam-learning-plan';
import { reviewGroups } from '@/lib/exam-preview/metrics';
import { number, Table } from './ReportTable';
import type { ReviewSelection } from './ReviewQueue';

/** Same-exam comparisons only. Observed performance is not a diagnosis of mastery. */
export function LearningOverview({data,onSubject,onReview}:{data:PreviewData;onSubject:(id:string)=>void;onReview:(selection:ReviewSelection)=>void}) {
 const plans=data.morning?morningLearningPlan(data.morning):[];
 const rows=data.subjects.map(subject=>{
  const exams=data.comparisons.filter(r=>r.subjectId===subject.id);
  const paired=exams.filter(r=>r.my!==null&&r.external!==null&&r.fullScore!==null&&r.fullScore>0);
  const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
  const my=paired.length?mean(paired.map(r=>r.my!/r.fullScore!*100)):null;
  const benchmark=paired.length?mean(paired.map(r=>r.external!/r.fullScore!*100)):null;
  const gap=my===null||benchmark===null?null:Math.round((my-benchmark)*10)/10;
  const items=data.items.filter(i=>i.subjectId===subject.id);
  const easy=reviewGroups(items,data.easyThreshold).easy;
  const wrong=items.filter(i=>i.correct===false);
  const plan=plans.find(p=>p.subjectId===subject.id);
  const ready=plan?.withheld===false&&paired.length>=plan.requiredSessions;
  const lowest=[...paired.filter(r=>items.some(i=>i.sessionId===r.sessionId&&i.correct===false))].sort((a,b)=>(a.my!-a.external!)/a.fullScore!-(b.my!-b.external!)/b.fullScore!)[0];
  return {...subject,paired,my,benchmark,gap,easy,wrong,ready,lowest};
 });
 const review=(r:typeof rows[number],all=false)=>onReview({title:`${r.name} · ${!all&&r.easy.length?'우선 복습':'내 오답'}`,ids:(!all&&r.easy.length?r.easy:r.wrong).map(i=>i.id)});
 return <section className="admin-flat-page" aria-label="과목별 성적">
  <Table label="과목별 성적" heads={['과목','내 점수','시험 평균','상태']}>
   {rows.map(r=><tr key={r.id}>
    <th scope="row"><button type="button" className="admin-table-link" onClick={()=>onSubject(r.id)}>{r.name}</button></th>
    <td className="admin-table-amount">{r.my===null?'—':number(r.my)}</td>
    <td className="admin-table-amount">{r.benchmark===null?'—':number(r.benchmark)}</td>
    <td><details className="score-row-detail">
     <summary>{r.gap===null?'비교 자료 없음':!r.ready?'판단 보류':r.gap>0?'평균 이상':r.gap<0?'보완 필요':'평균 수준'}</summary>
     <div className="space-y-2">
      <p className="admin-help">비교 {r.paired.length}회{r.gap===null?'':` · 평균 대비 ${r.gap>0?'+':''}${number(r.gap)}점`}{!r.ready?' · 학원 분석 기준에 필요한 기록 부족':''}</p>
      {r.lowest&&<p>{r.lowest.date} · {r.lowest.topic||'출제 범위 미등록'}</p>}
      <div className="flex flex-wrap gap-4">
       <button type="button" className="admin-text-action" onClick={()=>onSubject(r.id)}>시험별 상세</button>
       {r.wrong.length>0&&<button type="button" className="admin-text-action" onClick={()=>review(r,true)}>오답 {r.wrong.length}개 보기</button>}
       {r.easy.length>0&&<button type="button" className="admin-text-action" onClick={()=>review(r)}>우선 복습 {r.easy.length}개</button>}
      </div>
     </div>
    </details></td>
   </tr>)}
  </Table>
  <p className="admin-help">100점 환산 · 같은 시험끼리 비교 · 상태를 누르면 상세 보기</p>
 </section>;
}
