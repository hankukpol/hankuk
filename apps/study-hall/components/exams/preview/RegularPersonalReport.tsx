'use client';
import { TopicLearning, ReviewWorkbench, ExamTimeEntry, LearningPriorities } from './LearningViews';
import { RegularLongitudinal } from './RegularLongitudinal';
import { Children, cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { AdminTabs } from '@/components/ui/AdminTabs';
import type { Comparison, PreviewData } from '@/lib/exam-preview/types';
import { reviewGroups } from '@/lib/exam-preview/metrics';
import { ReferenceSubjectRadar } from './ReferenceSummary';
import { ReferenceItemTable } from './ReferenceItemTable';
import { PreviewTrend } from './PreviewCharts';
import { PreviewPrintButton } from './PreviewPrintButton';
import { SlideOver } from '@/components/ui/SlideOver';
import styles from './preview.module.css';
import { ReviewQueue, type ReviewSelection } from './ReviewQueue';
import { WrongRateTopFive } from './WrongRateTopFive';
import { PagedRows } from './ReportPaging';
const n=(v:number|null|undefined,suffix='')=>v==null?'자료 없음':`${Number(v.toFixed(1))}${suffix}`;
function Grid({label,heads,children,compact=false,className=''}:{label:string;heads:string[];children:ReactNode;compact?:boolean;className?:string}) {
 const rows=compact?Children.map(children,row=>isValidElement<{children:ReactNode}>(row)?cloneElement(row,{},Children.map(row.props.children,(cell,index)=>isValidElement(cell)?cloneElement(cell as ReactElement<Record<string,unknown>>,{'data-label':heads[index]}):cell)):row):children;

 return <div className={`admin-table-frame ${compact?styles.facts:''} ${className}`}><table aria-label={label}><thead><tr>{heads.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>;
}
export function RegularPersonalReport({data,mode}:{data:PreviewData;mode:'admin'|'student'}) {
 const report=data.regular;
 const [tab,setTab]=useState<'summary'|'subjects'|'history'|'peers'>('summary');
 const [subject,setSubject]=useState('');
 const [detailSubject,setDetailSubject]=useState('');
 const detailId=report?.stats.subjects.some(s=>s.subjectId===detailSubject)?detailSubject:report?.stats.subjects[0]?.subjectId;
 const [detailFilter,setDetailFilter]=useState('wrong');
 const [reviewSelection,setReviewSelection]=useState<ReviewSelection|null>(null);
 const [peerIndex,setPeerIndex]=useState<number|null>(null);
 const peer=peerIndex===null?null:report?.competitors[peerIndex];
 const [printing,setPrinting]=useState(false);
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const m=matchMedia('(max-width: 767px)');const update=()=>setMobile(m.matches);update();m.addEventListener('change',update);return()=>m.removeEventListener('change',update);},[]);
 const current=data.comparisons.filter(r=>r.date===data.range.to);
 const history=report?.history;
 const totalRows:Comparison[]=(history?.rows??[]).map(h=>({sessionId:h.date,date:h.date,subjectId:'total',subjectName:'총점',topic:null,fullScore:h.fullScore,my:h.isPartial?null:h.total,external:null,internal:null,top10:null,top30:null,externalCount:h.externalCount,internalCount:0,externalFileCount:0,externalRank:h.externalRank,internalRank:null}));
 const trendRows=subject?data.comparisons.filter(r=>r.subjectId===subject):totalRows;
 const comparable=(history?.rows??[]).filter(h=>!h.isPartial);
 const first=comparable[0],last=comparable[comparable.length-1],previous=comparable[comparable.length-2];
 const sameFull=comparable.length>1&&new Set(comparable.map(h=>h.fullScore)).size===1;
 const section=(id:string,title:string,body:ReactNode)=><section id={`regular-${id}`} role={mode==='admin'?'tabpanel':undefined} aria-labelledby={mode==='admin'?`regular-analysis-${id}`:undefined} data-report-panel tabIndex={-1} hidden={mode==='admin'&&!printing&&tab!==id} className="admin-flat-page" aria-label={title}><h2 className="admin-section-title">{title}</h2>{body}</section>;

 const focusPanel=(id:string)=>requestAnimationFrame(()=>{const target=document.getElementById(id);target?.scrollIntoView({block:'start'});target?.focus();});
 const openSubject=(id:string)=>{setTab('subjects');setDetailSubject(id);setDetailFilter('wrong');setReviewSelection(null);focusPanel('regular-subjects');};

 return <div className={`admin-flat-page ${styles.reportTables}`}><div data-report-root className="admin-flat-page">
  <header className="admin-workspace-toolbar"><div><h2 className="admin-section-title">{data.student?.name} · {data.examType.name}</h2><p className="admin-help">{data.range.to} / 전과목 종합 성적표{data.isPreview?' / 테스트 데이터':''}</p></div><PreviewPrintButton wholeExam prepare={()=>{setPrinting(true);return()=>setPrinting(false);}}/></header>
  {Boolean(data.legacyResults?.length)&&<section className="admin-flat-page" aria-label="직접 입력 성적"><h2 className="admin-section-title">직접 입력 성적</h2><p className="admin-help">문항 분석 자료가 없는 점수와 날짜 미등록 기록도 표시합니다. 석차는 당시 저장된 학원 석차입니다.</p><PagedRows rows={data.legacyResults??[]} label="입력 성적" printing={printing}>{rows=><Grid label="입력 성적 기록" heads={['시험일','총점','학원 석차',...data.subjects.map(s=>s.name),'메모']} compact>{rows.map(r=><tr key={r.id}><td>{r.date??'날짜 미등록'}</td><td>{n(r.total,'점')}</td><td>{n(r.rank,'위')}</td>{data.subjects.map(s=><td key={s.id}>{n(r.scores[s.id],'점')}</td>)}<td>{r.notes||'—'}</td></tr>)}</Grid>}</PagedRows></section>}
  <div data-report-navigation>{mode==='admin'?<AdminTabs variant="secondary" className={styles.mainTabs} idPrefix="regular-analysis" panelId={`regular-${tab}`} label="정기 성적 분석" items={[{id:'summary',label:'종합 분석'},{id:'subjects',label:'과목별 분석'},{id:'history',label:'최근 6개월 추이'},{id:'peers',label:'석차비교'}]} activeId={tab} onChange={setTab}/>:<nav className="admin-choice-group" aria-label="정기 분석 바로가기">{[['summary','종합 분석'],['subjects','과목별 분석'],['history','최근 6개월 추이'],['peers','석차비교']].map(([id,label])=><a className="admin-choice-button admin-choice-button-auto" key={id} href={`#regular-${id}`}>{label}</a>)}</nav>}</div>
  {section('summary','전과목 종합 분석',report?<>
   <div data-learning-summary className="space-y-4"><div className={styles.scoreStrip} data-score-strip>{[['내 총점',`${n(report.myScore.total)} / ${n(report.session.fullScore)}점`],['전체 평균',n(report.stats.external.average,'점')],['상위 30% 평균',n(report.stats.external.top30Avg,'점')],['상위 10% 평균',n(report.stats.external.top10Avg,'점')]].map(([label,value])=><div key={label}><span className="admin-label">{label}</span><strong>{value}</strong></div>)}</div>
   {report.myScore.isPartial&&<p className="admin-notice">일부 과목 성적입니다. 전과목 성적과 직접 비교하지 마세요.</p>}
   <Grid compact label="종합 위치" heads={['전체 석차','전체 응시 인원','상위 비율','전체 평균과의 차이']}><tr><td>{n(report.ranks.external.rank,'위')}</td><td>{n(report.ranks.external.count,'명')}</td><td>{n(report.ranks.external.topPercent,'%')}</td><td>{n(report.myScore.isPartial||report.stats.external.average===null?null:report.myScore.total-report.stats.external.average,'점')}</td></tr></Grid></div>
   <p className="admin-help">전체는 가져온 시험 성적의 응시 집단입니다. 상위 비율은 작을수록 높은 위치이며 합격 확률이 아닙니다. 과목별 상위 10%·30% 평균은 해당 과목 순위가 아닌 총점 상위 집단의 과목 평균입니다.</p>
   <LearningPriorities data={data} onSubject={openSubject}/><ExamTimeEntry data={data}/>
   <h3 className="admin-section-title">과목별 결과와 보완할 문항</h3>
   <div className="admin-table-frame"><table aria-label="전과목 성적 비교"><thead><tr><th scope="col">과목</th><th scope="col">점수 / 만점</th><th scope="col">전체 평균</th><th scope="col" className={styles.desktopCell}>평균과 차이</th><th scope="col" className={styles.desktopCell}>전체 석차</th><th scope="col" className={styles.desktopCell}>내 오답</th></tr></thead><tbody>{report.stats.subjects.map(s=>{const wrong=data.items.filter(item=>item.subjectId===s.subjectId&&item.correct===false).length;return <tr key={s.subjectId}><th scope="row">{s.name}<span className={`${styles.mobileCell} preview-mobile-only`}><button type="button" data-report-navigation className="admin-table-link" aria-label={`${s.name} 오답 ${wrong}문항 보기`} onClick={()=>openSubject(s.subjectId)}>오답 {wrong}문항 보기</button></span></th><td>{n(s.my)} / {n(s.fullScore)}<span className={`${styles.mobileCell} preview-mobile-only`}>{n(s.externalRank,'위')}</span></td><td>{n(s.externalAvg)}<span className={`${styles.mobileCell} preview-mobile-only`}>차이 {n(s.externalAvg===null?null:s.my-s.externalAvg,'점')}</span></td><td className={styles.desktopCell}>{n(s.externalAvg===null?null:s.my-s.externalAvg)}</td><td className={styles.desktopCell}>{n(s.externalRank,'위')}</td><td className={styles.desktopCell}><button type="button" data-report-navigation className="admin-table-link" aria-label={`${s.name} 오답 ${wrong}문항 보기`} onClick={()=>openSubject(s.subjectId)}>{wrong}문항 보기</button></td></tr>;})}</tbody></table></div>
   <details className="admin-disclosure"><summary>과목별 득점률 그래프</summary><div className="admin-disclosure-body"><ReferenceSubjectRadar rows={current} personal/></div></details>
   <div data-learning-summary className="space-y-4"><h3 className="admin-section-title">목표와 학습 점검</h3><Grid compact label="목표 대비 성적" heads={['등록 목표','현재 총점','목표까지 남은 점수']}><tr><td>{n(report.target?.targetScore,'점')}</td><td>{n(report.myScore.total,'점')}</td><td>{report.target?n(Math.max(0,report.target.targetScore-report.myScore.total),'점'):'목표 미등록'}</td></tr></Grid>
   <Grid label="학습 점검" heads={['구분','확인할 내용']}>{report.stats.advice.map((advice,i)=><tr key={i}><th scope="row">과목 분석</th><td className={styles.wrapCell}>{advice}</td></tr>)}{report.flags.map((flag,i)=><tr key={`flag-${i}`}><th scope="row">추이 점검</th><td className={styles.wrapCell}>{flag.detail}</td></tr>)}{!report.stats.advice.length&&!report.flags.length&&<tr><td>추가 진단</td><td>현재 확인된 보완 항목이 없습니다.</td></tr>}</Grid></div>

  </>:<p className="admin-empty-state">선택한 회차의 전과목 성적 자료가 없습니다.</p>)}
  {section('subjects','과목별 분석',<>
   <div data-report-navigation><AdminTabs variant="secondary" className={styles.scopeTabs} label="상세 분석 과목" idPrefix="regular-subject" panelId={`regular-subject-panel-${detailId}`} items={(report?.stats.subjects??[]).map(s=>({id:s.subjectId,label:s.name}))} activeId={detailId??''} onChange={id=>{setDetailSubject(id);setDetailFilter('wrong');setReviewSelection(null);}}/></div>
   {(report?.stats.subjects??[]).filter(s=>printing||s.subjectId===detailId).map(s=>{const qs=data.items.filter(i=>i.subjectId===s.subjectId);const g=reviewGroups(qs,data.easyThreshold);const itemList=printing?qs:reviewSelection?qs.filter(i=>reviewSelection.ids.includes(i.id)):qs.filter(i=>detailFilter==='all'||detailFilter==='wrong'&&i.correct===false||detailFilter==='easy'&&g.easy.some(q=>q.id===i.id));return <div key={s.subjectId} id={`regular-subject-panel-${s.subjectId}`} role="tabpanel" aria-labelledby={`regular-subject-${s.subjectId}`} className="space-y-4">
    <div data-learning-summary className="space-y-4"><h3 className="admin-section-title">{s.name} 성적과 위치</h3>
    <Grid compact label={`${s.name} 분석`} heads={['점수 / 만점','전체 평균','평균과 차이','상위 30% 평균','상위 10% 평균']}><tr><td>{n(s.my)} / {n(s.fullScore)}</td><td>{n(s.externalAvg)}</td><td>{n(s.externalAvg===null?null:s.my-s.externalAvg,'점')}</td><td>{n(s.top30Avg)}</td><td>{n(s.top10Avg)}</td></tr></Grid>
    <Grid compact label={`${s.name} 상대 위치`} heads={['전체 석차','응시 인원','상위 비율','득점률']}><tr><td>{n(s.externalRank,'위')}</td><td>{n(s.externalCount,'명')}</td><td>{n(s.externalTopPercent,'%')}</td><td>{n(s.scoreRate,'%')}</td></tr></Grid>
    </div>
    <TopicLearning data={data} subject={s.subjectId}/>
    <ReviewQueue items={qs} threshold={data.easyThreshold} onOpen={selection=>{setReviewSelection(selection);setDetailFilter('wrong');focusPanel(`subject-review-${s.subjectId}`);}}/>
    <div id={`subject-review-${s.subjectId}`} tabIndex={-1} className="space-y-4">
    {!printing&&detailFilter!=='top5'&&detailFilter!=='all'&&<ReviewWorkbench data={data} subject={s.subjectId} ids={itemList.map(i=>i.id)}/>}
    <h3 className="admin-section-title">{s.name} 문항별 분석</h3>
    <div data-report-navigation><AdminTabs variant="secondary" className={styles.itemTabs} label="과목 문항 분류" idPrefix={`subject-items-${s.subjectId}`} panelId={`subject-items-panel-${s.subjectId}`} items={[{id:'wrong',label:`내 오답 ${qs.filter(i=>i.correct===false).length}`},{id:'easy',label:`우선 복습 ${g.easy.length}`},{id:'all',label:`전체 문항 ${qs.length}`},{id:'top5',label:'오답률 TOP 5'}]} activeId={detailFilter} onChange={id=>{setDetailFilter(id);setReviewSelection(null);}}/></div>
    <div id={`subject-items-panel-${s.subjectId}`} role="tabpanel" aria-labelledby={`subject-items-${s.subjectId}-${detailFilter}`}>
    {!printing&&reviewSelection&&<div className={styles.selectionContext} data-report-navigation><strong>{reviewSelection.title} · {reviewSelection.ids.length}문항</strong><button type="button" className="admin-text-action" onClick={()=>{setReviewSelection(null);setDetailFilter('wrong');}}>내 오답 전체 보기</button></div>}
    {!printing&&<p className="admin-help">{reviewSelection?'선택한 분류의 모든 문항입니다. 내 답과 정답, 정답률을 비교해 보세요.':detailFilter==='top5'?'선택한 과목에서 전체 응시자가 가장 많이 틀린 5문항입니다. 내가 맞힌 문제도 포함합니다. 오답률은 가져온 전체 정답률을 100%에서 뺀 값이며, 통계가 없는 문항은 제외합니다. 같은 오답률은 같은 순위로 표시하고 문항 번호순으로 최대 5개까지 보여줍니다.':detailFilter==='easy'?`전체 응시자 정답률이 ${data.easyThreshold}% 이상인데 내가 답을 선택하고 틀린 문항입니다. 답안 미선택 문항은 내 오답에서 확인하세요.`:detailFilter==='wrong'?'내가 틀린 문항 전체입니다. 답을 선택하지 않은 문항도 포함됩니다.':'선택한 과목의 모든 문항과 내 채점 결과입니다.'}</p>}
    {!printing&&detailFilter==='top5'?<WrongRateTopFive items={qs}/>:itemList.length?<ReferenceItemTable idPrefix="subject" items={itemList} personal externalOnly mobile={mobile&&!printing} expanded={expanded} toggle={id=>setExpanded({...expanded,[id]:!expanded[id]})}/>:<p className="admin-empty-state">조건에 맞는 문항이 없습니다.</p>}</div>
    </div><button type="button" data-report-navigation className="admin-text-action" onClick={()=>{setTab('history');setSubject(s.subjectId);focusPanel('regular-history');}}>{s.name} 최근 6개월 성적 변화 보기</button>
   </div>;})}
  </>)}
  {section('history','최근 6개월 성적 추이',<>
   <p className="admin-help">{history?.from??data.range.from} ~ {data.range.to} · {history?.coveredMonths??0}개월 / {history?.rows.length??0}회 기록. 기록이 없는 달과 부분 성적은 0점으로 채우지 않습니다.</p>
   <Grid compact label="6개월 변화 요약" heads={['첫 회차 대비 총점','직전 대비 총점','첫 회차 대비 상위 비율']}><tr><td>{n(sameFull?last.total-first.total:null,'점')}</td><td>{n(previous&&last.fullScore===previous.fullScore?last.total-previous.total:null,'점')}</td><td>{first&&last&&comparable.length>1&&first.externalTopPercent!==null&&last.externalTopPercent!==null?`${n(first.externalTopPercent-last.externalTopPercent)}%p 개선 (음수는 하락)`:'자료 부족'}</td></tr></Grid>
   <div data-report-navigation><AdminTabs variant="secondary" className={styles.scopeTabs} label="추이 과목" idPrefix="regular-history-subject" panelId="regular-history-subject-panel" items={[{id:'total',label:'전과목'},...data.subjects.map(s=>({id:s.id,label:s.name}))]} activeId={subject||'total'} onChange={id=>setSubject(id==='total'?'':id)}/></div><div id="regular-history-subject-panel" className="space-y-4" role="tabpanel" aria-labelledby={`regular-history-subject-${subject||'total'}`}>
<p className="admin-help">선택한 과목의 점수와 동일 회차의 전체 평균을 비교합니다. 점수 상승만으로 난이도를 보정한 실력 상승을 단정하지 않습니다.</p>
   {!subject?<RegularLongitudinal data={data}/>:trendRows.length?<PreviewTrend rows={trendRows} personal externalOnly/>:<p className="admin-empty-state">추이를 표시할 기록이 없습니다.</p>}
   </div>{subject&&!printing?<Grid className={styles.historyTable} label="선택 과목 회차별 성적" heads={['시험일',`${data.subjects.find(s=>s.id===subject)?.name??'과목'} 점수 / 만점`,'전체 평균','평균 차이','전체 석차']}>{trendRows.map(row=><tr key={row.sessionId}><td>{row.date}</td><td>{n(row.my)} / {n(row.fullScore)}</td><td>{n(row.external)}</td><td>{n(row.my===null||row.external===null?null:row.my-row.external,'점')}</td><td>{n(row.externalRank,'위')} / {n(row.externalCount,'명')}</td></tr>)}</Grid>:<Grid label="6개월 회차별 성적" heads={['시험일','총점 / 만점',...(mobile&&!printing?[]:data.subjects.map(s=>s.name)),'전체 석차',...(mobile&&!printing?[]:['상위 비율','상태'])]}>{(history?.rows??[]).map(h=><tr key={h.date}><td>{h.date}</td><td>{h.total} / {h.fullScore}{mobile&&!printing&&<span className={`${styles.mobileCell} preview-mobile-only`}>{h.isPartial?'부분 성적':'전과목'}</span>}</td>{(!mobile||printing)&&data.subjects.map(s=><td key={s.id}>{n(h.subjectScores[s.id])}</td>)}<td>{n(h.externalRank,'위')} / {h.externalCount}명</td>{(!mobile||printing)&&<><td>{n(h.externalTopPercent,'%')}</td><td>{h.isPartial?'부분 성적':'전과목'}</td></>}</tr>)}</Grid>}
  </>)}
  {section('peers','석차비교',report?<>
   <Grid compact label="다음 목표와의 차이" heads={['내 총점','등록 목표까지','상위 30% 평균까지']}><tr><td>{n(report.myScore.total,'점')}</td><td>{n(!report.myScore.isPartial&&report.target?Math.max(0,report.target.targetScore-report.myScore.total):null,'점')}</td><td>{n(!report.myScore.isPartial&&report.stats.external.top30Avg!==null?Math.max(0,report.stats.external.top30Avg-report.myScore.total):null,'점')}</td></tr></Grid>
   <p className="admin-help">동일 시험에 연결된 응시자 중 내 점수 주변의 성적입니다. 순위는 시험 전체 응시자 성적 분포로 확인합니다. 전체 순위를 확인할 수 없으면 자료 없음으로 표시합니다. 수험번호 일부만 표시하며 이름·연락처는 제공하지 않습니다.</p>
   <Grid label="익명 응시자 성적 비교" heads={['전체 순위','수험번호', '총점',...(mobile&&!printing?[]:data.subjects.map(s=>s.name)),'나와 점수 차이']}>
    {[{studentNumber:'본인',rank:report.ranks.external.rank,total:report.myScore.total,subjectScores:report.myScore.subjectScores,mine:true,peerIndex:null as number|null},...report.competitors.map((c,index)=>({...c,rank:data.peerOverallRanks?.[index]??null,peerIndex:index,studentNumber:c.studentNumber.slice(0,2)+'****',mine:false}))].sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)).map((c,i)=><tr key={i} className={c.mine?styles.currentStudent:undefined}><td>{n(c.rank,'위')}</td><th scope="row">{c.mine?c.studentNumber:<button type="button" className="admin-table-link" aria-label={`${i+1}번째 ${c.studentNumber} 성적 상세`} onClick={()=>setPeerIndex(c.peerIndex)}>{c.studentNumber}</button>}</th><td>{n(c.total,'점')}</td>{(!mobile||printing)&&data.subjects.map(s=><td key={s.id}>{n(c.subjectScores[s.id])}</td>)}<td>{n(c.total-report.myScore.total,'점')}</td></tr>)}
   </Grid>{!report.competitors.length&&<p className="admin-empty-state">비교 가능한 다른 응시자 기록이 없습니다.</p>}
   <h3 className="admin-section-title">전체 점수 분포와 내 위치</h3><Grid label="전체 성적 분포" heads={['점수 구간','인원','비율','내 위치']}>{report.distribution.bins.map((b,i)=><tr key={b.lo}><td>{b.lo} 이상 {Math.min(b.hi,report.session.fullScore)}{i===report.distribution.bins.length-1?'점 이하':'점 미만'}</td><td>{b.count}명</td><td><div className="flex items-center gap-2"><span className={styles.distributionTrack} aria-hidden="true"><span style={{width:`${b.ratio}%`}}/></span>{n(b.ratio,'%')}</div></td><td>{report.distribution.myBinIndex===i?'내 점수 구간':'-'}</td></tr>)}</Grid>
  </>:<p className="admin-empty-state">성적 비교 자료가 없습니다.</p>)}
 </div><SlideOver open={Boolean(peer)} title="응시자 성적 상세" description="익명 성적 비교 · 현재 시험 기준" onClose={()=>setPeerIndex(null)}>{peer&&report&&<div className="space-y-4"><p className="admin-section-title">{peer.studentNumber.slice(0,2)}**** · 전체 순위 {n(data.peerOverallRanks?.[peerIndex!],'위')}</p><Grid compact label="선택 응시자 총점" heads={['응시자 총점','내 총점','응시자 − 내 점수']}><tr><td>{n(peer.total,'점')}</td><td>{n(report.myScore.total,'점')}</td><td>{n(peer.total-report.myScore.total,'점')}</td></tr></Grid><Grid label="선택 응시자 과목 비교" heads={['과목','응시자 점수','내 점수','점수 차이']}>{data.subjects.map(s=><tr key={s.id}><th scope="row">{s.name}</th><td>{n(peer.subjectScores[s.id])}</td><td>{n(report.myScore.subjectScores[s.id])}</td><td>{n(peer.subjectScores[s.id]==null||report.myScore.subjectScores[s.id]==null?null:peer.subjectScores[s.id]-report.myScore.subjectScores[s.id])}</td></tr>)}</Grid></div>}</SlideOver>{mode==='admin'&&data.counseling&&<details className={`admin-disclosure ${styles.counseling}`}><summary>관리자 상담 참고 · 성적표 인쇄 제외</summary><div className="admin-disclosure-body"><p className="admin-help">{data.counseling.from} ~ {data.counseling.to} · 교시별 기록 건수입니다.</p><Grid label="상담 참고" heads={['출석','지각','결석','휴대폰 제출','미제출']}><tr>{[data.counseling.present,data.counseling.tardy,data.counseling.absent,data.counseling.submitted,data.counseling.notSubmitted].map((v,i)=><td key={i}>{v}건</td>)}</tr></Grid></div></details>}</div>;
}
