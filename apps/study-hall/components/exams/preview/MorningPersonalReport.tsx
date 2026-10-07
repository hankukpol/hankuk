'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { TopicLearning, ReviewWorkbench, ExamTimeEntry } from './LearningViews';
import { AdminTabs } from '@/components/ui/AdminTabs';
import { ScorePrintButton } from './ScorePrintButton';
import { FileText, MessageSquareText } from 'lucide-react';
import { reviewGroups } from '@/lib/exam-preview/metrics';
import { weekLabel } from '@/lib/exam-preview/report-summary';
import { gapText, isoWeekMonday, morningPersonalSummary, morningStudyRows, type MorningSubjectRow, type StudyRow } from '@/lib/exam-preview/morning-personal';
import type { PreviewData, PreviewItem } from '@/lib/exam-preview/types';
import { PreviewTrend } from './PreviewCharts';
import { ReferenceItemBrowser, type ItemFocusRequest } from './ReportPaging';
import type { ReviewSelection } from './ReviewQueue';
import { WrongRateTopFive } from './WrongRateTopFive';
import { StudyTable } from './StudyTable';
import { useLearning } from './LearningProvider';
import { PortalMetricCard } from '@/components/student-view/StudentPortalUi';
import { Chips, number, Table } from './ReportTable';
import styles from './preview.module.css';
import { ReportAudience } from './ReportAudience';
import { useStudyTasks } from './StudyTasksContext';
import { StudentStudyTasks } from '@/components/student-view/StudentStudyTasks';

type MorningTab = 'summary' | 'study' | 'history' | 'items';
const TABS: Array<{ id: MorningTab; label: string }> = [
 { id: 'summary', label: '요약' }, { id: 'study', label: '공부할 것' }, { id: 'history', label: '점수 변화' }, { id: 'items', label: '문항' },
];
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const gapClass = (gap: number | null) => gap === null || Math.round(gap * 10) === 0 ? '' : gap > 0 ? ' text-admin-success' : ' text-admin-danger';
const statusClass: Record<MorningSubjectRow['status'], string> = {
 none: 'text-admin-text-muted', fail: 'text-admin-danger', first: 'text-admin-danger', review: 'text-admin-danger', average: '', good: 'text-admin-success',
};

/**
 * 학생·관리자 개인 아침 모의고사 분석. 탭 하나가 질문 하나에 답한다(운영자 결정 2026-10-03).
 * 요약 = 지금 내 성적은? · 공부할 것 = 뭘 다시 봐야 하지? · 점수 변화 = 오르고 있나? · 문항 = 이 문제는 왜 틀렸지?
 * 중요한 정보는 접어 두지 않는다. 반 분석(scope=cohort)은 StandardReport 가 맡는다.
 */
