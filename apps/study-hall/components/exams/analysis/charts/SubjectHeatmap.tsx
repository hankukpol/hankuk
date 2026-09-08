"use client";

import type { MorningCohortAnalysis } from "@/lib/morning-exam-analysis-types";

type Props = Pick<MorningCohortAnalysis, "heatmap" | "subjects">;
const score = (value: number | null) => value == null || !Number.isFinite(value) ? "집계 불가" : `${Number(value.toFixed(1))}점`;

export function SubjectHeatmap({ heatmap, subjects }: Props) {
  if (!heatmap.length) return <p className="admin-empty-state">선택한 기간에 가져온 시험이 없습니다.</p>;
  const dates = Array.from(new Set(heatmap.map((row) => row.date))).sort();
  const cells = new Map(heatmap.map((row) => [`${row.subjectId}:${row.date}`, row]));
  const comparison = (row: Props["heatmap"][number]) => row.internalAvg == null || row.externalAvg == null ? "비교 불가" : row.internalAvg === row.externalAvg ? "외부와 같음" : row.internalAvg > row.externalAvg ? "외부보다 높음" : "외부보다 낮음";
  return <div className="space-y-4">
    <p className="admin-help">반 평균을 외부 평균과 비교합니다. 시험이 없는 날짜와 매칭 응답이 없는 시험은 0점으로 표시하지 않습니다.</p>
    <div className="hidden md:block"><div className="admin-table-frame"><table><caption className="admin-help">날짜·과목별 반 평균</caption><thead><tr><th scope="col">과목</th>{dates.map((date) => <th scope="col" key={date}>{date}</th>)}</tr></thead><tbody>
      {subjects.map((subject) => <tr key={subject.id}><th scope="row" className="admin-table-name">{subject.name}</th>{dates.map((date) => {
        const row = cells.get(`${subject.id}:${date}`);
        const color = !row || row.internalAvg == null || row.externalAvg == null || row.internalAvg === row.externalAvg ? "var(--admin-text)" : row.internalAvg > row.externalAvg ? "var(--admin-chart-2)" : "var(--admin-chart-3)";
        return <td key={date} style={{ color }}>{row ? <>{score(row.internalAvg)}<br />{comparison(row)}<br />n={row.count}</> : "시험 없음"}</td>;
      })}</tr>)}
    </tbody></table></div></div>
    <div className="md:hidden"><div className="admin-table-frame"><table><caption className="admin-help">날짜·과목별 비교 수치</caption><thead><tr>{["시험일", "과목", "반 평균", "외부 평균", "비교", "반 응시", "진도"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
      {[...heatmap].sort((left, right) => right.date.localeCompare(left.date) || left.subjectId.localeCompare(right.subjectId)).map((row) => <tr key={`${row.date}:${row.subjectId}`}><td>{row.date}</td><td className="admin-table-name">{subjects.find((subject) => subject.id === row.subjectId)?.name ?? "과목 정보 없음"}</td><td>{score(row.internalAvg)}</td><td>{score(row.externalAvg)}</td><td>{comparison(row)}</td><td>{row.count}명</td><td>{row.topic ?? "진도 미등록"}</td></tr>)}
    </tbody></table></div></div>
  </div>;
}
