import { Fragment } from 'react';
import type { PreviewItem } from '@/lib/exam-preview/types';
import { topWrongBySession } from '@/lib/exam-preview/metrics';
import styles from './preview.module.css';

export function WrongRateTopFive({items}:{items:PreviewItem[]}) {
 const selected=topWrongBySession(items);
 const sessions=Array.from(new Set(selected.map(item=>item.sessionId))).sort((a,b)=>selected.find(item=>item.sessionId===b)!.date.localeCompare(selected.find(item=>item.sessionId===a)!.date));
 if(!selected.length)return <p className="admin-empty-state">전체 정답률 자료가 없어 오답률 TOP 5를 표시할 수 없습니다.</p>;
 return <div className={`admin-table-frame ${styles.progressTable}`}><table aria-label="오답률 TOP 5"><thead><tr>{['순위','번호','전체 오답률','정답','내 결과'].map(head=><th scope="col" key={head}>{head}</th>)}</tr></thead><tbody>{sessions.map(session=>{
  const questions=selected.filter(item=>item.sessionId===session);
  return <Fragment key={session}>{sessions.length>1&&<tr><th scope="rowgroup" colSpan={5}>{questions[0].date}</th></tr>}{questions.map(item=><tr key={item.id} data-top5-item={item.id}><td>{1+questions.filter(other=>other.externalRate!<item.externalRate!).length}</td><td>{item.itemNo}</td><td>{Number((100-item.externalRate!).toFixed(1))}%</td><td>{item.answerKey}</td><td>{item.correct===null?'기록 없음':item.correct?'정답':item.answer?.trim()?'오답':'답안 미선택'}</td></tr>)}</Fragment>;
 })}</tbody></table></div>;
}
