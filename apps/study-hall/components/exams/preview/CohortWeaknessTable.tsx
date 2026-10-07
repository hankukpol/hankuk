'use client';
import { useState } from 'react';
import { morningCohortRisk, regularCohortRisk, type CohortStudent } from '@/lib/exam-preview/report-summary';
import type { PreviewData } from '@/lib/exam-preview/types';
import { number, Table } from './ReportTable';
import styles from './preview.module.css';

type Filter = 'all' | 'failed' | 'declining' | 'belowAverage';

/**
 * 관리자 반 분석 첫 화면: 누가 어느 과목이 약한지 한 표로 본다(운영자 요구 2026-09-25).
 * 새 통계를 만들지 않고 반 분석 결과(정기 ranking, 아침 studentSubjects)에 과락 판정만 더한다.
 *
 * 표 모양(운영자 요청 2026-10-07): 칸 안에 상자를 넣지 않는다. 이름(개인 분석 링크)과 수험번호는 다른 열이고,
 * 모든 칸은 가운데 정렬이다. '확인할 내용'은 문제가 있는 항목만 종류별 한 줄(과목 이름 포함)로 적는다.
 * 과목별 수치 근거는 접힘 상자로 행마다 넣지 않는다 — 이름을 누르면 개인 분석에서 같은 근거를 본다.
 */
export function CohortWeaknessTable({data,division,query}:{data:PreviewData;division:string;query:string}) {
 const [filter,setFilter]=useState<Filter>('all');
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
 const filters:Array<{id:Filter;label:string;count:number}>=[
  {id:'all',label:'전체',count:rows.length},
  {id:'failed',label:failLabel,count:failedCount},
  {id:'declining',label:regular?'하락':'점수 하락',count:decliningCount},
  ...(!regular?[{id:'belowAverage' as const,label:'학원 평균보다 낮음',count:belowAverageCount}]:[]),
 ];
 return <section className="admin-flat-page" aria-label="학생별 취약점" data-cohort-weakness>
  <h2 className="admin-section-title">학생별 취약점</h2>
  <p className="admin-help">{rows.length}명 · {failLabel} {failedCount}명{bySubject.length?` (${bySubject.map(x=>`${x.name} ${x.count}명`).join(', ')})`:''} · {regular?'하락':'점수 하락'} {decliningCount}명{!regular?` · 학원 평균보다 낮음 ${belowAverageCount}명`:''}. 위험 순(과락 → 하락 → 점수 낮은 순)으로 정렬합니다.</p>
  {/* 목록의 상태 구분은 표 바로 위 세그먼트(건수 포함)다(DESIGN.md 0절 6항). */}
  <nav className="admin-subtabs" aria-label="학생 필터" data-report-navigation>
   {filters.map(f=><button key={f.id} type="button" className="admin-subtab" aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)}>{`${f.label} ${f.count}`}</button>)}
  </nav>
  <Table label="학생별 취약점" heads={['이름','수험번호',regular?'총점 · 반 석차':'기간 평균',...subjects.map(s=>s.name),'확인할 내용',...(withStudy?['작업']:[])]}>
   {visible.map(r=><tr key={r.studentId}>
    <th scope="row"><a className="admin-table-link" href={href(r.studentId)} aria-label={`${r.name} 개인 분석`}>{r.name}</a></th>
    <td className="tabular-nums">{r.studentNumber}</td>
    <td className="tabular-nums">{regular?`${number(r.score)} · ${r.rank}위${r.partial?' (부분)':''}`:number(r.score)}</td>
    {subjects.map(s=>{const c=r.cells[s.id];return <td key={s.id} className={`tabular-nums${c?.below?' text-admin-danger':''}`}>{c?.value==null?'—':number(c.value)}{!regular&&c?.below?` · 미만 ${c.below}회`:''}</td>;})}
    <td className={styles.wrapCell}>{regular?<p className={r.failed.length?'text-admin-danger':r.declining.length?'text-admin-warning':undefined}>{r.summary||'—'}</p>:<MorningFindings row={r} failLabel={failLabel} cutoffUsed={data.failCutoffPercent>0}/>}</td>
    {withStudy&&<td><a className="admin-button admin-button-compact" href={studyHref(r.studentId)} aria-label={`${r.name} 학습 면담`}>학습 면담</a></td>}
   </tr>)}
  </Table>
  <p className="admin-help">{data.failCutoffPercent>0?`${failLabel}은 과목 만점의 ${number(data.failCutoffPercent,'%')} 미만입니다(합격 판정 아님). `:''}{regular?'과목 칸은 이번 회차 점수, ':'과목 칸은 조회 기간 평균이며 과락선 미만 회수를 함께 적습니다. '}점수 하락은 이전 성적과의 비교입니다. 학원 평균보다 낮음은 같은 시험 응시자와의 비교이며, 점수가 떨어졌다는 뜻은 아닙니다. 응시 부족은 응시율이 학원 기준보다 낮아 추세를 판단하지 않은 과목입니다. 이름을 누르면 개인 분석에서 과목별 수치 근거를 봅니다.</p>
 </section>;
}

/** 아침 '확인할 내용': 문제가 있는 종류만 한 줄씩. 아무 문제가 없으면 '특이 사항 없음'. */
function MorningFindings({row,failLabel,cutoffUsed}:{row:CohortStudent;failLabel:string;cutoffUsed:boolean}) {
 if(row.score===null) return <p className="text-admin-text-muted">성적 없음</p>;
 const lines=[
  cutoffUsed&&row.failed.length?{text:`${failLabel}: ${row.failed.join(', ')}`,tone:'text-admin-danger'}:null,
  row.declining.length?{text:`점수 하락: ${row.declining.join(', ')}`,tone:'text-admin-warning'}:null,
  row.belowAverage?.length?{text:`학원 평균보다 낮음: ${row.belowAverage.join(', ')}`,tone:'text-admin-warning'}:null,
  row.lowAttendance?.length?{text:`응시 부족: ${row.lowAttendance.join(', ')}`,tone:'text-admin-text-muted'}:null,
 ].filter((line):line is {text:string;tone:string}=>Boolean(line));
 if(!lines.length) return <p className="text-admin-text-muted">특이 사항 없음</p>;
 return <div className="space-y-1">{lines.map(line=><p key={line.text} className={line.tone}>{line.text}</p>)}</div>;
}
