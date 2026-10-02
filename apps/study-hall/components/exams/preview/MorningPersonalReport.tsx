'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { TopicLearning, ReviewWorkbench, ExamTimeEntry } from './LearningViews';
import { LearningOverview } from './LearningOverview';
import { MorningProgress } from './MorningProgress';
import { AdminTabs } from '@/components/ui/AdminTabs';
import { PreviewPrintButton } from './PreviewPrintButton';
import { reviewGroups } from '@/lib/exam-preview/metrics';
import { isBelowFailCutoff, morningHeadline, weekLabel, weekStart, weeklyScoreGrid } from '@/lib/exam-preview/report-summary';
import type { PreviewData, PreviewItem } from '@/lib/exam-preview/types';
import { PreviewTrend } from './PreviewCharts';
import { PagedRows, ReferenceItemBrowser, type ItemFocusRequest } from './ReportPaging';
import { ReviewQueue, type ReviewSelection } from './ReviewQueue';
import { WrongRateTopFive } from './WrongRateTopFive';
import { PortalMetricCard } from '@/components/student-view/StudentPortalUi';
import { Chips, number, Table, ComparisonTable } from './ReportTable';
import styles from './preview.module.css';

type MorningTab = 'summary' | 'weak' | 'peers' | 'history' | 'items';

/**
 * 학생·관리자 개인 아침 모의고사 분석. 정기와 같은 탭 5개(요약·취약점·석차·추이·문항)로 한 화면에 한 주제만 보인다.
 * 학원은 매주 과목을 순서대로 한 번씩 치르므로(운영자 확인 2026-09-25) 요약은 주 × 과목 표로 보여 준다.
 * 반 분석(scope=cohort)은 계속 StandardReport 가 맡는다.
 */