export function MorningPersonalReport({data,mode,division}:{data:PreviewData;mode:'admin'|'student';division?:string}) {
 const [tab,setTab]=useState<MorningTab>('summary');
 // 학생 화면은 관리자용 세부 열을 빼고 쉬운 말을 쓴다(운영자 요청 2026-10-07). 숫자·판정은 같다.
 const student=mode==='student';
 const studyTasks=useStudyTasks();
 const summary=useMemo(()=>morningPersonalSummary(data),[data]);
 const study=useMemo(()=>morningStudyRows(data),[data]);
 const taken=data.comparisons.filter(r=>r.my!==null);
 const latestSubject=[...taken].sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.subjectId;
 const firstSubject=summary.subjects.find(s=>s.status==='first'||s.status==='fail')?.subjectId;
 const [subject,setSubject]=useState('');
 // 처음 고르는 과목은 가장 먼저 복습할 과목, 없으면 가장 최근에 친 과목이다.
 const selected=data.subjects.some(s=>s.id===subject)?subject:(firstSubject??latestSubject??data.subjects[0]?.id??'');
 const [itemFilter,setItemFilter]=useState('wrong');
 const [itemDate,setItemDate]=useState('');
 const [focusRequest,setFocusRequest]=useState<ItemFocusRequest|null>(null);
 // 인쇄는 인쇄 전용 서식(ScorePrintSheet)이 맡는다. 화면 성적표를 펼쳐 복사하던 인쇄 상태는 쓰지 않는다(정리 예정).
 const printing=false;
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const [mobile,setMobile]=useState(false);
 const [reviewSelection,setReviewSelection]=useState<ReviewSelection|null>(null);
 useEffect(()=>{const media=window.matchMedia('(max-width: 767px)');const update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const learning=useLearning();
 const hasTopics=Boolean(learning?.data&&data.items.some(i=>learning.data!.document.assignments[i.id]));
 const report=data.morning;
 const subjectRows=data.comparisons.filter(r=>r.subjectId===selected);
 const items=data.items.filter(i=>i.subjectId===selected);
 const itemDates=Array.from(new Set(items.map(i=>i.date))).sort().reverse();
 const activeDate=itemDates.includes(itemDate)?itemDate:itemDates[0];
 const pool=printing||reviewSelection?items:items.filter(i=>i.date===activeDate);
 // 성적표 인쇄의 문항 표는 모든 학생이 같은 기준이어야 한다: 조회 기간 전 과목의 '내가 틀린 문항'만, 날짜·과목 순서로(운영자 결정 2026-10-05).
 const subjectOrder=new Map(data.subjects.map((s,i)=>[s.id,i]));
 const printWrong=data.items.filter(i=>i.correct===false).sort((a,b)=>a.date.localeCompare(b.date)||(subjectOrder.get(a.subjectId)??0)-(subjectOrder.get(b.subjectId)??0)||a.itemNo-b.itemNo);
 const groups=reviewGroups(pool,data.easyThreshold);
 const chips=data.subjects.map(s=>({id:s.id,label:s.name}));
 const ranks=report?.weeklyRanks??[];
 const thisWeek=ranks.at(-1), lastWeek=ranks.at(-2);
 const wrongTotal=data.items.filter(i=>i.correct===false).length;
 const easyTotal=study.reduce((sum,r)=>sum+r.easy.length,0);

 const section=(id:MorningTab,title:string,body:ReactNode)=><section id={`morning-${id}`} role="tabpanel" aria-labelledby={`morning-analysis-${id}`} data-report-panel tabIndex={-1} hidden={!printing&&tab!==id} className="admin-flat-page" aria-label={title}><h2 className={printing?'admin-section-title':'admin-section-title sr-only'}>{title}</h2>{body}</section>;
 const focusPanel=(id:string)=>requestAnimationFrame(()=>{const target=document.getElementById(id);target?.scrollIntoView({block:'start'});target?.focus();});
 const openHistory=(id:string)=>{setSubject(id);setTab('history');focusPanel('morning-history');};
 const jump=(item:PreviewItem)=>{setSubject(item.subjectId);setItemDate(item.date);setReviewSelection(null);setItemFilter('all');setTab('items');setFocusRequest({id:item.id,date:item.date,page:Math.floor(data.items.filter(i=>i.subjectId===item.subjectId&&i.date===item.date).findIndex(i=>i.id===item.id)/20),serial:Date.now()});focusPanel('morning-items');};
 const openWrong=(row:StudyRow)=>{setSubject(row.subjectId);setReviewSelection({title:`${shortDate(row.date)} ${row.subjectName} 틀린 문항`,ids:[...row.easy,...row.other].map(i=>i.id)});setItemFilter('wrong');setTab('items');setFocusRequest({date:'all',page:0,serial:Date.now()});focusPanel('morning-items');};
 const visibleItem=(i:PreviewItem)=>reviewSelection?reviewSelection.ids.includes(i.id):itemFilter==='all'||(itemFilter==='wrong'&&i.correct===false)||(itemFilter==='easy'&&groups.easy.includes(i));
 // 성적표 인쇄는 화면 복사가 아니라 인쇄 전용 표 서식이다(ScorePrintSheet, 운영자 요청 2026-10-07).
 const print=<ScorePrintButton data={data} mode={mode}/>;
 const rankText=thisWeek?`${thisWeek.rank}위 / ${thisWeek.count}명`:'자료 없음';
 const rankCaption=!thisWeek||!lastWeek?undefined:thisWeek.rank<lastWeek.rank?`지난주보다 ${lastWeek.rank-thisWeek.rank}계단 올라감`:thisWeek.rank>lastWeek.rank?`지난주보다 ${thisWeek.rank-lastWeek.rank}계단 내려감`:'지난주와 같음';

 return <ReportAudience value={mode}><div className={`admin-flat-page ${styles.reportTables}`}><div data-report-root className="admin-flat-page">
  <header className="admin-workspace-toolbar"><div><h2 className="admin-section-title">{mode==='admin'?`${data.student?.name??''} · `:''}{data.examType.name}</h2><p className="admin-help">{data.range.from} ~ {data.range.to} · 시험 {data.comparisons.length}회{data.isPreview?' / 테스트 데이터':''}</p></div><div className="flex flex-wrap gap-2" data-report-print>{mode==='admin'&&division&&data.student&&<a className="admin-button" href={`/${division}/admin/interviews?studentId=${encodeURIComponent(data.student.id)}&category=study`}><MessageSquareText className="h-4 w-4" aria-hidden="true"/>학습 면담</a>}{mode==='admin'&&division&&data.student&&<a className="admin-button" href={`/${division}/admin/students/${encodeURIComponent(data.student.id)}/report?from=${data.range.from}&to=${data.range.to}`}><FileText className="h-4 w-4" aria-hidden="true"/>상담 자료 인쇄 (면담용)</a>}{print}</div></header>
  <div data-report-navigation><AdminTabs variant="secondary" className={`${styles.mainTabs}${mode==="admin"?" admin-subtabs-underline":""}`} idPrefix="morning-analysis" panelId={`morning-${tab}`} label="아침 성적 분석" items={TABS} activeId={tab} onChange={id=>setTab(id as MorningTab)}/></div>

  {section('summary','요약',<>
   <p className={`admin-notice${summary.headline.tone==='danger'?' admin-notice-danger':summary.headline.tone==='warning'?' admin-notice-warning':summary.headline.tone==='success'?' admin-notice-success':''}`} data-headline>{summary.headline.text}</p>
   <div className="admin-portal-summary" data-score-strip>
    <PortalMetricCard label="내 평균" value={number(summary.overall.my,'점')} caption={summary.overall.benchmark===null?undefined:`전체 평균 ${number(summary.overall.benchmark,'점')} · ${gapText(summary.overall.gap)}`}/>
    <PortalMetricCard label="응시" value={`${summary.overall.attended} / ${summary.overall.expected}회`} caption={summary.overall.expected-summary.overall.attended>0?`결시 ${summary.overall.expected-summary.overall.attended}회`:'모두 응시'}/>
    <PortalMetricCard label="이번 주 학원 석차" value={rankText} caption={rankCaption}/>
    <PortalMetricCard label="다시 볼 문항" value={`${wrongTotal}문항`} caption={easyTotal?`많이 맞힌 문제 중 틀림 ${easyTotal}`:undefined}/>
   </div>
   {summary.weeks.length?<Table label="과목별 성적" heads={['과목','내 평균',{label:'전체 평균',className:styles.desktopCell},'차이',...summary.weeks.map(w=>({label:weekLabel(w),className:styles.desktopCell})),'상태']}>
    {summary.subjects.map(s=><tr key={s.subjectId}>
     <th scope="row"><button type="button" data-report-navigation className="admin-table-link" aria-label={`${s.name} 점수 변화 보기`} onClick={()=>openHistory(s.subjectId)}>{s.name}</button><span className="preview-print-only">{s.name}</span></th>
     <td className="admin-table-amount">{s.my===null?'—':number(s.my)}</td>
     <td className={`admin-table-amount ${styles.desktopCell}`}>{s.benchmark===null?'—':number(s.benchmark)}</td>
     <td className={`admin-table-amount${gapClass(s.gap)}`}>{s.gap===null?'—':gapText(s.gap)}</td>
     {s.weeks.map((attempts,i)=><td key={summary.weeks[i]} className={`admin-table-amount ${styles.desktopCell}`}>{!attempts.length?'—':attempts.map(a=><div key={a.date} className={a.below?'text-admin-danger':undefined}>{attempts.length>1&&<span className="admin-help">{shortDate(a.date)} </span>}{a.my===null?'결시':number(a.my)}</div>)}</td>)}
     <td><span className={statusClass[s.status]}>{s.statusLabel}</span>{s.few&&<span className="admin-help block">{s.paired}회 기록 · 참고</span>}</td>
    </tr>)}
   </Table>:<p className="admin-empty-state">선택한 기간에 아침 모의고사 성적이 없습니다. 조회 기간을 늘려 보세요.</p>}
   <p className="admin-help">전체 평균은 같은 시험을 본 전체 응시자의 평균입니다.{summary.scaledNote?' 점수는 100점 기준으로 바꿨습니다.':''}{data.failCutoffPercent>0?` 빨간 점수는 과락(만점의 ${number(data.failCutoffPercent,'%')} 미만)입니다.`:''} 과목을 누르면 점수 변화를 봅니다.</p>
   {mode==='admin'&&data.counseling&&<div className="admin-flat-page" data-screen-only>
    <h3 className="admin-section-title">출결 ({shortDate(data.counseling.from)} ~ {shortDate(data.counseling.to)}) · 관리자만 보임</h3>
    <Table label="출결 요약" heads={['출석','지각','결석','기타 출결','휴대폰 제출','미제출','대여']}><tr>{[data.counseling.present,data.counseling.tardy,data.counseling.absent,data.counseling.other,data.counseling.submitted,data.counseling.notSubmitted,data.counseling.rented].map((v,i)=><td key={i} className="admin-table-amount">{v}건</td>)}</tr></Table>
   </div>}
  </>)}

  {section('study','공부할 것',<>
   {student&&<StudentStudyTasks tasks={studyTasks.filter(t=>t.examCategory!=='REGULAR')}/>}
   <StudyTable rows={study} easyThreshold={data.easyThreshold} showDate onItem={jump} onAll={openWrong}/>
   {hasTopics&&<><h3 className="admin-section-title">단원별 점검</h3><Chips label="단원별 점검 과목" items={chips} active={selected} onChange={setSubject}/><TopicLearning data={data} subject={selected}/></>}
  </>)}

  {section('history','점수 변화',<>
   <Chips label="점수 변화 과목" items={chips} active={selected} onChange={setSubject}/>
   {subjectRows.some(r=>r.my!==null)?<PreviewTrend rows={subjectRows} personal externalOnly externalLabel="전체 평균"/>:<p className="admin-empty-state">이 과목은 조회 기간에 응시 기록이 없습니다.</p>}
   <Table label="시험별 점수" heads={['시험일','시험 범위','내 점수','전체 평균','차이',{label:'학원 석차',className:styles.desktopCell},...(student?[]:[{label:'전체 석차',className:styles.desktopCell}])]}>
    {[...subjectRows].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{const gap=r.my===null||r.external===null?null:r.my-r.external;return <tr key={r.sessionId}>
     <td>{shortDate(r.date)}</td><td className={styles.wrapCell}>{r.topic||'범위 미등록'}</td>
     <td className="admin-table-amount">{r.my===null?'결시':number(r.my)}</td><td className="admin-table-amount">{r.external===null?'—':number(r.external)}</td>
     <td className={`admin-table-amount${gapClass(gap)}`}>{gap===null?'—':gapText(gap)}</td>
     <td className={styles.desktopCell}>{r.internalRank===null?'—':`${r.internalRank}위 / ${r.internalCount}명`}</td>
     {!student&&<td className={styles.desktopCell}>{r.externalRank===null?'—':`${r.externalRank}위 / ${number(r.externalCount,'명')}`}</td>}
    </tr>;})}
   </Table>
   {ranks.length>0&&<><h3 className="admin-section-title">주별 학원 석차</h3><Table label="주별 학원 석차" heads={['주','석차','지난주와 비교']}>{[...ranks].reverse().map((w,i,list)=>{const prev=list[i+1];return <tr key={`${w.weekYear}-${w.weekNumber}`}><td>{weekLabel(isoWeekMonday(w.weekYear,w.weekNumber))}</td><td className="admin-table-amount">{w.rank}위 / {w.count}명</td><td className={!prev||prev.rank===w.rank?'':prev.rank>w.rank?'text-admin-success':'text-admin-danger'}>{!prev?'—':prev.rank>w.rank?`${prev.rank-w.rank}계단 올라감`:prev.rank<w.rank?`${w.rank-prev.rank}계단 내려감`:'같음'}</td></tr>;})}</Table></>}
   {data.records.length>0&&<><h3 className="admin-section-title">직접 입력한 성적</h3><Table label="직접 입력한 성적" heads={['시험일','과목','점수','출처']}>{data.records.map(r=><tr key={r.id}><td>{r.date?shortDate(r.date):'날짜 없음'}</td><td>{r.subject}</td><td className="admin-table-amount">{number(r.score,'점')}</td><td className={styles.wrapCell}>{r.source}</td></tr>)}</Table></>}
  </>)}

  {section('items','문항',<>
   <Chips label="문항 과목" items={chips} active={selected} onChange={id=>{setSubject(id);setReviewSelection(null);setItemFilter('wrong');setFocusRequest(null);}}/>
   {!printing&&!reviewSelection&&itemDates.length>0&&<label className="admin-label block max-w-xs" data-report-navigation>시험일<select value={activeDate} onChange={e=>{setItemDate(e.target.value);setFocusRequest({date:'all',page:0,serial:Date.now()});}}>{itemDates.map(d=>{const topic=data.comparisons.find(r=>r.subjectId===selected&&r.date===d)?.topic;return <option key={d} value={d}>{d}{topic?` · ${topic}`:''}</option>;})}</select></label>}
   {!printing&&<Chips label="문항 분류" items={[{id:'wrong',label:`내가 틀린 문제 ${pool.filter(i=>i.correct===false).length}`},{id:'easy',label:`많이 맞힌 문제 중 틀림 ${groups.easy.length}`},{id:'all',label:`전체 ${pool.length}`},...(student?[]:[{id:'top5',label:'많이 틀린 문제 5'}])]} active={reviewSelection?'':itemFilter} onChange={id=>{setItemFilter(id);setReviewSelection(null);setFocusRequest({date:'all',page:0,serial:Date.now()});}}/>}
   {!printing&&reviewSelection&&<div className={styles.selectionContext} data-report-navigation><strong>{reviewSelection.title} · {reviewSelection.ids.length}문항</strong><button type="button" className="admin-text-action" onClick={()=>{setReviewSelection(null);setItemFilter('wrong');}}>이 과목 틀린 문제 전체</button></div>}
   {printing&&<p className="admin-help">인쇄 기준: {data.range.from} ~ {data.range.to} 전 과목에서 내가 틀린 문항 {printWrong.length}개(답을 비운 문항 포함), 날짜·과목 순. 같은 날짜·과목의 전체·학원 정답률은 모든 학생이 같습니다.</p>}
   {!printing&&itemFilter==='top5'?<WrongRateTopFive items={pool}/>:<ReferenceItemBrowser key={`items-${selected}-${activeDate}-${data.range.from}-${data.range.to}`} allItems={printing?printWrong:pool} items={printing?printWrong:pool.filter(visibleItem)} printing={printing} focusRequest={focusRequest} personal mobile={mobile} expanded={expanded} toggle={id=>setExpanded({...expanded,[id]:!expanded[id]})}/>}
   {!printing&&itemFilter!=='top5'&&itemFilter!=='all'&&pool.some(i=>visibleItem(i)&&i.correct===false)&&<div className="admin-flat-page" data-report-navigation><h3 className="admin-section-title">복습 기록</h3><ReviewWorkbench key={`workbench-${selected}-${activeDate}-${data.range.from}-${data.range.to}`} data={data} subject={selected} ids={pool.filter(visibleItem).map(i=>i.id)}/></div>}
   <ExamTimeEntry data={data}/>
  </>)}
 </div>
 </div></ReportAudience>;
}
