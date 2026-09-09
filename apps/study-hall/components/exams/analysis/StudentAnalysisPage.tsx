"use client";
import { useEffect, useState } from 'react';
import type { ExamTypeItem } from '@/lib/services/exam.service';
import type { RegularStudentReport as RegularReport, RegularCohortAnalysis } from '@/lib/exam-analysis-types';
import type { MorningStudentReport as MorningReport, MorningCohortAnalysis } from '@/lib/morning-exam-analysis-types';
import { defaultMorningAnalysisRange } from '@/lib/morning-exam-analysis-schemas';
import { RegularStudentReport } from './RegularStudentReport';
import { MorningStudentReport } from './MorningStudentReport';

type Selection = { kind?: string; examTypeId?: string; examDate?: string; from?: string; to?: string };
export function StudentAnalysisPage({ division, studentId, examTypes, initial }: { division: string; studentId: string; examTypes: ExamTypeItem[]; initial: Selection }) {
 const [kind, setKind] = useState(initial.kind === 'morning' ? 'morning' : 'regular');
 const [typeId, setTypeId] = useState(initial.examTypeId || '');
 const [date, setDate] = useState(initial.examDate || '');
 const [range, setRange] = useState({...defaultMorningAnalysisRange(), ...(initial.from && initial.to ? {from:initial.from,to:initial.to} : {})});
 const [attempt,setAttempt]=useState(0);
 const [data,setData]=useState<{key:string; regular?:RegularReport; morning?:MorningReport; students:{id:string;name:string}[]; dates:string[]; error?:string}>();
 const types=examTypes.filter(type=>type.category === (kind === 'regular' ? 'REGULAR':'MORNING'));
 const selected=types.find(type=>type.id===typeId) || types[0];
 const key=JSON.stringify([kind,selected?.id,date,range,studentId,attempt]);
 useEffect(()=>{
  if(!selected) return;
  const controller=new AbortController();
  const read=async(path:string)=>{const response=await fetch(path,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error();return response.json();};
  void(async()=>{let dates:string[]=[];try{
   const base=`/api/${encodeURIComponent(division)}/${kind==='regular'?'exams':'morning-exams'}/analysis`;

   if(kind==='regular') { const list=await read(`${base}/sessions?${new URLSearchParams({examTypeId:selected.id})}`);dates=list.sessions.map((s:{examDate:string})=>s.examDate); }
   const query=new URLSearchParams({examTypeId:selected.id,...(kind==='regular'?{examDate:dates.includes(date)?date:dates[0]||date}:range)});
   const [result,cohort]=await Promise.all([read(`${base}/student/${encodeURIComponent(studentId)}?${query}`),read(`${base}?${query}`)]);
   const students=kind==='regular'?(cohort.analysis as RegularCohortAnalysis).ranking.map(row=>({id:row.studentId,name:row.name})):(cohort.analysis as MorningCohortAnalysis).studentSubjects.map(row=>({id:row.studentId,name:row.name}));
   if(!controller.signal.aborted)setData({key,regular:kind==='regular'?result.report:undefined,morning:kind==='morning'?result.report:undefined,students:Array.from(new Map(students.map(row=>[row.id,row])).values()),dates});
  }catch{if(!controller.signal.aborted)setData({key,students:[],dates,error:'선택한 학생의 분석 자료를 불러오지 못했습니다. 시험 기록과 조회 기간을 확인해주세요.'});}})();
  return()=>controller.abort();
 },[key,division,studentId,kind,selected,date,range]);
 const current=data?.key===key?data:undefined;
 const report=current?.regular || current?.morning;
 const root=`/${encodeURIComponent(division)}/admin/exams`;
 const returnQuery=new URLSearchParams({...initial,tab:initial.kind==='morning'?'morning':'regular',view:'analysis'});
 const navigateStudent=(id:string)=>{const query=new URLSearchParams({kind,examTypeId:selected?.id||'',examDate:current?.regular?.session.examDate||date,...range});window.location.assign(`${root}/students/${encodeURIComponent(id)}?${query}`);};
 return <div className="admin-flat-page">
  <a className="admin-button" href={`${root}?${returnQuery}`}>← 성적 목록으로</a>
  <h1 className="admin-page-title">{report?.student.name || '학생'} 개인 성적 분석</h1>
  <div className="admin-tabs" aria-label="분석할 시험 구분">{[['regular','정기 모의고사'],['morning','아침 모의고사']].map(([id,label])=><button type="button" className="admin-tab" data-active={kind===id} aria-pressed={kind===id} key={id} onClick={()=>{setKind(id);setTypeId('');setDate('');}}>{label}</button>)}</div>
  <div className="admin-filter-bar">
   <label className="admin-label">학생 선택<select value={studentId} onChange={event=>navigateStudent(event.target.value)}><option value={studentId}>{report?.student.name||'현재 학생'}</option>{current?.students.filter(student=>student.id!==studentId).map(student=><option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
   <label className="admin-label">시험 종류<select value={selected?.id||''} onChange={event=>{setTypeId(event.target.value);setDate('');}}>{types.map(type=><option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
   {kind==='regular'?<label className="admin-label">시험 날짜<select value={current?.regular?.session.examDate||date} onChange={event=>setDate(event.target.value)}>{current?.dates.map(value=><option key={value} value={value}>{value.slice(0,10)}</option>)}</select></label>:<><label className="admin-label">시작일<input type="date" value={range.from} onChange={event=>setRange({...range,from:event.target.value})}/></label><label className="admin-label">종료일<input type="date" value={range.to} onChange={event=>setRange({...range,to:event.target.value})}/></label></>}
  </div>
  <nav className="admin-filter-bar" aria-label="개인 분석 바로가기"><a className="admin-button" href="#personal-diagnosis">학습 진단</a><a className="admin-button" href="#personal-trend">성적 추이</a><a className="admin-button" href="#personal-subjects">과목·단원 분석</a><a className="admin-button" href="#personal-items">문항별 복습</a></nav>
  {!selected?<p className="admin-empty-state">등록된 시험 종류가 없습니다.</p>:current?.error?<div role="alert" className="admin-notice admin-notice-danger"><p>{current.error}</p><button type="button" className="admin-button" onClick={()=>setAttempt(value=>value+1)}>다시 시도</button></div>:!report?<p role="status" className="admin-help">개인 성적을 불러오는 중입니다.</p>:current?.regular?<RegularStudentReport report={current.regular} mode="admin"/>:current?.morning?<MorningStudentReport report={current.morning} mode="admin"/>:null}
 </div>;
}
