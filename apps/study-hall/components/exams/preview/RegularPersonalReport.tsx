'use client';
import { TopicLearning, ReviewWorkbench, ExamTimeEntry, LearningPriorities } from './LearningViews';
import { RegularLongitudinal } from './RegularLongitudinal';
import { Children, cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { AdminTabs } from '@/components/ui/AdminTabs';
import type { Comparison, PreviewData } from '@/lib/exam-preview/types';
import { reviewGroups, visibleDistributionBins } from '@/lib/exam-preview/metrics';
import { gapText, morningStudyRows, type StudyRow } from '@/lib/exam-preview/morning-personal';
import { subjectPriorities } from '@/lib/exam-preview/learning-analytics';
import { regularHeadline, subjectVerdict, type SubjectVerdict } from '@/lib/exam-preview/report-summary';
import { PortalMetricCard } from '@/components/student-view/StudentPortalUi';
import { useLearning } from './LearningProvider';
import { Chips } from './ReportTable';
import { ReferenceItemTable } from './ReferenceItemTable';
import { PreviewTrend } from './PreviewCharts';
import { PreviewPrintButton } from './PreviewPrintButton';
import { SlideOver } from '@/components/ui/SlideOver';
import { FileText, MessageSquareText } from 'lucide-react';
import styles from './preview.module.css';
import type { ReviewSelection } from './ReviewQueue';
import { StudyTable } from './StudyTable';
import { WrongRateTopFive } from './WrongRateTopFive';
import { PagedRows } from './ReportPaging';
import { ReportAudience } from './ReportAudience';
import { useStudyTasks } from './StudyTasksContext';
import { StudentStudyTasks } from '@/components/student-view/StudentStudyTasks';
import { VERDICT_WORDS, aboutRankOf100, regularFlagWords } from '@/lib/student-words';
const n=(v:number|null|undefined,suffix='')=>v==null?'자료 없음':`${Number(v.toFixed(1))}${suffix}`;
function Grid({label,heads,children,compact=false,className=''}:{label:string;heads:string[];children:ReactNode;compact?:boolean;className?:string}) {
 const rows=compact?Children.map(children,row=>isValidElement<{children:ReactNode}>(row)?cloneElement(row,{},Children.map(row.props.children,(cell,index)=>isValidElement(cell)?cloneElement(cell as ReactElement<Record<string,unknown>>,{'data-label':heads[index]}):cell)):row):children;

 return <div className={`admin-table-frame ${compact?styles.facts:''} ${className}`}><table aria-label={label}><thead><tr>{heads.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>;
}
type RegularTab='summary'|'study'|'peers'|'history'|'items';
// 판정 값은 그대로 두고 화면 말만 쉽게 바꾼다(lib/student-words.ts). 아침 성적표의 상태 말과 같다.
const verdictLabel=VERDICT_WORDS;
// 변화는 방향 말로 쓴다. 상위 비율은 작아질수록 좋아진 것이므로 호출하는 쪽에서 (처음 - 지금)을 넘긴다.
const changeText=(change:number|null,unit:string,up:string,down:string)=>{if(change===null)return '자료 부족';const size=Math.round(Math.abs(change)*10)/10;return size===0?'같음':`${size}${unit} ${change>0?up:down}`;};
const changeTone=(change:number|null)=>change===null||Math.round(Math.abs(change)*10)===0?'':change>0?'text-admin-success':'text-admin-danger';
const gapTone=(gap:number|null)=>gap===null||Math.round(gap*10)===0?'':gap>0?' text-admin-success':' text-admin-danger';
const verdictTone=(v:SubjectVerdict)=>v==='과락'?'text-admin-danger':v==='취약'?'text-admin-danger':v==='우수'?'text-admin-success':v==='판정 불가'?'text-admin-text-muted':'';
export function RegularPersonalReport({data,mode,division}:{data:PreviewData;mode:'admin'|'student';division?:string}) {
 const report=data.regular;
 // 학생 화면은 관리자용 세부 열을 빼고 쉬운 말을 쓴다(운영자 요청 2026-10-07). 판정·숫자는 같다.
 const student=mode==='student';
 const studyTasks=useStudyTasks();
 // 학생·관리자 모두 한 화면에 한 주제만 보인다(운영자 결정 2026-09-25). 인쇄할 때만 전부 펼친다.
 const [tab,setTab]=useState<RegularTab>('summary');
 const [subject,setSubject]=useState('');
 const [studySubject,setStudySubject]=useState('');
 const [detailSubject,setDetailSubject]=useState('');
 const detailId=report?.stats.subjects.some(s=>s.subjectId===detailSubject)?detailSubject:report?.stats.subjects[0]?.subjectId;
 const [detailFilter,setDetailFilter]=useState('wrong');
 const [reviewSelection,setReviewSelection]=useState<ReviewSelection|null>(null);
 const [peerIndex,setPeerIndex]=useState<number|null>(null);
 const peer=peerIndex===null?null:report?.competitors[peerIndex];
 const [printing,setPrinting]=useState(false);
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const [mobile,setMobile]=useState(false);
 const learning=useLearning();
 useEffect(()=>{const m=matchMedia('(max-width: 767px)');const update=()=>setMobile(m.matches);update();m.addEventListener('change',update);return()=>m.removeEventListener('change',update);},[]);
 const current=data.comparisons.filter(r=>r.date===data.range.to);
 const history=report?.history;
 const totalRows:Comparison[]=(history?.rows??[]).map(h=>({sessionId:h.date,date:h.date,subjectId:'total',subjectName:'총점',topic:null,fullScore:h.fullScore,my:h.isPartial?null:h.total,external:null,internal:null,top10:null,top30:null,externalCount:h.externalCount,internalCount:0,externalFileCount:0,externalRank:h.externalRank,internalRank:null}));
 const trendRows=subject?data.comparisons.filter(r=>r.subjectId===subject):totalRows;
 const comparable=(history?.rows??[]).filter(h=>!h.isPartial);
 const first=comparable[0],last=comparable[comparable.length-1],previous=comparable[comparable.length-2];
 const sameFull=comparable.length>1&&new Set(comparable.map(h=>h.fullScore)).size===1;
 const section=(id:RegularTab,title:string,body:ReactNode)=><section id={`regular-${id}`} role="tabpanel" aria-labelledby={`regular-analysis-${id}`} data-report-panel tabIndex={-1} hidden={!printing&&tab!==id} className="admin-flat-page" aria-label={title}><h2 className={printing?'admin-section-title':'admin-section-title sr-only'}>{title}</h2>{body}</section>;
 const focusPanel=(id:string)=>requestAnimationFrame(()=>{const target=document.getElementById(id);target?.scrollIntoView({block:'start'});target?.focus();});
 const openHistory=(id:string)=>{setSubject(id);setTab('history');focusPanel('regular-history');};
 const study=morningStudyRows(data,current);
 const hasTopics=Boolean(learning?.data&&data.items.some(i=>learning.data!.document.assignments[i.id]));
 const openItem=(item:{id:string;subjectId:string})=>{setDetailSubject(item.subjectId);setReviewSelection(null);setDetailFilter('all');setTab('items');focusPanel('regular-items');};
 const openAll=(row:StudyRow)=>{setDetailSubject(row.subjectId);setReviewSelection({title:`${row.subjectName} 틀린 문항`,ids:[...row.easy,...row.other].map(i=>i.id)});setDetailFilter('wrong');setTab('items');focusPanel('regular-items');};
 const externalGap=report&&!report.myScore.isPartial&&report.stats.external.average!==null?report.myScore.total-report.stats.external.average:null;
 const subjectChips=(report?.stats.subjects??[]).map(s=>({id:s.subjectId,label:s.name}));
 const priorities=learning?.data&&data.student?subjectPriorities(learning.data,data.examType.id,data.range.to,data.easyThreshold):[];
 const headline=report?regularHeadline({total:report.myScore.total,fullScore:report.session.fullScore,isPartial:report.myScore.isPartial,rank:report.ranks.external.rank,count:report.ranks.external.count,topPercent:report.ranks.external.topPercent,subjects:report.stats.subjects.map(s=>({name:s.name,my:s.my,fullScore:s.fullScore,grade:s.grade})),failCutoffPercent:data.failCutoffPercent,easyWrong:reviewGroups(data.items,data.easyThreshold).easy.length,repeatedTopic:priorities.find(p=>p.repeated.length)?.repeated[0]??null,wrong:data.items.filter(i=>i.correct===false).length,declining:report.flags.some(f=>f.kind==='totalDrop'||f.kind==='rankDrop')}):null;

 return <ReportAudience value={mode}><div className={`admin-flat-page ${styles.reportTables}`}><div data-report-root className="admin-flat-page">
  <header className="admin-workspace-toolbar"><div><h2 className="admin-section-title">{data.student?.name} · {data.examType.name}</h2><p className="admin-help">{data.range.to} / 전과목 종합 성적표{data.isPreview?' / 테스트 데이터':''}</p></div>{mode==='admin'&&<div className="flex flex-wrap gap-2" data-report-print>{division&&data.student&&<a className="admin-button" href={`/${division}/admin/interviews?studentId=${encodeURIComponent(data.student.id)}&category=study`}><MessageSquareText className="h-4 w-4" aria-hidden="true"/>학습 면담</a>}{division&&data.student&&<a className="admin-button" href={`/${division}/admin/students/${encodeURIComponent(data.student.id)}/report`}><FileText className="h-4 w-4" aria-hidden="true"/>상담 자료 인쇄</a>}<PreviewPrintButton single prepare={()=>{setPrinting(true);return()=>setPrinting(false);}}/></div>}</header>
  <div data-report-navigation><AdminTabs variant="secondary" className={styles.mainTabs} idPrefix="regular-analysis" panelId={`regular-${tab}`} label="정기 성적 분석" items={[{id:'summary',label:'요약'},{id:'study',label:'공부할 것'},{id:'peers',label:'석차 비교'},{id:'history',label:'점수 변화'},{id:'items',label:'문항'}]} activeId={tab} onChange={id=>setTab(id as RegularTab)}/></div>
  {section('summary','요약',report&&headline?<>
   <p className={`admin-notice${headline.tone==='danger'?' admin-notice-danger':headline.tone==='warning'?' admin-notice-warning':''}`} data-headline>{headline.text}</p>
   {report.myScore.isPartial&&<p className="admin-help">일부 과목만 응시한 성적입니다. 전과목 성적과 직접 비교하지 마세요.</p>}
   {/* 학생은 목표가 없으면 '상위 30% 평균까지' 칸을 두지 않고 세 칸으로 둔다(DESIGN.md: 요약이 3개면 -3). */}
   <div className={student&&!(report.target&&!report.myScore.isPartial)?"admin-portal-summary admin-portal-summary-3":"admin-portal-summary"} data-score-strip>
    <PortalMetricCard label="총점" value={`${n(report.myScore.total)} / ${n(report.session.fullScore)}점`}/>
    <PortalMetricCard label="석차" value={report.ranks.external.rank===null?'자료 없음':`${report.ranks.external.rank}위 / ${report.ranks.external.count}명`} caption={report.ranks.external.topPercent===null?undefined:student?aboutRankOf100(report.ranks.external.topPercent)??undefined:`상위 ${n(report.ranks.external.topPercent,'%')}`}/>
    <PortalMetricCard label="전체 평균과 차이" value={externalGap===null?'자료 없음':gapText(externalGap)} caption={`전체 평균 ${n(report.stats.external.average,'점')}`}/>
    {report.target&&!report.myScore.isPartial?<PortalMetricCard label="목표까지" value={n(Math.max(0,report.target.targetScore-report.myScore.total),'점')} caption={`목표 ${n(report.target.targetScore,'점')}`}/>:!student&&<PortalMetricCard label="상위 30% 평균까지" value={n(!report.myScore.isPartial&&report.stats.external.top30Avg!==null?Math.max(0,report.stats.external.top30Avg-report.myScore.total):null,'점')} caption={`상위 30% 평균 ${n(report.stats.external.top30Avg,'점')}`}/>}
   </div>
   <Grid label="과목별 성적" heads={student?['과목','내 점수 / 만점','전체 평균','차이','상태']:['과목','내 점수 / 만점','전체 평균','차이','석차','상태']}>{report.stats.subjects.map(s=>{const v=subjectVerdict(s,data.failCutoffPercent);const gap=s.externalAvg===null?null:s.my-s.externalAvg;return <tr key={s.subjectId}><th scope="row"><button type="button" data-report-navigation className="admin-table-link" aria-label={`${s.name} 점수 변화 보기`} onClick={()=>openHistory(s.subjectId)}>{s.name}</button><span className="preview-print-only">{s.name}</span></th><td className="admin-table-amount">{n(s.my)} / {n(s.fullScore)}</td><td className="admin-table-amount">{n(s.externalAvg)}</td><td className={`admin-table-amount${gapTone(gap)}`}>{gap===null?'—':gapText(gap)}</td>{!student&&<td>{s.externalRank===null?'—':`${s.externalRank}위${s.externalCount?` / ${s.externalCount}명`:''}`}</td>}<td className={verdictTone(v)}>{verdictLabel[v]}</td></tr>;})}</Grid>
   <p className="admin-help">{data.failCutoffPercent>0?`과락은 만점의 ${n(data.failCutoffPercent,'%')} 미만(합격 판정 아님). `:''}전체 평균과 석차는 같은 시험을 본 전체 응시자 기준입니다. 과목을 누르면 점수 변화를 봅니다.</p>
   {mode==='admin'&&data.counseling&&<div className="admin-flat-page" data-screen-only><h3 className="admin-section-title">출결 ({data.counseling.from} ~ {data.counseling.to}) · 관리자만 보임</h3><Grid label="출결 요약" heads={['출석','지각','결석','휴대폰 제출','미제출']}><tr>{[data.counseling.present,data.counseling.tardy,data.counseling.absent,data.counseling.submitted,data.counseling.notSubmitted].map((v,i)=><td key={i} className="admin-table-amount">{v}건</td>)}</tr></Grid></div>}
  </>:<p className="admin-empty-state">선택한 회차의 전과목 성적 자료가 없습니다.</p>)}
  {section('study','공부할 것',report?<>
   {student&&<StudentStudyTasks tasks={studyTasks.filter(t=>t.examCategory!=='MORNING')}/>}
   <StudyTable rows={study} easyThreshold={data.easyThreshold} showDate={false} onItem={openItem} onAll={openAll}/>
   {!student&&(report.stats.advice.length>0)&&<p className="admin-help">{report.stats.advice.join(' ')}</p>}
   {hasTopics&&<><h3 className="admin-section-title">단원별 점검</h3><Chips label="단원별 점검 과목" items={[{id:'',label:'전체'},...subjectChips]} active={studySubject} onChange={setStudySubject}/>
    {(printing||!studySubject)?<LearningPriorities data={data} onSubject={setStudySubject}/>:<TopicLearning data={data} subject={studySubject}/>}</>}
  </>:<p className="admin-empty-state">선택한 회차의 전과목 성적 자료가 없습니다.</p>)}
  {section('items','문항',report?<>
   <Chips label="문항 과목" items={subjectChips} active={detailId??''} onChange={id=>{setDetailSubject(id);setDetailFilter('wrong');setReviewSelection(null);}}/>
   {(report.stats.subjects).filter(s=>printing||s.subjectId===detailId).map(s=>{const qs=data.items.filter(i=>i.subjectId===s.subjectId);const g=reviewGroups(qs,data.easyThreshold);const itemList=printing?qs:reviewSelection?qs.filter(i=>reviewSelection.ids.includes(i.id)):qs.filter(i=>detailFilter==='all'||detailFilter==='wrong'&&i.correct===false||detailFilter==='easy'&&g.easy.some(q=>q.id===i.id));return <div key={s.subjectId} className="space-y-4" data-items-subject={s.subjectId}>
    {printing&&<h3 className="admin-section-title">{s.name} 문항별 분석</h3>}
    {!printing&&<Chips label={`${s.name} 문항 분류`} items={[{id:'wrong',label:`내가 틀린 문제 ${qs.filter(i=>i.correct===false).length}`},{id:'easy',label:`많이 맞힌 문제 중 틀림 ${g.easy.length}`},{id:'all',label:`전체 ${qs.length}`},...(student?[]:[{id:'top5',label:'많이 틀린 문제 5'}])]} active={reviewSelection?'':detailFilter} onChange={id=>{setDetailFilter(id);setReviewSelection(null);}}/>}
    {!printing&&reviewSelection&&<div className={styles.selectionContext} data-report-navigation><strong>{reviewSelection.title} · {reviewSelection.ids.length}문항</strong><button type="button" className="admin-text-action" onClick={()=>{setReviewSelection(null);setDetailFilter('wrong');}}>이 과목 틀린 문제 전체</button></div>}
    {!printing&&<p className="admin-help">{reviewSelection?'선택한 분류의 모든 문항입니다. 내 답과 정답, 정답률을 비교해 보세요.':detailFilter==='top5'?'전체 응시자가 가장 많이 틀린 5문항입니다. 내가 맞힌 문제도 포함하며, 통계가 없는 문항은 제외합니다.':detailFilter==='easy'?`전체 응시자 정답률이 ${data.easyThreshold}% 이상인데 내가 답을 선택하고 틀린 문항입니다.`:detailFilter==='wrong'?'내가 틀린 문항 전체입니다. 답을 선택하지 않은 문항도 포함됩니다.':'선택한 과목의 모든 문항과 내 채점 결과입니다.'}</p>}
    {!printing&&detailFilter==='top5'?<WrongRateTopFive items={qs}/>:itemList.length?<ReferenceItemTable idPrefix="subject" items={itemList} personal externalOnly mobile={mobile&&!printing} expanded={expanded} toggle={id=>setExpanded({...expanded,[id]:!expanded[id]})}/>:<p className="admin-empty-state">조건에 맞는 문항이 없습니다.</p>}
    {!printing&&detailFilter!=='top5'&&detailFilter!=='all'&&itemList.some(i=>i.correct===false)&&<div className="admin-flat-page" data-report-navigation><h3 className="admin-section-title">복습 기록</h3><ReviewWorkbench data={data} subject={s.subjectId} ids={itemList.map(i=>i.id)}/></div>}
   </div>;})}
   <ExamTimeEntry data={data}/>
  </>:<p className="admin-empty-state">선택한 회차의 전과목 성적 자료가 없습니다.</p>)}
  {section('history','점수 변화',<>
   {Boolean(report?.flags.length)&&<ul className="admin-notice admin-notice-warning space-y-1" aria-label="추이 점검">{report!.flags.map((flag,i)=><li key={i}>{student?regularFlagWords(flag):flag.detail}</li>)}</ul>}
   <p className="admin-help">{history?.from??data.range.from} ~ {data.range.to} · {history?.coveredMonths??0}개월 / {history?.rows.length??0}회 기록. 기록이 없는 달과 부분 성적은 0점으로 채우지 않습니다.</p>
   <Grid compact label="6개월 변화 요약" heads={student?['첫 시험보다 총점','지난 시험보다 총점']:['첫 시험보다 총점','지난 시험보다 총점','첫 시험보다 상위 비율']}><tr><td className={changeTone(sameFull?last.total-first.total:null)}>{changeText(sameFull?last.total-first.total:null,'점','올라감','내려감')}</td><td className={changeTone(previous&&last.fullScore===previous.fullScore?last.total-previous.total:null)}>{changeText(previous&&last.fullScore===previous.fullScore?last.total-previous.total:null,'점','올라감','내려감')}</td>{!student&&<td className={changeTone(first&&last&&comparable.length>1&&first.externalTopPercent!==null&&last.externalTopPercent!==null?first.externalTopPercent-last.externalTopPercent:null)}>{changeText(first&&last&&comparable.length>1&&first.externalTopPercent!==null&&last.externalTopPercent!==null?first.externalTopPercent-last.externalTopPercent:null,'%p','좋아짐','나빠짐')}</td>}</tr></Grid>
   <Chips label="점수 변화 과목" items={[{id:'',label:'전과목'},...data.subjects.map(s=>({id:s.id,label:s.name}))]} active={subject} onChange={setSubject}/>
   {!subject?<RegularLongitudinal data={data}/>:trendRows.length?<PreviewTrend rows={trendRows} personal externalOnly externalLabel="전체 평균"/>:<p className="admin-empty-state">추이를 표시할 기록이 없습니다.</p>}
   {subject&&!printing?<Grid className={styles.historyTable} label="선택 과목 회차별 성적" heads={['시험일',`${data.subjects.find(s=>s.id===subject)?.name??'과목'} 점수 / 만점`,'전체 평균','차이','전체 석차']}>{trendRows.map(row=>{const gap=row.my===null||row.external===null?null:row.my-row.external;return <tr key={row.sessionId}><td>{row.date}</td><td>{n(row.my)} / {n(row.fullScore)}</td><td>{n(row.external)}</td><td className={gapTone(gap).trim()||undefined}>{gap===null?'—':gapText(gap)}</td><td>{row.externalRank===null?'—':`${row.externalRank}위 / ${n(row.externalCount,'명')}`}</td></tr>;})}</Grid>:printing&&<Grid label="6개월 회차별 성적" heads={['시험일','총점 / 만점',...(mobile&&!printing?[]:data.subjects.map(s=>s.name)),'전체 석차',...(mobile&&!printing?[]:['상위 비율','상태'])]}>{(history?.rows??[]).map(h=><tr key={h.date}><td>{h.date}</td><td>{h.total} / {h.fullScore}{mobile&&!printing&&<span className={`${styles.mobileCell} preview-mobile-only`}>{h.isPartial?'부분 성적':'전과목'}</span>}</td>{(!mobile||printing)&&data.subjects.map(s=><td key={s.id}>{n(h.subjectScores[s.id])}</td>)}<td>{n(h.externalRank,'위')} / {h.externalCount}명</td>{(!mobile||printing)&&<><td>{n(h.externalTopPercent,'%')}</td><td>{h.isPartial?'부분 성적':'전과목'}</td></>}</tr>)}</Grid>}
   {Boolean(data.legacyResults?.length)&&<><h3 className="admin-section-title">직접 입력한 성적 {data.legacyResults!.length}건</h3><p className="admin-help">문항 분석 자료가 없는 점수와 날짜 미등록 기록입니다. 석차는 당시 저장된 학원 석차입니다.</p><PagedRows rows={data.legacyResults??[]} label="입력 성적" printing={printing}>{rows=><Grid label="입력 성적 기록" heads={['시험일','총점','학원 석차',...data.subjects.map(s=>s.name),'메모']} compact>{rows.map(r=><tr key={r.id}><td>{r.date??'날짜 미등록'}</td><td>{n(r.total,'점')}</td><td>{n(r.rank,'위')}</td>{data.subjects.map(s=><td key={s.id}>{n(r.scores[s.id],'점')}</td>)}<td>{r.notes||'—'}</td></tr>)}</Grid>}</PagedRows></>}
  </>)}
  {section('peers','석차 비교',report?<>
   <Grid compact label="다음 목표와의 차이" heads={['내 총점','등록 목표까지','상위 30% 평균까지']}><tr><td>{n(report.myScore.total,'점')}</td><td>{n(!report.myScore.isPartial&&report.target?Math.max(0,report.target.targetScore-report.myScore.total):null,'점')}</td><td>{n(!report.myScore.isPartial&&report.stats.external.top30Avg!==null?Math.max(0,report.stats.external.top30Avg-report.myScore.total):null,'점')}</td></tr></Grid>
   <p className="admin-help">동일 시험에 연결된 응시자 중 내 점수 주변의 성적입니다. 순위는 시험 전체 응시자 성적 분포로 확인합니다. 전체 순위를 확인할 수 없으면 자료 없음으로 표시합니다. 수험번호 일부만 표시하며 이름·연락처는 제공하지 않습니다.</p>
   <Grid label="익명 응시자 성적 비교" heads={['전체 순위','수험번호', '총점',...(student||mobile&&!printing?[]:data.subjects.map(s=>s.name)),'나와 점수 차이']}>
    {[{studentNumber:'본인',rank:report.ranks.external.rank,total:report.myScore.total,subjectScores:report.myScore.subjectScores,mine:true,peerIndex:null as number|null},...report.competitors.map((c,index)=>({...c,rank:data.peerOverallRanks?.[index]??null,peerIndex:index,studentNumber:c.studentNumber.slice(0,2)+'****',mine:false}))].sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)).map((c,i)=><tr key={i} className={c.mine?styles.currentStudent:undefined}><td>{n(c.rank,'위')}</td><th scope="row">{c.mine?c.studentNumber:<button type="button" className="admin-table-link" aria-label={`${i+1}번째 ${c.studentNumber} 성적 상세`} onClick={()=>setPeerIndex(c.peerIndex)}>{c.studentNumber}</button>}</th><td>{n(c.total,'점')}</td>{!student&&(!mobile||printing)&&data.subjects.map(s=><td key={s.id}>{n(c.subjectScores[s.id])}</td>)}<td>{c.mine?'—':gapText(c.total-report.myScore.total)}</td></tr>)}
   </Grid>{!report.competitors.length&&<p className="admin-empty-state">비교 가능한 다른 응시자 기록이 없습니다.</p>}
   <h3 className="admin-section-title">전체 점수 분포와 내 위치</h3><Grid label="전체 성적 분포" heads={['점수 구간','인원','비율']}>{visibleDistributionBins(report.distribution.bins,report.distribution.myBinIndex).map(({bin:b,index:i})=>{const mine=report.distribution.myBinIndex===i;return <tr key={b.lo} className={mine?styles.currentStudent:undefined}><th scope="row">{b.lo} 이상 {Math.min(b.hi,report.session.fullScore)}{i===report.distribution.bins.length-1?'점 이하':'점 미만'}{mine&&<><br/><strong>내 점수 구간</strong></>}</th><td>{b.count}명</td><td><div className="flex items-center gap-2"><span className={styles.distributionTrack} aria-hidden="true"><span style={{width:`${b.ratio}%`}}/></span>{n(b.ratio,'%')}</div></td></tr>;})}</Grid>
  </>:<p className="admin-empty-state">성적 비교 자료가 없습니다.</p>)}
 {mode==='student'&&<div data-report-navigation className="flex justify-end"><PreviewPrintButton single prepare={()=>{setPrinting(true);return()=>setPrinting(false);}}/></div>}</div><SlideOver open={Boolean(peer)} title="응시자 성적 상세" description="익명 성적 비교 · 현재 시험 기준" onClose={()=>setPeerIndex(null)}>{peer&&report&&<div className="space-y-4"><p className="admin-section-title">{peer.studentNumber.slice(0,2)}**** · 전체 순위 {n(data.peerOverallRanks?.[peerIndex!],'위')}</p><Grid compact label="선택 응시자 총점" heads={['응시자 총점','내 총점','응시자 − 내 점수']}><tr><td>{n(peer.total,'점')}</td><td>{n(report.myScore.total,'점')}</td><td>{n(peer.total-report.myScore.total,'점')}</td></tr></Grid><Grid label="선택 응시자 과목 비교" heads={['과목','응시자 점수','내 점수','점수 차이']}>{data.subjects.map(s=><tr key={s.id}><th scope="row">{s.name}</th><td>{n(peer.subjectScores[s.id])}</td><td>{n(report.myScore.subjectScores[s.id])}</td><td>{n(peer.subjectScores[s.id]==null||report.myScore.subjectScores[s.id]==null?null:peer.subjectScores[s.id]-report.myScore.subjectScores[s.id])}</td></tr>)}</Grid></div>}</SlideOver></div></ReportAudience>;
}
