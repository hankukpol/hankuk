"use client";

import type { RegularStudentReport as Report } from "@/lib/exam-analysis-types";
import { ExamScoreChart } from "@/components/exams/ExamScoreChart";
import { ItemAnalysisTable } from "./ItemAnalysisTable";
import { SubjectRadar } from "./charts/SubjectRadar";
import { DistributionBars } from "./charts/DistributionBars";

const value = (number: number | null | undefined, suffix = "") => number == null ? "집계 불가" : `${number}${suffix}`;

export function RegularStudentReport({ report, mode }: { report: Report; mode: "admin" | "student" }) {
  const { session, ranks, stats } = report;
  const history = report.history;
  const trend = report.trend.filter((result) => result.examTypeId === session.examTypeId && result.examDate && result.examDate.slice(0, 10) <= session.examDate.slice(0, 10) && (!history || result.examDate.slice(0, 10) >= history.from));
  const hasTrend = report.hasPreviousExam !== false && new Set(trend.map((result) => result.examDate!.slice(0, 10))).size >= 2;
  const rank = (entry: { rank: number | null; count: number } | null) => entry ? `${value(entry.rank, "등")} (n=${entry.count})` : "지역 정보 없음";
  return <div className="admin-flat-page">
    <header><h2 className="admin-section-title">{session.examTypeName} {session.examDate.slice(0, 10)} 분석</h2><p className="admin-help">시험일 {session.examDate.slice(0, 10)}{mode === "admin" && report.student.name ? ` · ${report.student.name}` : ""}</p></header>
    {history && <section className="admin-section"><h2 className="admin-section-title">최근 6개월 개인 성적</h2>
      <p className="admin-help">선택한 시험일 기준 {history.from} ~ {history.to} · {history.coveredMonths}/6개월 기록 · {history.rows.length}회 응시. 과거 기록은 계속 보관됩니다.</p>
      {history.coveredMonths < 6 && <p className="admin-empty-state">6개월 중 {history.coveredMonths}개월의 성적만 있습니다. 기록이 없는 달은 0점으로 계산하지 않습니다.</p>}
      <div className="admin-table-frame"><table><thead><tr><th scope="col">시험일 / 월</th><th scope="col">총점 / 만점</th>{report.subjects.map(s => <th scope="col" key={s.id}>{s.name}</th>)}<th scope="col">반 석차</th><th scope="col">외부 석차</th><th scope="col">외부 상위%</th><th scope="col">응시 상태</th></tr></thead><tbody>{history.months.flatMap(month => {
        const rows = history.rows.filter(r => r.date.startsWith(month));
        if (!rows.length) return [<tr key={month}><th scope="row">{month}</th><td colSpan={report.subjects.length + 5}>성적 기록 없음</td></tr>];
        return rows.map(row => <tr key={row.date}><th scope="row">{row.date}</th><td>{row.total} / {row.fullScore}</td>{report.subjects.map(s => <td key={s.id}>{value(row.subjectScores[s.id])}</td>)}<td>{row.internalRank}등</td><td>{value(row.externalRank, "등")} (n={row.externalCount})</td><td>{value(row.externalTopPercent, "%")}</td><td>{row.isPartial ? "일부 미응시" : "응시"}</td></tr>);
      })}</tbody></table></div>
      <p className="admin-help">시험별 난이도와 응시 집단이 다를 수 있으므로 점수와 외부 상위%를 함께 확인하세요. 합격예측은 제공하지 않습니다.</p>
    </section>}
    {report.myScore.isPartial && <p className="admin-notice admin-notice-warning">일부 과목 미응시 결과입니다. 응시한 과목의 점수만 포함합니다.</p>}
    <div className="admin-metric-strip">{[
      ["총점", `${report.myScore.total} / ${session.fullScore}`],
      ["외부 석차", rank(ranks.external)], ["외부 상위", value(ranks.external.topPercent, "%")],
      ["지역 석차", rank(ranks.region)], ["반 석차", rank(ranks.internal)], ["외부 백분위", value(ranks.external.percentile)],
    ].map(([label, score]) => <div className="admin-metric-box" key={label}><p className="admin-metric-box-label">{label}</p><p className="admin-metric-box-value">{score}</p></div>)}</div>
    {ranks.internal.count < 10 && <p className="admin-help">반 내 지표는 참고용입니다(응시 {ranks.internal.count}명)</p>}
    <section className="admin-section"><h2 className="admin-section-title">과목별 비교</h2>
      <p className="admin-help">성취율은 과목 만점 대비 점수입니다. 상위%는 작을수록, 백분위는 클수록 상위입니다. 집계 불가는 비교 자료가 충분하지 않은 항목입니다.</p>
      <div className="admin-table-frame"><table><thead><tr>{["과목", "내 점수", "만점", "외부 평균", "지역 평균", "반 평균", "상위 10% 평균", "상위 30% 평균", "성취율", "판정", "판정 기준"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{stats.subjects.map((subject) => <tr key={subject.subjectId}><td className="admin-table-name">{subject.name}</td><td>{value(subject.my)}</td><td>{subject.fullScore}</td><td>{value(subject.externalAvg)}</td><td>{value(subject.regionAvg)}</td><td>{value(subject.internalAvg)}</td><td>{value(subject.top10Avg)}</td><td>{value(subject.top30Avg)}</td><td>{value(subject.scoreRate, "%")}</td><td>{subject.grade ?? "집계 불가"}</td><td>{subject.gradeBasis === "scoreRate" ? "성취율" : subject.gradeBasis === "percentile" ? "외부 상위%" : "집계 불가"}</td></tr>)}</tbody>
      </table></div>
      {stats.subjects.length === 0 && <p className="admin-help">응시 과목 정보가 없습니다.</p>}
      <SubjectRadar subjects={stats.subjects} />
    </section>
    <section className="admin-section"><h2 className="admin-section-title">과목 균형과 학습 조언</h2><div className="admin-notice"><p>{stats.balance.assessment} (표준편차 {stats.balance.stdDev})</p>{stats.advice.length ? <ul>{stats.advice.map((advice, index) => <li key={index}>{advice}</li>)}</ul> : <p>추가 학습 조언이 없습니다.</p>}</div></section>
    <section className="admin-section"><h2 className="admin-section-title">외부 성적 분포</h2><DistributionBars distribution={report.distribution} /></section>
    <ItemAnalysisTable items={report.items} subjects={report.subjects} />
    <section className="admin-section"><h2 className="admin-section-title">날짜별 추이</h2>{hasTrend ? <ExamScoreChart results={trend} variant={mode === "admin" ? "admin" : "portal"} /> : <p className="admin-empty-state">직전 시험이 없어 비교할 수 없습니다. 다음 시험부터 표시됩니다.</p>}</section>
    <section className="admin-section"><h2 className="admin-section-title">목표 대비</h2>{report.target ? <p className="admin-notice">목표 {report.target.targetScore}점 · 목표와 차이 {report.target.gap}점 ({report.target.gapPercent}%)</p> : <p className="admin-help">등록된 목표 점수가 없습니다.</p>}{report.flags.length > 0 && <ul className="admin-help">{report.flags.map((flag, index) => <li key={`${flag.kind}-${index}`}>{flag.detail}</li>)}</ul>}</section>
    <section className="admin-section"><h2 className="admin-section-title">내 주변 석차</h2><p className="admin-help">반 내 앞 5명·뒤 4명을 익명으로 비교합니다. 수험번호 일부만 표시합니다.</p>
      {report.competitors.length === 0 ? <p className="admin-help">비교할 주변 응시자가 없습니다.</p> : <div className="admin-table-frame"><table><thead><tr><th scope="col">수험번호</th><th scope="col">반 석차</th><th scope="col">총점</th>{report.subjects.map((subject) => <th scope="col" key={subject.id}>{subject.name}</th>)}</tr></thead><tbody>{report.competitors.map((competitor, index) => <tr key={index}><td>{competitor.studentNumber.slice(0, 2)}***</td><td>{competitor.rank}등</td><td>{competitor.total}</td>{report.subjects.map((subject) => <td key={subject.id}>{competitor.subjectScores[subject.id] ?? (subject.alternateGroup && report.subjects.some((other) => other.alternateGroup === subject.alternateGroup && competitor.subjectScores[other.id] != null) ? "선택 안 함" : "미응시")}</td>)}</tr>)}</tbody></table></div>}
    </section>
  </div>;
}
