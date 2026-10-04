'use client';
import { gapText, type StudyRow } from '@/lib/exam-preview/morning-personal';
import type { PreviewItem } from '@/lib/exam-preview/types';
import { number, Table } from './ReportTable';
import styles from './preview.module.css';

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const gapClass = (gap: number | null) => gap === null || Math.round(gap * 10) === 0 ? '' : gap > 0 ? ' text-admin-success' : ' text-admin-danger';

/**
 * '공부할 것' 표. 아침(여러 회차)과 정기(한 회차의 과목들)가 같은 모양을 쓴다.
 * 빨간 번호 = 응시자 대부분이 맞힌 문제 중 내가 틀린 것. 번호를 누르면 문항 탭에서 그 문제를 연다.
 */
export function StudyTable({ rows, easyThreshold, showDate, onItem, onAll }: {
  rows: StudyRow[]; easyThreshold: number; showDate: boolean;
  onItem: (item: PreviewItem) => void; onAll: (row: StudyRow) => void;
}) {
  const links = (list: PreviewItem[], strong: boolean) => list.map(item => <button key={item.id} type="button" className={`admin-table-link${strong ? ' text-admin-danger font-semibold' : ''}`} aria-label={`${shortDate(item.date)} ${item.subjectName} ${item.itemNo}번 문제 보기`} onClick={() => onItem(item)}>{item.itemNo}번</button>);
  return <>
    <p className="admin-help">전체 평균보다 많이 낮았던 {showDate ? '시험' : '과목'}부터 보여 줍니다. <span className="text-admin-danger font-semibold">빨간 번호</span>는 응시자 {number(easyThreshold, '%')} 이상이 맞힌 문제입니다. 번호를 누르면 그 문제로 이동합니다.</p>
    <Table label="공부할 것" heads={[{ label: '순서', className: styles.desktopCell }, '과목', ...(showDate ? [{ label: '시험일', className: styles.desktopCell }, '시험 범위'] : []), '내 점수', { label: '전체 평균', className: styles.desktopCell }, '차이', '다시 볼 문항']}>
      {rows.map((r, i) => <tr key={`${r.sessionId}-${r.subjectId}`}>
        <td className={styles.desktopCell}>{i + 1}</td>
        <td>{r.subjectName}{showDate && <span className={`admin-help ${styles.mobileCell}`}>{shortDate(r.date)}</span>}</td>
        {showDate && <><td className={styles.desktopCell}>{shortDate(r.date)}</td><td className={styles.wrapCell}>{r.topic || '범위 미등록'}</td></>}
        <td className="admin-table-amount">{number(r.my)}</td>
        <td className={`admin-table-amount ${styles.desktopCell}`}>{r.external === null ? '—' : number(r.external)}</td>
        <td className={`admin-table-amount${gapClass(r.gap)}`}>{r.gap === null ? '—' : gapText(r.gap)}</td>
        <td className={styles.wrapCell}>
          <span data-report-navigation className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {links(r.easy, true)}
            {r.other.length > 0 && r.easy.length > 0 && <span className="admin-help">그 외</span>}
            {links(r.other, false)}
            {r.easy.length + r.other.length > 1 && <button type="button" className="admin-text-action" onClick={() => onAll(r)}>모두 보기</button>}
          </span>
          <span className="preview-print-only">{[...r.easy, ...r.other].map(item => `${item.itemNo}번`).join(', ')}</span>
        </td>
      </tr>)}
    </Table>
  </>;
}
