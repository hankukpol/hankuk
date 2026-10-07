import type { ReactNode } from "react";

/**
 * 인쇄물(상담 자료·면담 일지·성적표) 공통 조각. 모든 정보를 표로 적는다(운영자 요청 2026-10-07).
 * 둥근 상자·색 바탕 상자·카드 없이 1px 선과 회색 머리 칸만 쓴다. 규격은 globals.css 의 .student-report 규칙.
 */

type InfoCell = [label: string, value: ReactNode];

/** 문서 제목(오른쪽에 작성일 같은 짧은 정보)과 학생 정보 표. 정보는 '이름 | 값' 짝으로 한 줄에 perRow 개씩 놓는다. */
export function PrintHeader({ title, info, perRow = 3, side }: { title: string; info: InfoCell[]; perRow?: number; side?: string }) {
  const rows: InfoCell[][] = [];
  for (let index = 0; index < info.length; index += perRow) rows.push(info.slice(index, index + perRow));
  return (
    <header className="report-header">
      <div className="report-title-row">
        <h1>{title}</h1>
        {side ? <p>{side}</p> : null}
      </div>
      <table className="report-table report-info">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map(([label, value], index) => {
                // 마지막 줄이 짧으면 마지막 값 칸이 남은 폭을 채운다.
                const span = index === row.length - 1 ? (perRow - row.length) * 2 + 1 : 1;
                return [
                  <th key={`${label}-label`} scope="row">{label}</th>,
                  <td key={`${label}-value`} colSpan={span > 1 ? span : undefined}>{value}</td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </header>
  );
}

export function PrintSection({ title, note, children, keep = false }: { title: string; note?: string; children: ReactNode; keep?: boolean }) {
  return (
    <section className={`report-section${keep ? " report-keep" : ""}`}>
      <div className="report-section-head">
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export type PrintTone = "danger" | "warning" | "success" | "info";

/** 결론 문장. 색 상자 대신 '이름 | 문장' 표 한 줄(여러 줄도 된다). */
export function PrintStatement({ rows }: { rows: Array<{ label: string; text: ReactNode; tone?: PrintTone }> }) {
  return (
    <table className="report-table report-statement">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td className={`wrap${row.tone && row.tone !== "info" ? ` report-tone-${row.tone}` : ""}`}>{row.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 기록 없음. 점선 상자 대신 표 한 칸. */
export function PrintEmpty({ children }: { children: ReactNode }) {
  return (
    <table className="report-table report-empty">
      <tbody><tr><td>{children}</td></tr></tbody>
    </table>
  );
}

/** 확인할 것 목록: 번호 | 내용 | 펜으로 적는 확인 칸. */
export function PrintChecklist({ items, check = "□" }: { items: string[]; check?: string }) {
  return (
    <table className="report-table report-checklist">
      <thead><tr><th scope="col">번호</th><th scope="col">확인할 것</th><th scope="col">확인</th></tr></thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={item}><td>{index + 1}</td><td className="wrap">{item}</td><td>{check}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/** 서명 칸: 학생 확인 | (빈칸) | 상담자 | (빈칸). */
export function PrintSigns({ staff }: { staff: string }) {
  return (
    <table className="report-table report-signs">
      <tbody><tr><th scope="row">학생 확인</th><td /><th scope="row">{staff}</th><td /></tr></tbody>
    </table>
  );
}
