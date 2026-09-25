'use client';
import { Children, type ReactNode } from 'react';
import type { Comparison } from '@/lib/exam-preview/types';

/** PreviewReport(반 분석)와 MorningPersonalReport(학생 아침)가 함께 쓰는 표 부품. 서로를 불러오는 순환을 피하려고 따로 둔다. */
export const number = (n:number|null|undefined, suffix='') => n == null ? '자료 없음' : `${Number(n.toFixed(1)).toLocaleString('ko-KR')}${suffix}`;
export function Table({heads,children,label}:{heads:(string|{label:string;className:string})[];children:ReactNode;label:string}) { if(!Children.toArray(children).length) return <p className="admin-empty-state">{label}: 선택한 기간에 표시할 기록이 없습니다.</p>; return <div className="admin-table-frame"><table aria-label={label}><thead><tr>{heads.map(h=><th key={typeof h==='string'?h:h.label} className={typeof h==='string'?undefined:h.className} scope="col">{typeof h==='string'?h:h.label}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
export function ComparisonTable({rows,personal}:{rows:Comparison[];personal:boolean}) { return <Table label="회차별 성적 비교" heads={['시험일',...(personal?['내 점수']:[]),'만점','시험 응시자 평균','우리 학원 평균','상위 30%','상위 10%','시험 / 우리 학원 인원']}>
  {rows.map(r=><tr key={`${r.sessionId}-${r.subjectId}`}><td>{r.date}</td>{personal&&<td className="admin-table-amount">{r.my===null?'미응시 / 점수 없음':number(r.my)}</td>}<td>{number(r.fullScore)}</td><td className="admin-table-amount">{number(r.external)}</td><td className="admin-table-amount">{number(r.internal)}</td><td className="admin-table-amount">{number(r.top30)}</td><td className="admin-table-amount">{number(r.top10)}</td><td>{number(r.externalCount)} / {r.internalCount}명</td></tr>)}
 </Table>; }
/** 표시 대상을 거르는 선택 칩(DESIGN.md 학생 개인 성적 전용 페이지). 탭 줄을 겹쳐 쌓지 않으려고 탭 대신 쓴다. */
export function Chips({label,items,active,onChange}:{label:string;items:{id:string;label:string}[];active:string;onChange:(id:string)=>void}) {
 return <div className="admin-choice-group" aria-label={label} data-report-navigation>{items.map(o=><button type="button" key={o.id||'all'} className="admin-choice-button admin-choice-button-auto" aria-pressed={active===o.id} onClick={()=>onChange(o.id)}>{o.label}</button>)}</div>;
}
