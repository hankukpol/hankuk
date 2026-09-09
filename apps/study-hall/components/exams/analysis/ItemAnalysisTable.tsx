"use client";

import type { RegularStudentReport } from "@/lib/exam-analysis-types";

const decimal = (value: number) => Number(value.toFixed(1));

/** 날짜별 목록 안에 겹쳐 놓을 때는 heading 을 끄고 상위 summary 가 이름을 맡는다. */
type Props = { items: RegularStudentReport["items"]; subjects: RegularStudentReport["subjects"]; heading?: boolean };

export function ItemAnalysisTable({ items, subjects, heading = true }: Props) {
  const names = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const correctness = new Map(items.responseCorrectness?.map(row => [JSON.stringify([row.subjectId, row.itemNo]), row.correctness]));
  const hasResponse = (item: Props["items"]["list"][number]) => !items.responseCorrectness || correctness.get(JSON.stringify([item.subjectId, item.itemNo])) != null;
  const renderRows = (rows: Props["items"]["list"]) => rows.length === 0 ? <p className="admin-help">해당 문항이 없습니다.</p> :
    <div className="admin-table-frame"><table><thead><tr>
      {["과목", "번호", "정답", "내 답", "정오", "외부 정답률", "반 정답률", "난이도"].map((label) => <th scope="col" key={label}>{label}</th>)}
    </tr></thead><tbody>{rows.map((item) => <tr key={`${item.subjectId}-${item.itemNo}`}>
      <td className="admin-table-name">{names.get(item.subjectId) ?? "과목 정보 없음"}</td><td>{item.itemNo}</td><td>{item.answerKey}</td><td>{hasResponse(item) ? item.answer || "무응답" : "자료 없음"}</td><td>{hasResponse(item) ? item.isCorrect ? "O" : "X" : "자료 없음"}</td><td>{decimal(item.externalCorrectRatePct)}%</td><td>{item.internalCorrectRatePct == null ? "집계 불가" : `${decimal(item.internalCorrectRatePct)}%`}</td><td>{item.difficulty}</td>
    </tr>)}</tbody></table></div>;
  const summary = items.summary;
  return <section className="admin-section">
    {heading && <h2 className="admin-section-title">문항 분석</h2>}
    <div className="admin-metric-strip">{[["정답", `${summary.correct}개`], ["오답", `${summary.wrong}개`], ["무응답", `${summary.unanswered}개`], ["킬러 정복률", summary.killerTotal ? `${decimal(summary.killerConquerRate)}%` : "해당 문항 없음"]].map(([label, value]) => <div className="admin-metric-box" key={label}><p className="admin-metric-box-label">{label}</p><p className={/\d/.test(value) ? "admin-metric-box-value" : "admin-metric-box-value admin-metric-box-status"}>{value}</p></div>)}</div>
    <p className="admin-help">응시 문항 {summary.total}개, 정답률 {decimal(summary.myCorrectRate)}%. 무응답은 오답과 별도로 집계하며, 미응시 과목은 제외합니다.</p>
    <section className="admin-section"><h3 className="admin-section-title">나만 틀린 문제</h3><p className="admin-help">설정된 쉬운 문항 기준 이상인데 틀린 문제입니다.</p>{renderRows(items.easyMissed)}</section>
    <section className="admin-section"><h3 className="admin-section-title">오답률 TOP5</h3>{renderRows(items.killerTop5)}</section>
    <details className="admin-disclosure"><summary>전체 채점표 ({items.list.length}문항)</summary><div className="admin-disclosure-body">{renderRows(items.list)}</div></details>
  </section>;
}
