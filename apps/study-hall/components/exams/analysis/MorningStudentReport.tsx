"use client";

import type { MorningStudentReport as Report } from "@/lib/morning-exam-analysis-types";
import { ItemAnalysisTable } from "./ItemAnalysisTable";
import { TrendLines } from "./charts/TrendLines";

const value = (number: number | null | undefined, suffix = "") => number == null || !Number.isFinite(number) ? "집계 불가" : `${Number(number.toFixed(1))}${suffix}`;
const delta = (number: number | null) => number == null ? "직전 기록 없음" : number === 0 ? "변동 없음" : `${number > 0 ? "▲" : "▼"} ${Math.abs(number)}등`;

export function MorningStudentReport({ report, mode }: { report: Report; mode: "admin" | "student" }) {
  const { summary, settings } = report;
  const lowParticipation = summary.attendanceRatePercent != null && summary.attendanceRatePercent < settings.morning.attendanceRatePercent;
  const subjectName = (id: string) => report.subjectDefinitions.find((subject) => subject.id === id)?.name ?? "과목 정보 없음";
  return <div className="admin-flat-page">
    <header><h2 className="admin-section-title">{report.examType.name} 개인 분석</h2><p className="admin-help">{report.range.from} ~ {report.range.to}{mode === "admin" && report.student.name ? ` · ${report.student.name}` : ""}</p></header>
    <div className="admin-metric-strip">{[
      ["기간 평균", value(summary.average, "점")], ["외부 평균 대비", value(summary.externalGap, "점")], ["반 평균 대비", value(summary.internalGap, "점")],
      ["이번 주 반 석차", value(summary.thisWeekRank, "등")], ["직전 주 대비", delta(summary.rankDelta)], ["응시율", value(summary.attendanceRatePercent, "%")],
    ].map(([label, score]) => <div className="admin-metric-box" key={label}><p className="admin-metric-box-label">{label}</p><p className="admin-metric-box-value">{score}</p></div>)}</div>
    <p className="admin-help">기간 내 응시 {summary.attended}회 / 예정 {summary.expected}회. 평균 대비는 내 평균에서 비교 평균을 뺀 값입니다.</p>
    {lowParticipation && <p className="admin-notice">응시율 {value(summary.attendanceRatePercent, "%")}라 추세를 판단하지 않습니다. 설정된 기준은 {value(settings.morning.attendanceRatePercent, "%")}입니다.</p>}
    <section className="admin-section admin-flat-page"><h2 className="admin-section-title">과목별 추세</h2>
      <p className="admin-help">이동평균은 최근 {settings.morning.movingAverageSessions}회, 추세는 최근 {settings.morning.trendWindowSessions}회 응시 기준입니다. 미응시는 0점으로 채우지 않습니다.</p>
      {!report.subjects.length && <p className="admin-empty-state">선택한 기간에 응시한 과목이 없습니다.</p>}
      {report.subjects.map((subject) => {
        const lowSubject = subject.attendanceRatePercent != null && subject.attendanceRatePercent < settings.morning.attendanceRatePercent;
        const withheld = lowParticipation || lowSubject;
        return <section className="admin-section space-y-4" key={subject.subjectId}>
          <h3 className="admin-section-title">{subject.name}</h3>
          <p className="admin-help">응시 {subject.attended}회 / 예정 {subject.expected}회 · 응시율 {value(subject.attendanceRatePercent, "%")}</p>
          {withheld ? <p className="admin-notice">이 과목은 응시율이 기준에 미달하여 추세와 하락을 판단하지 않습니다.</p> : subject.insufficientSample ? <p className="admin-empty-state">이 과목은 아직 {subject.attended}회만 응시했습니다. {subject.requiredSessions}회부터 추세를 표시합니다.</p> : <TrendLines label={`${subject.name} 점수와 이동평균`} columns={[{ key: "score", label: "내 점수" }, { key: "ma", label: `내 최근 ${settings.morning.movingAverageSessions}회 이동평균` }, { key: "classMa", label: "반 이동평균" }]} rows={subject.series.map((point) => ({ date: point.date, values: { score: point.score, ma: point.ma, classMa: point.classMa } }))} />}
          <div className="admin-table-frame"><table><thead><tr>{["내 평균", "외부 평균", "반 평균", "반 대비", "변동성", "기울기 (점/회)", "연속 하락"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody><tr><td>{value(subject.average)}</td><td>{value(subject.externalAvg)}</td><td>{value(subject.internalAvg)}</td><td>{value(subject.gap)}</td><td>{withheld || subject.insufficientSample ? "판정 보류" : value(subject.stdDev)}</td><td>{withheld || subject.insufficientSample ? "판정 보류" : value(subject.slope)}</td><td>{withheld || subject.insufficientSample ? "판정 보류" : `${subject.consecutiveDrops}회`}</td></tr></tbody></table></div>
          {!withheld && (subject.insufficientSample ? <p className="admin-empty-state">판정에 필요한 응시 회차가 부족합니다.</p> : subject.flags.filter((flag) => flag.kind !== "lowAttendance").length ? <ul className="admin-help">{subject.flags.filter((flag) => flag.kind !== "lowAttendance").map((flag) => <li key={flag.kind}>{flag.detail}</li>)}</ul> : <p className="admin-help">이 과목에 감지된 하락 신호가 없습니다.</p>)}
        </section>;
      })}
    </section>
    <section className="admin-section"><h2 className="admin-section-title">단원별 취약</h2><p className="admin-help">반 평균보다 낮은 단원부터 확인합니다. 격차는 내 평균 − 반 평균입니다.</p>
      {!report.topics.length ? <p className="admin-empty-state">진도 라벨이 입력된 시험이 없습니다.</p> : <div className="admin-table-frame"><table><thead><tr>{["단원", "과목", "응시", "내 평균", "반 평균", "격차"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{[...report.topics].sort((left, right) => (left.gap ?? Infinity) - (right.gap ?? Infinity)).map((topic) => <tr key={`${topic.subjectId}:${topic.topic}`}><td className="admin-table-name">{topic.topic}</td><td>{subjectName(topic.subjectId)}</td><td>{topic.count}회</td><td>{value(topic.myAvg)}</td><td>{value(topic.internalAvg)}</td><td>{value(topic.gap)}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="admin-section"><h2 className="admin-section-title">날짜별 문항 분석</h2>
      {!report.dailyItems.length ? <p className="admin-empty-state">선택한 기간에 가져온 문항 응답이 없습니다. 기존 성적 기록은 아래에서 확인할 수 있습니다.</p> : [...report.dailyItems].sort((left, right) => right.date.localeCompare(left.date) || left.subjectId.localeCompare(right.subjectId)).map((day) => <details className="admin-section" key={`${day.date}:${day.subjectId}`}><summary className="admin-button">{day.date} {day.subjectName}{day.topic ? ` · ${day.topic}` : ""}</summary>
        <p className="admin-help">외부 석차 {value(day.external.rank, "등")} (n={day.external.count}) · 상위 {value(day.external.topPercent, "%")} · 백분위 {value(day.external.percentile)}</p>
        <ItemAnalysisTable items={day.diagnostics} subjects={report.subjectDefinitions} />
      </details>)}
    </section>
    <section className="admin-section"><h2 className="admin-section-title">누적 시험과 진도 시험 비교</h2>{report.cumulativeGap ? <p className="admin-notice">같은 주끼리 비교한 {report.cumulativeGap.pairedWeeks}주 기준: 누적 평균 {value(report.cumulativeGap.cumulativeAvg, "점")} · 진도 평균 {value(report.cumulativeGap.progressAvg, "점")} · 격차 {value(report.cumulativeGap.gap, "점")}</p> : <p className="admin-empty-state">같은 주의 누적 시험과 진도 시험을 함께 비교할 자료가 없습니다.</p>}</section>
    <section className="admin-section"><h2 className="admin-section-title">주간 석차 변동</h2>{!report.weeklyRanks.length ? <p className="admin-empty-state">선택한 기간에 주간 석차 기록이 없습니다.</p> : <><div className="admin-table-frame"><table><thead><tr><th scope="col">주차</th><th scope="col">반 석차</th><th scope="col">응시 인원</th></tr></thead><tbody>{[...report.weeklyRanks].sort((left, right) => right.weekYear - left.weekYear || right.weekNumber - left.weekNumber).map((week) => <tr key={`${week.weekYear}:${week.weekNumber}`}><td>{week.weekYear}년 {week.weekNumber}주</td><td>{week.rank}등</td><td>n={week.count}</td></tr>)}</tbody></table></div>{report.weeklyRanks.length < 2 && <p className="admin-empty-state">직전 주 기록이 없어 석차 변동을 비교할 수 없습니다.</p>}</>}</section>
  </div>;
}
