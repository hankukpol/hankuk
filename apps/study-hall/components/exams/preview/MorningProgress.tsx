'use client';
import type { PreviewData, PreviewItem } from '@/lib/exam-preview/types';
import { morningLearningPlan } from '@/lib/exam-learning-plan';
import { pairedComparison, progressAnswers } from '@/lib/exam-preview/metrics';
import styles from './preview.module.css';
import type { ReviewSelection } from './ReviewQueue';
const n=(v:number|null|undefined,suffix='')=>v==null?'자료 없음':`${Number(v.toFixed(1))}${suffix}`;
export function MorningProgress({data,subject,onItem,onReview,view}:{data:PreviewData;subject:string;onItem:(item:PreviewItem)=>void;onReview:(selection:ReviewSelection)=>void;view:'topics'|'sessions'}) {
 const report=data.morning;if(!report)return null;
 const plan=morningLearningPlan(report).find(s=>s.subjectId===subject);
 const rows=data.comparisons.filter(r=>r.subjectId===subject);
 const topics=Array.from(new Set(rows.map(r=>r.topic?.trim()).filter((t):t is string=>Boolean(t)))).map(topic=>{
  const sessions=rows.filter(r=>r.topic?.trim()===topic);const taken=sessions.filter(r=>r.my!==null);const uniform=new Set(taken.map(r=>r.fullScore)).size===1;
  const comparison=pairedComparison(sessions,'external');const ids=new Set(sessions.map(r=>r.sessionId));const answers=progressAnswers(data.items.filter(i=>i.subjectId===subject&&ids.has(i.sessionId)));return {topic,answers,count:taken.length,my:uniform?comparison.my:null,mean:uniform?comparison.benchmark:null,gap:uniform?comparison.gap:null,paired:comparison.count};
 }).sort((a,b)=>(a.gap??Infinity)-(b.gap??Infinity));
 return <section className="admin-flat-page" aria-label={view==='topics'?'진도별 학습 점검':'시험일별 진도와 문항 결과'} data-report-panel>
  {view==='topics'&&<>
  <h2 className="admin-section-title">{data.subjects.find(s=>s.id===subject)?.name} · 진도별 학습 점검</h2><p className="admin-help">등록된 시험 범위별로 비교합니다. 문항별 단원 분류가 아닌 시험 전체 진도입니다. 내 평균·전체 평균·차이는 두 점수가 모두 있는 같은 회차로 계산하며, 응시 횟수와 비교 회차 수를 함께 표시합니다.</p>
  {plan?.withheld&&<p className="admin-help">응시 횟수 또는 응시율이 학원 분석 기준에 부족해 취약 범위 판단은 보류합니다. 아래 점수와 복습 문항은 확인할 수 있습니다.</p>}
  {topics.length?<div className={`admin-table-frame ${styles.topicTable}`}><table aria-label="진도별 성적 비교"><thead><tr>{['시험 진도','내 정답률','내 오답률','내 평균','전체 평균','평균 차이','응시 / 비교 회차','학습 점검'].map(head=><th key={head} scope="col">{head}</th>)}</tr></thead><tbody>{topics.map(t=><tr key={t.topic}><th scope="row" className={styles.wrapCell}>{t.topic}</th><td data-label="내 정답률">{n(t.answers.correctRate,'%')}</td><td data-label="내 오답률">{n(t.answers.wrongRate,'%')}</td><td data-label="내 평균">{n(t.my)}</td><td data-label="전체 평균">{n(t.mean)}</td><td data-label="평균 차이">{n(t.gap,'점')}</td><td data-label="응시 / 비교 회차">{t.count} / {t.paired}회</td><td data-label="학습 점검">{plan?.withheld?'판단 보류':t.gap===null?'비교 자료 부족':t.gap<0?'우선 점검':'평균 이상'}</td></tr>)}</tbody></table></div>:<p className="admin-empty-state">등록된 시험 진도가 없습니다. 시험 범위를 등록하면 진도별 비교가 표시됩니다.</p>}
  </>}
  {view==='sessions'&&<>
  <h3 className="admin-section-title">시험일별 진도와 문항 결과</h3>
  <p className="admin-help">{data.range.from} ~ {data.range.to} · 내 정답률과 오답률은 채점 기록이 있는 문항 기준입니다. 내 오답률과 틀린 문항에는 답안 미선택을 포함하며, 미선택 열은 그중 답을 비운 문항입니다. 문항 번호를 누르면 상세 채점표로 이동합니다.</p>
  {rows.length?<div className={`admin-table-frame ${styles.sessionTable}`}><table aria-label="날짜별 진도와 복습"><thead><tr>{['시험일','시험 진도','내 점수 / 만점','내 정답률','내 오답률','틀린 문항','답안 미선택','채점 기록','오답 확인'].map(head=><th key={head} scope="col">{head}</th>)}</tr></thead><tbody>{[...rows].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{
   const items=data.items.filter(i=>i.sessionId===r.sessionId&&i.subjectId===subject);const result=progressAnswers(items);const wrong=items.filter(item=>item.correct===false);
   const links=(list:PreviewItem[])=>list.length?<><span data-report-navigation className="inline-flex flex-wrap justify-center gap-2">{list.map(item=><button type="button" key={item.id} className="admin-table-link" aria-label={`${r.date} ${item.itemNo}번 채점 결과`} onClick={()=>onItem(item)}>{item.itemNo}번</button>)}</span><span className="preview-print-only">{list.map(item=>`${item.itemNo}번`).join(', ')}</span></>:result.total?'없음':'자료 없음';
   return <tr key={r.sessionId}><th scope="row" data-label="시험일">{r.date}</th><td data-label="시험 진도" className={styles.wrapCell}>{r.topic||'진도 미등록'}</td><td data-label="내 점수 / 만점">{r.my===null?'미응시 / 자료 없음':`${n(r.my)} / ${n(r.fullScore)}`}</td><td data-label="내 정답률">{n(result.correctRate,'%')}<br/>{result.total?`${result.correct.length} / ${result.total}문항`:''}</td><td data-label="내 오답률">{n(result.wrongRate,'%')}<br/>{result.total?`${result.wrong.length} / ${result.total}문항`:''}</td><td data-label="틀린 문항" className={styles.wrapCell}>{links(result.wrong)}</td><td data-label="답안 미선택" className={styles.wrapCell}>{links(result.unanswered)}</td><td data-label="채점 기록">{result.total} / {items.length}문항{result.missing>0&&<><br/>일부 기록 없음</>}</td><td data-label="오답 확인">{wrong.length>0?<button type="button" data-report-navigation className="admin-table-link" aria-label={`${r.date} 오답 ${wrong.length}문항 전체 보기`} onClick={()=>onReview({title:`${r.date} 내 오답`,ids:wrong.map(item=>item.id)})}>{wrong.length}문항 전체 보기</button>:result.total?'오답 없음':'자료 없음'}</td></tr>;
  })}</tbody></table></div>:<p className="admin-empty-state">선택한 기간에 이 과목의 시험 진도와 문항 기록이 없습니다. 조회 월 또는 과목을 바꿔 확인하세요.</p>}

  </>}
  {view==='topics'&&report.cumulativeGap&&<><h3 className="admin-section-title">누적 시험과 진도 시험</h3><div className="admin-table-frame"><table aria-label="누적과 진도 비교"><thead><tr><th>비교 기간</th><th>누적 평균</th><th>진도 평균</th><th>격차</th></tr></thead><tbody><tr><td>{report.cumulativeGap.pairedWeeks}주</td><td>{n(report.cumulativeGap.cumulativeAvg)}</td><td>{n(report.cumulativeGap.progressAvg)}</td><td>{n(report.cumulativeGap.gap)}</td></tr></tbody></table></div></>}
 </section>;
}