export function MorningPersonalReport({data,mode}:{data:PreviewData;mode:'admin'|'student'}) {
 const [tab,setTab]=useState<MorningTab>('summary');
 const taken=data.comparisons.filter(r=>r.my!==null);
 const latestSubject=[...taken].sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.subjectId;
 const [subject,setSubject]=useState('');
 // 과목 칩 기본값은 가장 최근에 치른 과목이다. 첫 과목으로 고정하면 과목을 돌아가며 치를 때 대부분 빈 화면이 된다.
 const selected=data.subjects.some(s=>s.id===subject)?subject:(latestSubject??data.subjects[0]?.id??'');
 const [itemFilter,setItemFilter]=useState('wrong');
 const [itemDate,setItemDate]=useState('');
 const [focusRequest,setFocusRequest]=useState<ItemFocusRequest|null>(null);
 const [printing,setPrinting]=useState(false);
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(max-width: 767px)');const update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const report=data.morning;
 const subjectRows=data.comparisons.filter(r=>r.subjectId===selected);
 const items=data.items.filter(i=>i.subjectId===selected);
 const itemDates=Array.from(new Set(items.map(i=>i.date))).sort().reverse();
 const activeDate=itemDates.includes(itemDate)?itemDate:itemDates[0];
 const [reviewSelection,setReviewSelection]=useState<ReviewSelection|null>(null);
 // 8주치 문항을 한꺼번에 펼치지 않는다. 복습 분류(여러 날짜)에서 넘어왔거나 인쇄할 때만 과목 전체 기간이다.
 const pool=printing||reviewSelection?items:items.filter(i=>i.date===activeDate);
 const groups=reviewGroups(pool,data.easyThreshold);
 const rows=data.comparisons.map(r=>({date:r.date,subjectId:r.subjectId,subjectName:r.subjectName,my:r.my,fullScore:r.fullScore,external:r.external}));
 const latestWeek=rows.map(r=>weekStart(r.date)).sort().at(-1);
 const weekItems=data.items.filter(i=>latestWeek!==undefined&&weekStart(i.date)===latestWeek);
 const headline=morningHeadline({rows,failCutoffPercent:data.failCutoffPercent,
  declining:(report?.subjects??[]).filter(s=>s.flags.some(f=>f.kind==='consecutiveDrops'||f.kind==='ownAverageDrop')).map(s=>s.name),
  easyWrong:reviewGroups(weekItems,data.easyThreshold).easy.length,wrong:weekItems.filter(i=>i.correct===false).length});
 const grid=weeklyScoreGrid(rows,data.subjects,data.failCutoffPercent,4);
 const chips=data.subjects.map(s=>({id:s.id,label:s.name}));
 const section=(id:MorningTab,title:string,body:ReactNode)=><section id={`morning-${id}`} role="tabpanel" aria-labelledby={`morning-analysis-${id}`} data-report-panel tabIndex={-1} hidden={!printing&&tab!==id} className="admin-flat-page" aria-label={title}><h2 className={printing?'admin-section-title':'admin-section-title sr-only'}>{title}</h2>{body}</section>;
 const focusPanel=(id:string)=>requestAnimationFrame(()=>{const target=document.getElementById(id);target?.scrollIntoView({block:'start'});target?.focus();});
 const openItems=(selection:ReviewSelection|null)=>{setReviewSelection(selection);setItemFilter('wrong');setTab('items');setFocusRequest({date:'all',page:0,serial:Date.now()});focusPanel('morning-items');};
 const jump=(item:PreviewItem)=>{setSubject(item.subjectId);setItemDate(item.date);setReviewSelection(null);setItemFilter('all');setTab('items');setFocusRequest({id:item.id,date:item.date,page:Math.floor(data.items.filter(i=>i.subjectId===item.subjectId&&i.date===item.date).findIndex(i=>i.id===item.id)/20),serial:Date.now()});};
 const visibleItem=(i:PreviewItem)=>reviewSelection?reviewSelection.ids.includes(i.id):itemFilter==='all'||(itemFilter==='wrong'&&i.correct===false)||(itemFilter==='easy'&&groups.easy.includes(i));
 const print=<PreviewPrintButton prepare={()=>{const prior=itemFilter,priorExpanded=expanded;setPrinting(true);setItemFilter('all');setExpanded(Object.fromEntries(items.map(i=>[i.id,true])));return()=>{setPrinting(false);setItemFilter(prior);setExpanded(priorExpanded);};}}/>;
 const cutoffNote=data.failCutoffPercent>0?`과락선은 만점의 ${number(data.failCutoffPercent,'%')}입니다. `:'';

 return <div className={`admin-flat-page ${styles.reportTables}`}><div data-report-root className="admin-flat-page">
  <header className="admin-workspace-toolbar"><div><h2 className="admin-section-title">{mode==='admin'?`${data.student?.name??''} · `:''}{data.examType.name}</h2><p className="admin-help">{data.range.from} ~ {data.range.to}{data.isPreview?' / 테스트 데이터':''}</p></div>{mode==='admin'&&print}</header>
  <div data-report-navigation><AdminTabs variant="secondary" className={styles.mainTabs} idPrefix="morning-analysis" panelId={`morning-${tab}`} label="아침 성적 분석" items={[{id:'summary',label:'요약'},{id:'weak',label:'취약점'},{id:'peers',label:'석차'},{id:'history',label:'추이'},{id:'items',label:'문항'}]} activeId={tab} onChange={id=>setTab(id as MorningTab)}/></div>

  {section('summary','성적 요약',<>
   <LearningOverview data={data} onSubject={id=>{setSubject(id);setTab('weak');focusPanel('morning-weak');}} onReview={selection=>{const item=data.items.find(i=>selection.ids.includes(i.id));if(item)setSubject(item.subjectId);openItems(selection);}}/>
   <details className="admin-disclosure" open={printing}><summary>점수·응시·주간 성적 자세히 보기</summary><div className="admin-disclosure-body">
   <p className={`admin-notice${headline.tone==='danger'?' admin-notice-danger':headline.tone==='warning'?' admin-notice-warning':''}`} data-headline>{headline.text}</p>
   {report&&<div className="admin-portal-summary" data-score-strip>
    <PortalMetricCard label="기간 평균" value={number(report.summary.average,'점')} caption={`${data.range.from.slice(5)} ~ ${data.range.to.slice(5)}`}/>
    <PortalMetricCard label="응시" value={`${report.summary.attended} / ${report.summary.expected}회`} caption={report.summary.attendanceRatePercent===null?undefined:`응시율 ${number(report.summary.attendanceRatePercent,'%')}`}/>
    <PortalMetricCard label="시험 응시자 평균 대비" value={number(report.summary.externalGap,'점')} caption="조회 기간 전체"/>
    <PortalMetricCard label="이번 주 석차" value={report.summary.thisWeekRank===null?'자료 없음':`${report.summary.thisWeekRank}위`} caption={report.summary.rankDelta===null?undefined:report.summary.rankDelta>0?`지난주보다 ${report.summary.rankDelta}계단 상승`:report.summary.rankDelta<0?`지난주보다 ${-report.summary.rankDelta}계단 하락`:'지난주와 같음'}/>
   </div>}
   {grid.weeks.length?<><Table label="주간 성적표" heads={['과목',...grid.weeks.map(weekLabel),'기간 평균']}>{grid.rows.map(r=><tr key={r.subjectId}><th scope="row"><button type="button" data-report-navigation className="admin-table-link" aria-label={`${r.name} 취약점 보기`} onClick={()=>{setSubject(r.subjectId);setTab('weak');focusPanel('morning-weak');}}>{r.name}</button><span className="preview-print-only">{r.name}</span></th>{r.cells.map((c,i)=>{const attempts=rows.filter(row=>row.subjectId===r.subjectId&&weekStart(row.date)===grid.weeks[i]).sort((a,b)=>a.date.localeCompare(b.date));return <td key={grid.weeks[i]} className={`admin-table-amount${attempts.length===1&&c?.below?' text-admin-danger':''}`}>{attempts.length>1?attempts.map(attempt=><div key={attempt.date} className={attempt.my!==null&&attempt.fullScore!==null&&isBelowFailCutoff(attempt.my,attempt.fullScore,data.failCutoffPercent)?'text-admin-danger':undefined}><span className="admin-help">{attempt.date.slice(5)} · </span>{attempt.my===null?'점수 없음':number(attempt.my)}</div>):c===null?'—':c.my===null?'결시':number(c.my)}</td>;})}<td className="admin-table-amount">{r.attended?number(r.average):'—'}</td></tr>)}</Table>
   <p className="admin-help">같은 주에 여러 번 응시한 과목은 시험일별 점수를 모두 표시합니다. —는 그 주에 시험이 없었거나 점수를 가져오지 않는 과목(누적 등)입니다. {cutoffNote}과목을 누르면 취약점으로 이동합니다.</p></>
   :<p className="admin-empty-state">선택한 기간에 가져온 아침 모의고사 성적이 없습니다. 조회 조건에서 기간을 늘려 보세요.</p>}
   </div></details>
  </>)}

  {section('weak','취약점',<>
   <Chips label="취약점 과목" items={chips} active={selected} onChange={id=>{setSubject(id);setReviewSelection(null);}}/>
   <MorningProgress data={data} subject={selected} onItem={jump} onReview={openItems} view="topics"/>
   <ReviewQueue items={items} threshold={data.easyThreshold} onOpen={openItems}/>
   <TopicLearning data={data} subject={selected}/>
  </>)}

  {section('peers','석차',<>
   <Table label="주간 석차" heads={['주차','석차','응시 인원']}>{[...(report?.weeklyRanks??[])].reverse().map(w=><tr key={`${w.weekYear}-${w.weekNumber}`}><td>{w.weekYear}년 {w.weekNumber}주</td><td>{w.rank}위</td><td>{w.count}명</td></tr>)}</Table>
   <PagedRows key={'ranks'+data.range.from+data.range.to} rows={[...taken].sort((a,b)=>b.date.localeCompare(a.date))} label="회차별 순위" printing={printing}>{list=><Table label="회차별 순위" heads={['시험일','과목','시험 응시자 중','우리 학원에서']}>{list.map(r=><tr key={`${r.sessionId}-${r.subjectId}`}><td>{r.date}</td><td>{r.subjectName}</td><td>{r.externalRank===null?'자료 없음':`${r.externalRank}위 / ${number(r.externalCount,'명')}`}</td><td>{r.internalRank===null?'자료 없음':`${r.internalRank}위 / ${r.internalCount}명`}</td></tr>)}</Table>}</PagedRows>
   <p className="admin-help">시험 응시자 순위는 가져온 성적 파일의 응시자 중 내 위치, 우리 학원 순위는 같은 과목을 응시한 학원생 중 내 위치입니다. 동점은 같은 순위입니다.</p>
  </>)}

  {section('history','추이',<>
   <Chips label="추이 과목" items={chips} active={selected} onChange={setSubject}/>
   {subjectRows.length?<PreviewTrend rows={subjectRows} personal/>:<p className="admin-empty-state">추이를 표시할 시험 자료가 없습니다.</p>}
   <MorningProgress data={data} subject={selected} onItem={jump} onReview={openItems} view="sessions"/>
   <details className="admin-disclosure" open={printing}><summary>회차별 평균 비교</summary><div className="admin-disclosure-body"><PagedRows key={selected+data.range.from+data.range.to} rows={subjectRows} label="회차별 성적" printing={printing}>{list=><ComparisonTable rows={list} personal/>}</PagedRows></div></details>
   {data.records.length>0&&<details className="admin-disclosure" open={printing}><summary>입력 성적 기록 {data.records.length}건</summary><div className="admin-disclosure-body"><PagedRows key={data.range.from+data.range.to} rows={data.records} label="입력 성적" printing={printing}>{list=><Table label="입력 성적 기록" heads={['시험일','과목','점수','출처']}>{list.map(r=><tr key={r.id}><td>{r.date??'날짜 미등록'}</td><td>{r.subject}</td><td>{number(r.score,'점')}</td><td className={styles.wrapCell}>{r.source}</td></tr>)}</Table>}</PagedRows></div></details>}
  </>)}

  {section('items','문항',<>
   <Chips label="문항 과목" items={chips} active={selected} onChange={id=>{setSubject(id);setReviewSelection(null);setItemFilter('wrong');setFocusRequest(null);}}/>
   {!printing&&!reviewSelection&&itemDates.length>0&&<label className="admin-label block max-w-xs">시험일<select value={activeDate} onChange={e=>{setItemDate(e.target.value);setFocusRequest({date:'all',page:0,serial:Date.now()});}}>{itemDates.map(d=>{const topic=data.comparisons.find(r=>r.subjectId===selected&&r.date===d)?.topic;return <option key={d} value={d}>{d}{topic?` · ${topic}`:''}</option>;})}</select></label>}
   {!printing&&<Chips label="문항 분류" items={[{id:'wrong',label:`내 오답 ${pool.filter(i=>i.correct===false).length}`},{id:'easy',label:`우선 복습 ${groups.easy.length}`},{id:'all',label:`전체 ${pool.length}`},{id:'top5',label:'오답률 TOP 5'}]} active={reviewSelection?'':itemFilter} onChange={id=>{setItemFilter(id);setReviewSelection(null);setFocusRequest({date:'all',page:0,serial:Date.now()});}}/>}
   {!printing&&reviewSelection&&<div className={styles.selectionContext} data-report-navigation><strong>{reviewSelection.title} · {reviewSelection.ids.length}문항</strong><button type="button" className="admin-text-action" onClick={()=>{setReviewSelection(null);setItemFilter('wrong');}}>내 오답 전체 보기</button></div>}
   {!printing&&<p className="admin-help">{itemFilter==='top5'?'시험일별 전체 응시자가 가장 많이 틀린 최대 5문항입니다. 내가 맞힌 문항도 포함합니다.':reviewSelection?'선택한 분류의 모든 문항입니다.':itemFilter==='wrong'?'내가 틀린 문항입니다. 답안 미선택 문항도 포함됩니다.':itemFilter==='easy'?`전체 정답률이 ${data.easyThreshold}% 이상인데 내가 답을 선택하고 틀린 문항입니다.`:'선택한 과목의 전체 문항입니다.'}</p>}
   {/* 복습 예약·재풀이는 모바일에서 문항마다 카드가 되어 길다. 틀린 문항 목록은 아래에 그대로 두고 여기는 접는다. */}
   {!printing&&itemFilter!=='top5'&&itemFilter!=='all'&&<details className="admin-disclosure" data-report-navigation><summary>복습 예약·재풀이 {pool.filter(visibleItem).filter(i=>i.correct===false).length}문항</summary><div className="admin-disclosure-body"><ReviewWorkbench key={`workbench-${selected}-${activeDate}-${data.range.from}-${data.range.to}`} data={data} subject={selected} ids={pool.filter(visibleItem).map(i=>i.id)}/></div></details>}
   {!printing&&itemFilter==='top5'?<WrongRateTopFive items={pool}/>:<ReferenceItemBrowser key={`items-${selected}-${activeDate}-${data.range.from}-${data.range.to}`} allItems={pool} items={printing?pool:pool.filter(visibleItem)} printing={printing} focusRequest={focusRequest} personal mobile={mobile} expanded={expanded} toggle={id=>setExpanded({...expanded,[id]:!expanded[id]})}/>}
   <ExamTimeEntry data={data}/>
  </>)}
  {mode==='student'&&<div data-report-navigation className="flex justify-end">{print}</div>}
 </div>
 {mode==='admin'&&data.counseling&&<details className={`admin-disclosure ${styles.counseling}`}><summary>관리자 상담 참고 · 성적표 인쇄 제외</summary><div className="admin-disclosure-body space-y-4"><p className="admin-help">{data.counseling.from} ~ {data.counseling.to}. 교시별 기록 건수이며 일수나 학습 시간·성적의 원인을 뜻하지 않습니다.</p><Table label="관리자 상담 기록 요약" heads={['출석','지각','결석','기타 출결','휴대폰 제출','미제출','대여']}><tr>{[data.counseling.present,data.counseling.tardy,data.counseling.absent,data.counseling.other,data.counseling.submitted,data.counseling.notSubmitted,data.counseling.rented].map((v,i)=><td key={i}>{v}건</td>)}</tr></Table></div></details>}
 </div>;
}
