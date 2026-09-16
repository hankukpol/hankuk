'use client';
import type { PreviewItem } from '@/lib/exam-preview/types';
import { reviewGroups } from '@/lib/exam-preview/metrics';
import styles from './preview.module.css';

export type ReviewSelection = { title: string; ids: string[] };

/** Show every question number at the point where a review priority is explained. */
export function ReviewQueue({items,threshold,onOpen}:{items:PreviewItem[];threshold:number;onOpen:(selection:ReviewSelection)=>void}) {
 const groups=reviewGroups(items,threshold);
 const wrong=items.filter(item=>item.correct===false);
 const categories=[
  {title:'많이 맞힌 문제 중 내 오답',items:groups.easy},
  {title:'답을 비운 문항',items:groups.unanswered},
  {title:'그 밖의 내 오답',items:groups.other},
 ];
 const open=(title:string,list:PreviewItem[])=>onOpen({title,ids:list.map(item=>item.id)});
 return <div className="space-y-4" data-learning-summary>
  <div className="admin-workspace-toolbar"><h3 className="admin-section-title">복습할 문항 한눈에 보기</h3>{wrong.length>0&&<button type="button" data-report-navigation className="admin-button" onClick={()=>open('내 오답 전체',wrong)}>내 오답 {wrong.length}문항 전체 보기</button>}</div>
  <p className="admin-help">답을 선택했지만 틀린 문항과 답을 비운 문항을 모두 포함합니다. ‘전체 보기’를 누르면 해당 분류의 모든 문항을 함께 확인할 수 있습니다.</p>
  {items.length>0?<div className={`admin-table-frame ${styles.reviewQueue}`}><table aria-label="복습 우선순위"><thead><tr><th scope="col">복습 분류</th><th scope="col">시험일</th><th scope="col">문항 번호</th><th scope="col" className={styles.desktopCell}>문항 수 / 배점</th><th scope="col" className={styles.desktopCell}>채점 결과</th></tr></thead>{categories.map(category=>{
   const points=category.items.reduce((sum,item)=>sum+item.points,0);
   const dates=Array.from(new Set(category.items.map(item=>item.date))).sort().reverse();
   const displayedDates=dates.length?dates:[''];
   const action=category.items.length>0?<button type="button" data-report-navigation className="admin-table-link" aria-label={`${category.title} ${category.items.length}문항 전체 보기`} onClick={()=>open(category.title,category.items)}>{category.items.length}문항 전체 보기</button>:null;
   return <tbody key={category.title} aria-label={category.title}>{displayedDates.map((date,index)=><tr key={date}>
    {index===0&&<th scope="rowgroup" rowSpan={displayedDates.length} className={styles.wrapCell}>{category.title}<span className={`${styles.mobileCell} preview-mobile-only`}>{category.items.length}문항 · {Number(points.toFixed(1))}점{action}</span></th>}
    <td className={styles.dateCell}>{date||'해당 없음'}</td><td className={styles.wrapCell}>{date?category.items.filter(item=>item.date===date).sort((a,b)=>a.itemNo-b.itemNo).map(item=>`${item.itemNo}번`).join(', '):'없음'}</td>
    {index===0&&<><td rowSpan={displayedDates.length} className={styles.desktopCell}>{category.items.length}문항 / {Number(points.toFixed(1))}점</td><td rowSpan={displayedDates.length} className={styles.desktopCell}>{action??'없음'}</td></>}
   </tr>)}</tbody>;
  })}</table></div>:<p className="admin-empty-state">문항별 응답 자료가 없어 복습 문항을 계산할 수 없습니다.</p>}
  <p className="admin-help">‘많이 맞힌 문제’는 시험 응시자 정답률 {threshold}% 이상입니다. 배점은 복습 대상 문항의 합계이며 예상 상승 점수가 아닙니다. 답안 기록이 없는 문항은 오답으로 분류하지 않습니다.</p>
 </div>;
}
