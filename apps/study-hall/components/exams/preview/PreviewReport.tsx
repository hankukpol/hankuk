'use client';
import { Children, useEffect, useState, type ReactNode } from 'react';
import { TopicLearning, ReviewWorkbench, ExamTimeEntry } from './LearningViews';
import { MorningProgress } from './MorningProgress';
import { RegularPersonalReport } from './RegularPersonalReport';
import { AdminTabs } from '@/components/ui/AdminTabs';
import { PreviewPrintButton } from './PreviewPrintButton';
import { average, pairedComparison, reviewGroups } from '@/lib/exam-preview/metrics';
import type { Comparison, PreviewData, PreviewItem } from '@/lib/exam-preview/types';
import { PreviewTrend } from './PreviewCharts';
import { ReferenceScoreStrip, ReferenceSubjectRadar } from './ReferenceSummary';
import styles from './preview.module.css';
import { PagedRows, ReferenceItemBrowser, type ItemFocusRequest } from './ReportPaging';
import { ReviewQueue, type ReviewSelection } from './ReviewQueue';
import { WrongRateTopFive } from './WrongRateTopFive';

export const number = (n:number|null|undefined, suffix='') => n == null ? '자료 없음' : `${Number(n.toFixed(1)).toLocaleString('ko-KR')}${suffix}`;
const sections = [{id:'overview',label:'성적 요약'},{id:'diagnosis',label:'복습할 문항'},{id:'items',label:'오답·문항 분석'},{id:'trend',label:'성적 변화'},{id:'rank',label:'응시 현황·순위'},{id:'subjects',label:'과목 비교'},{id:'records',label:'성적 기록'}] as const;
type Section = typeof sections[number]['id'];
function Table({heads,children,label}:{heads:(string|{label:string;className:string})[];children:ReactNode;label:string}) { if(!Children.toArray(children).length) return <p className="admin-empty-state">{label}: 선택한 기간에 표시할 기록이 없습니다.</p>; return <div className="admin-table-frame"><table aria-label={label}><thead><tr>{heads.map(h=><th key={typeof h==='string'?h:h.label} className={typeof h==='string'?undefined:h.className} scope="col">{typeof h==='string'?h:h.label}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function ComparisonTable({rows,personal}:{rows:Comparison[];personal:boolean}) { return <Table label="회차별 성적 비교" heads={['시험일',...(personal?['내 점수']:[]),'만점','시험 응시자 평균','우리 학원 평균','상위 30%','상위 10%','시험 / 우리 학원 인원']}>
  {rows.map(r=><tr key={`${r.sessionId}-${r.subjectId}`}><td>{r.date}</td>{personal&&<td className="admin-table-amount">{r.my===null?'미응시 / 점수 없음':number(r.my)}</td>}<td>{number(r.fullScore)}</td><td className="admin-table-amount">{number(r.external)}</td><td className="admin-table-amount">{number(r.internal)}</td><td className="admin-table-amount">{number(r.top30)}</td><td className="admin-table-amount">{number(r.top10)}</td><td>{number(r.externalCount)} / {r.internalCount}명</td></tr>)}
 </Table>; }
export function PreviewReport(props:{data:PreviewData;mode:'admin'|'student';division:string;query:string}) {
 return props.data.kind==='regular'&&props.data.scope==='student'?<RegularPersonalReport data={props.data} mode={props.mode}/>:<StandardReport {...props}/>;
}
function StandardReport({data,mode,division,query}:{data:PreviewData;mode:'admin'|'student';division:string;query:string}) {
 const personal = data.scope === 'student';
 const available = data.subjects.filter(s=>data.comparisons.some(r=>r.subjectId===s.id && (!personal||r.my!==null)));
 const options = data.kind==='morning' ? data.subjects : available.length ? available : data.subjects;
 const [subject,setSubject]=useState(options[0]?.id ?? '');
 const selected = options.some(s=>s.id===subject) ? subject : options[0]?.id;
 const subjectName = options.find(s=>s.id===selected)?.name ?? '과목';
 const [section,setSection]=useState<'results'|'history'|'items'>('results');
 const [printing,setPrinting]=useState(false);
 const [focusRequest,setFocusRequest]=useState<ItemFocusRequest|null>(null);
 const [itemFilter,setItemFilter]=useState(personal?'wrong':'all');
 const [reviewSelection,setReviewSelection]=useState<ReviewSelection|null>(null);
 const [gapSort,setGapSort]=useState(false);
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(max-width: 767px)');const update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const allRows = data.comparisons.filter(r=>r.subjectId===selected);
 const rows = data.kind==='regular' ? allRows.filter(r=>r.date===data.range.to) : allRows;
 const items = data.items.filter(i=>i.subjectId===selected);
 const groups = reviewGroups(items,data.easyThreshold);
 const own = rows.filter(r=>r.my!==null);
 const mixed = new Set((personal?own:rows).map(r=>r.fullScore)).size>1;
 const external = personal ? pairedComparison(rows,'external') : null;
 const parts = sections.filter(s=>personal || ['overview','trend','subjects','items','rank'].includes(s.id)).filter(s=>!personal||!['subjects','rank'].includes(s.id)).filter(s=>s.id!=='records'||data.records.length>0);
 const active = section;
 const jump=(item:PreviewItem)=>{setSection('items');setItemFilter('all');setReviewSelection(null);setFocusRequest({id:item.id,date:item.date,page:Math.floor(items.filter(i=>i.date===item.date).findIndex(i=>i.id===item.id)/20),serial:Date.now()});};
 const panel=(id:Section,title:string,content:ReactNode,showTitle=true)=> <section id={`preview-tabs-panel-${id}`} aria-label={title} data-report-panel tabIndex={-1} className="admin-flat-page">{showTitle&&<h2 className="admin-section-title">{title}</h2>}{content}</section>;
 const openReview=(selection:ReviewSelection)=>{setReviewSelection(selection);setItemFilter('wrong');setSection('items');setFocusRequest({date:'all',page:0,serial:Date.now()});requestAnimationFrame(()=>{const panel=document.getElementById('preview-tabs-panel-items');panel?.scrollIntoView({block:'start'});panel?.focus();});};
 const orderedItems = gapSort ? [...items].sort((a,b)=>(b.externalRate!==null&&b.internalRate!==null?b.externalRate-b.internalRate:-Infinity)-(a.externalRate!==null&&a.internalRate!==null?a.externalRate-a.internalRate:-Infinity)) : items;
 const visibleItem=(i:PreviewItem)=> reviewSelection?reviewSelection.ids.includes(i.id):itemFilter==='all'||(itemFilter==='wrong'&&i.correct===false)||(itemFilter==='easy'&&groups.easy.includes(i));
 const morningSubject=data.morning?.subjects.find(s=>s.subjectId===selected);
 const flags=data.regular?.flags??morningSubject?.flags??[];
 return <div className={`admin-flat-page ${styles.reportTables}`}><div data-report-root className="admin-flat-page">
  <header className="admin-workspace-toolbar"><div><h2 className="admin-section-title">{data.student?.name??'전체'} {data.examType.name} 분석</h2><p className="admin-help">{personal?`${data.student?.studentNumber} / `:''}{data.kind==='regular'?data.range.to:`${data.range.from} ~ ${data.range.to}`} / {subjectName}{data.isPreview?' / 테스트 데이터':''}</p></div><PreviewPrintButton prepare={()=>{const prior=itemFilter,priorExpanded=expanded;setPrinting(true);setItemFilter('all');setExpanded(Object.fromEntries(items.map(i=>[i.id,true])));return()=>{setPrinting(false);setItemFilter(prior);setExpanded(priorExpanded);};}}/></header>
  <div data-report-navigation>{mode==='admin'?<AdminTabs variant="secondary" className={styles.mainTabs} idPrefix="preview-main" label="개선 성적 분석 항목" items={[{id:'results',label:'성적·진도 요약'},{id:'items',label:'오답·문항 분석'},{id:'history',label:'성적 변화'}]} activeId={active} onChange={setSection}/>:<nav className="admin-choice-group" aria-label="분석 바로가기">{parts.map(s=><a key={s.id} className="admin-choice-button admin-choice-button-auto" href={`#preview-tabs-panel-${s.id}`}>{s.id==='rank'&&data.kind==='morning'?'응시 현황·순위':s.label}</a>)}</nav>}</div>
  <div data-report-navigation>{data.kind==='morning'?<AdminTabs variant="secondary" className={styles.scopeTabs} label="분석 과목" idPrefix="morning-subject" panelId="morning-subject-panel" items={options.map(s=>({id:s.id,label:s.name}))} activeId={selected??''} onChange={id=>{setSubject(id);setItemFilter(personal?'wrong':'all');setReviewSelection(null);setFocusRequest(null);}}/>:mode==='admin'?<label className="admin-label block max-w-xs">분석 과목<select aria-label="분석 과목" value={selected??''} onChange={e=>{setSubject(e.target.value);setItemFilter('all');}}>{options.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>:<div className="admin-choice-group" aria-label="분석 과목">{options.map(s=><button className="admin-choice-button admin-choice-button-auto" aria-pressed={selected===s.id} key={s.id} onClick={()=>{setSubject(s.id);setItemFilter('all');}}>{s.name}</button>)}</div>}</div>
  <div id="morning-subject-panel" role={data.kind==='morning'?'tabpanel':undefined} aria-labelledby={data.kind==='morning'?`morning-subject-${selected}`:undefined} className="admin-flat-page">

  <div id="preview-main-panel-results" role={mode==='admin'?'tabpanel':undefined} aria-labelledby={mode==='admin'?'preview-main-results':undefined} hidden={mode==='admin'&&active!=='results'} data-report-panel className="admin-flat-page">
   {panel('overview',data.kind==='morning'?'기간 평균 비교':'점수 비교',!rows.length?<p className="admin-empty-state">선택한 기간에 가져온 분석 자료가 없습니다. 입력 성적은 회차별 누적 성적에서 확인하세요.</p>:<>
    <div data-learning-summary><ReferenceScoreStrip rows={rows} personal={personal}/><p className="admin-help mt-2">{mixed?'회차별 만점이 달라 통합 평균을 표시하지 않습니다.':personal?`시험 응시자 평균 대비 ${number(external?.gap,'점')} / ${external?.count}회 대응 비교`:`${rows.length}회 시험 / 우리 학원 평균은 해당 과목 응시자 기준`}</p></div>
    {personal&&morningSubject&&<Table label="아침시험 응시 현황" heads={['응시 / 예정','응시율','성적 추이 분석']}><tr><td>{morningSubject.attended} / {morningSubject.expected}회</td><td>{number(morningSubject.attendanceRatePercent,'%')}</td><td className={styles.wrapCell}>{morningSubject.insufficientSample?`자료 부족 · 최소 ${morningSubject.requiredSessions}회 필요`:'분석 가능'}</td></tr></Table>}
    {flags.length>0&&<Table label="성적 진단 참고" heads={['점검할 내용']}>{flags.map((flag,index)=><tr key={index}><td className={styles.wrapCell}>{flag.detail}</td></tr>)}</Table>}
    <details className="admin-disclosure"><summary>평균·순위 계산 기준과 회차별 인원</summary><div className="admin-disclosure-body space-y-4"><p className="admin-help">시험 응시자는 가져온 성적 파일의 비교 집단이며 전국 전체를 뜻하지 않습니다. 우리 학원은 연결된 학원 응시자입니다. 과목별 상위 집단 평균은 총점 상위자의 해당 과목 평균입니다. 회차마다 응시자가 달라 인원을 합치지 않습니다. 미응시는 평균에 0점으로 넣지 않고, 동점은 같은 순위로 표시합니다.</p><Table label="평균 비교 회차별 인원" heads={['시험일','시험 과목 응시자','학원 과목 응시자','내 평균에 포함']}>{rows.map(r=><tr key={r.sessionId}><td>{r.date}</td><td>{number(r.externalCount,'명')}</td><td>{r.internalCount}명</td><td>{r.my!==null&&r.external!==null?'포함':'제외'}</td></tr>)}</Table></div></details>
   </>)}
   {data.kind==='morning'&&personal&&<TopicLearning data={data} subject={selected}/>}
   {personal&&<ExamTimeEntry data={data}/>}
   {personal&&panel('diagnosis','보완할 문항',<ReviewQueue items={items} threshold={data.easyThreshold} onOpen={openReview}/>,false)}
   {!personal&&panel('subjects','전체 과목 요약',<>
    <p className="admin-help">이 영역은 조회 기간의 전체 과목을 비교합니다. 아래 상세 분석과 문항은 선택한 {subjectName} 기준입니다.</p>
    <div className={styles.subjectComparison}><ReferenceSubjectRadar rows={data.comparisons.filter(r=>data.kind==='morning'||r.date===data.range.to)} personal={personal}/><div className="min-w-0"><Table label="과목별 비교" heads={['과목',personal?'내 점수 / 평균':'우리 학원 평균','시험 응시자 평균','만점','응시 회차']}>
     {options.map(s=>{const selectedRows=data.comparisons.filter(r=>r.subjectId===s.id&&(data.kind==='morning'||r.date===data.range.to));const taken=personal?selectedRows.filter(r=>r.my!==null):selectedRows;const uniform=new Set(taken.map(r=>r.fullScore)).size<=1;return <tr key={s.id}><th scope="row">{s.name}</th><td>{number(uniform?average(taken.map(r=>personal?r.my:r.internal)):null)}</td><td>{number(uniform?(personal?pairedComparison(selectedRows,'external').benchmark:average(taken.map(r=>r.external))):null)}</td><td>{uniform?number(taken[0]?.fullScore):'회차별 상이'}</td><td>{taken.length}회</td></tr>;})}
    </Table><p className="admin-help mt-2">그래프는 과목별 만점 대비 득점률입니다. 문항별 단원 정보가 없어 단원별 정답률은 제공하지 않습니다.</p></div></div>

   </>)}
   {!personal&&panel('rank',data.kind==='morning'?'응시 현황과 순위':'순위와 목표',<>
    <Table label="학생별 분석 이동" heads={['학생','점수 / 평균','기존 진단','개인 분석']}>
     {data.regularCohort?.ranking.map(r=><tr key={r.studentId}><td>{r.name}<br/>{r.studentNumber}</td><td>{r.totalScore}점 / {r.internalRank}위{r.isPartial?' (부분 응시)':''}</td><td className={styles.wrapCell}>{r.flags.map(f=>f.detail).join(' ')||'해당 없음'}</td><td><a className="admin-text-action" href={`/${division}/admin/exams${data.isPreview?'/preview':''}/students/${r.studentId}?${query}`}>개인 분석</a></td></tr>)}
     {data.morningCohort?.studentSubjects.filter(r=>r.subjectId===selected).map(r=><tr key={r.studentId}><td>{r.name}<br/>{r.studentNumber}</td><td>{number(r.average,'점')} / {r.attended}회</td><td className={styles.wrapCell}>{r.flags.map(f=>f.detail).join(' ')||'해당 없음'}</td><td><a className="admin-text-action" href={`/${division}/admin/exams${data.isPreview?'/preview':''}/students/${r.studentId}?${query}`}>개인 분석</a></td></tr>)}
    </Table>

    <p className="admin-help">시험 응시자 순위는 가져온 성적 파일의 응시자 중 내 위치, 우리 학원 순위는 같은 과목을 응시한 학원생 중 내 위치입니다. 동점은 같은 순위로 표시합니다. 과목 순위와 총점 순위는 구분하며 순위를 합격 확률로 해석하지 않습니다.</p>
   </>)}


  </div>
  <div id="preview-main-panel-items" role={mode==='admin'?'tabpanel':undefined} aria-labelledby={mode==='admin'?'preview-main-items':undefined} hidden={mode==='admin'&&active!=='items'} data-report-panel className="admin-flat-page">
   {panel('items','문항별 채점과 선택률',<>
    <div data-report-navigation>{personal?<AdminTabs variant="secondary" className={styles.itemTabs} label="문항 분류" idPrefix="preview-item-filter" panelId="preview-item-filter-panel" items={[{id:'wrong',label:`내 오답 ${items.filter(i=>i.correct===false).length}`},{id:'easy',label:`우선 복습 ${groups.easy.length}`},{id:'all',label:`전체 문항 ${items.length}`},{id:'top5',label:'오답률 TOP 5'}]} activeId={itemFilter} onChange={id=>{setItemFilter(id);setReviewSelection(null);setFocusRequest({date:'all',page:0,serial:Date.now()});}}/>:<label className="admin-label flex items-center gap-2"><input type="checkbox" checked={gapSort} onChange={e=>setGapSort(e.target.checked)}/>외부 대비 부족한 문항순</label>}</div>
    <div id="preview-item-filter-panel" role={personal?'tabpanel':undefined} aria-labelledby={personal?`preview-item-filter-${itemFilter}`:undefined} className="space-y-4">
    {!printing&&reviewSelection&&<div className={styles.selectionContext} data-report-navigation><strong>{reviewSelection.title} · {reviewSelection.ids.length}문항</strong><button type="button" className="admin-text-action" onClick={()=>{setReviewSelection(null);setItemFilter('wrong');setFocusRequest({date:'all',page:0,serial:Date.now()});}}>내 오답 전체 보기</button></div>}
    {personal&&<p className="admin-help">{printing?'조회 기간의 전체 문항과 채점 결과입니다.':itemFilter==='top5'?'시험일별 전체 응시자가 가장 많이 틀린 최대 5문항입니다. 내가 맞힌 문항도 포함하며, 통계가 없는 문항은 제외합니다. 같은 오답률은 같은 순위로 표시하고 문항 번호순으로 최대 5개까지 보여줍니다.':reviewSelection?'선택한 분류의 모든 문항입니다. 각 문항의 내 답과 정답, 정답률을 비교해 보세요.':itemFilter==='wrong'?'내가 틀린 문항입니다. 답안 미선택 문항도 포함됩니다.':itemFilter==='easy'?`전체 정답률이 ${data.easyThreshold}% 이상인데 내가 답을 선택하고 틀린 문항입니다.`:'선택한 과목의 전체 문항입니다. 시험일별로 채점 결과와 선택률을 확인할 수 있습니다.'}</p>}

    {personal&&!printing&&itemFilter!=='top5'&&itemFilter!=='all'&&<ReviewWorkbench key={selected+data.range.from+data.range.to} data={data} subject={selected} ids={orderedItems.filter(visibleItem).map(i=>i.id)}/>}
    {!printing&&itemFilter==='top5'?<WrongRateTopFive items={items}/>:<>
    <p className="admin-help">조회 기간 전체 {items.length}문항 / 필터 조건에 맞는 문항 {printing?items.length:items.filter(visibleItem).length}개. 정오 표시는 가져온 답안의 채점 결과를 사용합니다.</p>
    <details className="admin-disclosure"><summary>문항 통계 기준</summary><div className="admin-disclosure-body admin-help">시험 응시자 정답률·선택비율은 가져온 파일의 통계입니다. 우리 학원 정답률은 연결된 학원 응시자의 답안 기준입니다. 두 집단은 다를 수 있으며 전국 통계를 뜻하지 않습니다.</div></details>
    <ReferenceItemBrowser key={selected+data.range.from+data.range.to} allItems={items} items={orderedItems.filter(visibleItem)} printing={printing} focusRequest={focusRequest} personal={personal} mobile={mobile} expanded={expanded} toggle={id=>setExpanded({...expanded,[id]:!expanded[id]})}/>
    </>}
    </div>
   </>)}
  </div>
  <div id="preview-main-panel-history" role={mode==='admin'?'tabpanel':undefined} aria-labelledby={mode==='admin'?'preview-main-history':undefined} hidden={mode==='admin'&&active!=='history'} data-report-panel className="admin-flat-page">
   {data.kind==='morning'&&personal&&<MorningProgress data={data} subject={selected} onItem={jump} onReview={openReview} view="sessions"/>}
   {panel('trend',`${subjectName} 회차별 추이`,allRows.length?<><PreviewTrend rows={allRows} personal={personal}/><PagedRows key={selected+data.range.from+data.range.to} rows={allRows} label="회차별 성적" printing={printing}>{list=><ComparisonTable rows={list} personal={personal}/>}</PagedRows></>:<p className="admin-empty-state">추이를 표시할 시험 자료가 없습니다.</p>)}
   {personal&&<PagedRows key={'ranks'+selected+data.range.from+data.range.to} rows={allRows} label="회차별 순위" printing={printing}>{list=><Table label="회차별 순위 전체" heads={['시험일','시험 응시자 중 내 순위','우리 학원에서 내 순위']}>{list.map(r=><tr key={r.sessionId}><td>{r.date}</td><td>{r.externalRank===null?'자료 없음':`${r.externalCount}명 중 ${r.externalRank}위`}</td><td>{r.internalRank===null?'미응시 / 점수 없음':`${r.internalCount}명 중 ${r.internalRank}위`}</td></tr>)}</Table>}</PagedRows>}
   {personal&&data.records.length>0&&panel('records','입력 성적 기록',<PagedRows key={data.range.from+data.range.to} rows={data.records} label="입력 성적" printing={printing}>{list=><Table label="입력 성적 기록" heads={['시험일','과목','점수','출처']}>{list.map(r=><tr key={r.id}><td>{r.date??'날짜 미등록'}</td><td>{r.subject}</td><td>{number(r.score,'점')}</td><td className={styles.wrapCell}>{r.source}</td></tr>)}</Table>}</PagedRows>)}
  </div>

 </div></div>
 {mode==='admin'&&data.counseling&&<details className={`admin-disclosure ${styles.counseling}`}><summary><span><span className={styles.disclosureTitle}>관리자 상담 참고</span><span className={styles.disclosureDescription}>출결·휴대폰 기록 확인 · 성적표 인쇄 제외</span></span><span className={styles.disclosureAction} aria-hidden="true"><span>펼치기</span><span>접기</span></span></summary><div className="admin-disclosure-body space-y-4"><p className="admin-help">{data.counseling.from} ~ {data.counseling.to}. 교시별 기록 건수이며 일수나 학습 시간·성적의 원인을 뜻하지 않습니다.</p><Table label="관리자 상담 기록 요약" heads={['출석','지각','결석','기타 출결','휴대폰 제출','미제출','대여']}><tr>{[data.counseling.present,data.counseling.tardy,data.counseling.absent,data.counseling.other,data.counseling.submitted,data.counseling.notSubmitted,data.counseling.rented].map((v,i)=><td key={i}>{v}건</td>)}</tr></Table></div></details>}
 </div>;
}
