'use client';

import { Fragment } from 'react';
import type { PreviewItem } from '@/lib/exam-preview/types';
import styles from './preview.module.css';

const rate = (value: number | null | undefined) => value == null ? '자료 없음' : `${Number(value.toFixed(1))}%`;

export function ReferenceItemTable({ items, personal, mobile, expanded, toggle, externalOnly = false, showSubject = false, groupSubjects = false, idPrefix = 'preview' }: {
  items: PreviewItem[]; personal: boolean; mobile: boolean; externalOnly?: boolean; showSubject?: boolean; groupSubjects?: boolean; idPrefix?: string;
  expanded: Record<string, boolean>; toggle: (id: string) => void;
}) {
  const choices = Array.from(new Set(items.flatMap(item => Object.keys(item.choices)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const multiDate = new Set(items.map(item=>item.date)).size > 1;
  const desktopColumns = (personal ? 7 : 5) - (externalOnly ? 1 : 0) + Math.max(1, choices.length);
  return <div className={`${styles.items} admin-table-frame`}><table aria-label="문항별 상세 분석">
    <caption className="admin-help">표시 {items.length}문항 · 전체 정답률은 가져온 시험의 문항 통계이며 문항별 외부 분석 인원은 제공되지 않았습니다.{!externalOnly&&' 우리 학원 인원은 각 문항의 채점 응답 수입니다.'}</caption>
    <thead><tr>
      <th rowSpan={2} scope="col">번호</th>
      {personal && <th rowSpan={2} scope="col">내 답<span className="preview-mobile-only"> / 결과</span></th>}
      <th rowSpan={2} scope="col" className="preview-desktop-only">정답</th>
      {personal && <th rowSpan={2} scope="col" className="preview-desktop-only">정오</th>}
      <th rowSpan={2} scope="col" className="preview-desktop-only">배점</th>
      <th rowSpan={2} scope="col">전체 정답률</th>
      {!externalOnly&&<th rowSpan={2} scope="col" className="preview-desktop-only">우리 학원 정답률</th>}
      <th scope="colgroup" colSpan={Math.max(1, choices.length)} className="preview-desktop-only">선택지별 선택비율</th>
      <th rowSpan={2} scope="col" className="preview-mobile-only" data-screen-only>선택률</th>
    </tr><tr className="preview-desktop-only">{choices.length ? choices.map(choice => <th key={choice} scope="col">{choice}번</th>) : <th scope="col">자료 없음</th>}</tr></thead>
    <tbody>{items.map((item, index) => <Fragment key={item.id}>
      {multiDate && (index===0||items[index-1].date!==item.date)&&<tr data-session-heading><th colSpan={mobile ? personal ? 4 : 3 : desktopColumns} data-print-colspan={desktopColumns} scope="rowgroup">{item.date} 채점결과</th></tr>}
      {groupSubjects&&(index===0||items[index-1].subjectId!==item.subjectId)&&<tr data-subject-heading><th scope="rowgroup" colSpan={mobile?personal?4:3:desktopColumns} data-print-colspan={desktopColumns}>{item.subjectName}</th></tr>}
      <tr id={`${idPrefix}-item-${item.id}`} tabIndex={-1}>
        <td>{showSubject&&<><span>{item.subjectName}</span><br/></>}{item.itemNo}</td>
        {personal && <td>{item.correct === null ? '기록 없음' : item.answer ?? '미응답'}<span className={`preview-mobile-only ${item.correct === false ? 'text-admin-danger' : 'text-admin-accent'}`}><br/>{item.correct === null ? '' : item.correct ? 'O' : 'X'}<br/>정답 {item.answerKey}</span></td>}
        <td className="preview-desktop-only">{item.answerKey}</td>
        {personal && <td className={`preview-desktop-only ${item.correct === false ? 'text-admin-danger' : 'text-admin-accent'}`} aria-label={item.correct === null ? '채점 기록 없음' : item.correct ? '정답' : '오답'}>{item.correct === null ? '기록 없음' : item.correct ? 'O' : 'X'}</td>}
        <td className="preview-desktop-only">{item.points}</td>
        <td>{rate(item.externalRate)}</td>
        {!externalOnly&&<td className="preview-desktop-only">{rate(item.internalRate)}<br/><span className="admin-help">응답 {item.responseCount}명</span></td>}
        {choices.length ? choices.map(choice => <td key={choice} className={`preview-desktop-only ${choice === item.answerKey ? 'text-admin-accent font-semibold' : ''}`}>{rate(item.choices[choice])}</td>) : <td className="preview-desktop-only">자료 없음</td>}
        <td className="preview-mobile-only" data-screen-only><button className="admin-table-link" aria-label={`${item.date} ${item.itemNo}번 선택률 보기`} aria-expanded={Boolean(expanded[item.id])} aria-controls={`${idPrefix}-choices-${item.id}`} onClick={() => toggle(item.id)}>보기</button></td>
      </tr>
      <tr id={`${idPrefix}-choices-${item.id}`} hidden={!mobile || !expanded[item.id]} data-screen-only><td colSpan={mobile ? personal ? 4 : 3 : desktopColumns}>
        <p>정답 {item.answerKey} / 배점 {item.points}점{!externalOnly&&<> / 학원 응답 {item.responseCount}명</>}</p>
        <div className="flex flex-wrap justify-center gap-4">{Object.entries(item.choices).map(([choice, value]) => <span key={choice} className={choice === item.answerKey ? 'text-admin-accent' : ''}>{choice}번 {rate(value)}{choice === item.answerKey ? ' (정답)' : ''}</span>)}</div>
        {!externalOnly&&<p>우리 학원 정답률 {rate(item.internalRate)} / 최다 오답 {item.mostCommonWrong ?? '자료 없음'}</p>}
      </td></tr>
    </Fragment>)}</tbody>
  </table></div>;
}
