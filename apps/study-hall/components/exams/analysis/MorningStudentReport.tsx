"use client";

import type { MorningStudentReport as Report } from "@/lib/morning-exam-analysis-types";
import { MorningLearningSummary, SubjectTabs } from "./LearningActionSummary";
import { ReportPrintButton } from "./ReportPrintButton";
import { PersonalReportTabs, type ReportSection } from "./PersonalReportTabs";
import { reviewBuckets } from "@/lib/exam-learning-plan";
import { formatWeekLabel } from "@/lib/exam-week-label";
import type { ReactNode } from "react";
import { ItemAnalysisTable } from "./ItemAnalysisTable";
import { TrendLines } from "./charts/TrendLines";


const value = (number: number | null | undefined, suffix = "") => number == null || !Number.isFinite(number) ? "집계 불가" : `${Number(number.toFixed(1))}${suffix}`;
const delta = (number: number | null) => number == null ? "직전 기록 없음" : number === 0 ? "변동 없음" : `${number > 0 ? "▲" : "▼"} ${Math.abs(number)}등`;

export function MorningStudentReport({ report, mode, section, records }: { report: Report; mode: "admin" | "student"; section?: ReportSection; records?: ReactNode }) {
  const { summary, settings } = report;
  const lowParticipation = summary.attendanceRatePercent != null && summary.attendanceRatePercent < settings.morning.attendanceRatePercent;
  return <div className="admin-flat-page" data-report-root>
    {mode === "admin" && !section && <ReportPrintButton />}
    <header>{!section && <h2 className="admin-section-title">{report.examType.name} 개인 분석</h2>}<p className="admin-help">{report.range.from} ~ {report.range.to}{mode === "admin" && report.student.name ? ` · ${report.student.name}` : ""}</p></header>
    <PersonalReportTabs section={section}>
    <div data-report-section="diagnosis"><MorningLearningSummary report={report} /></div>
    <div data-report-section="overview" className="admin-metric-strip">{[
      ["기간 평균", value(summary.average, "점")], ["외부 평균 대비", value(summary.externalGap, "점")], ["반 평균 대비", value(summary.internalGap, "점")],
      ["이번 주 반 석차", value(summary.thisWeekRank, "등")], ["직전 주 대비", delta(summary.rankDelta)], ["응시율", value(summary.attendanceRatePercent, "%")],
    ].map(([label, score]) => <div className="admin-metric-box" key={label}><p className="admin-metric-box-label">{label}</p><p className={/\d/.test(String(score)) ? "admin-metric-box-value" : "admin-metric-box-value admin-metric-box-status"}>{score}</p></div>)}</div>
    {<section data-report-section="trend" id="personal-trend" className="admin-section"><h2 className="admin-section-title">과목별 추세</h2>
      <p className="admin-help">이동평균 {settings.morning.movingAverageSessions}회 · 추세 {settings.morning.trendWindowSessions}회 응시 기준</p>
      {!report.subjects.length && <p className="admin-empty-state">선택한 기간에 응시한 과목이 없습니다.</p>}
      <SubjectTabs label="성적 추이 과목" subjects={report.subjects.map((subject) => {
        const lowSubject = subject.attendanceRatePercent != null && subject.attendanceRatePercent < settings.morning.attendanceRatePercent;
        const withheld = lowParticipation || lowSubject;
        return { id: subject.subjectId, name: subject.name, content: <>
          <p className="admin-help">응시 {subject.attended}회 / 예정 {subject.expected}회 · 응시율 {value(subject.attendanceRatePercent, "%")}</p>
          {withheld ? <p className="admin-notice">{lowParticipation
            ? "전체 응시 기록이 부족하여 추세와 하락을 판단하지 않습니다."
            : "이 과목의 응시 기록이 부족하여 추세와 하락을 판단하지 않습니다."}</p> : subject.insufficientSample ? <p className="admin-empty-state">이 과목은 아직 {subject.attended}회만 응시했습니다. {subject.requiredSessions}회부터 추세를 표시합니다.</p> : <TrendLines label={`${subject.name} 점수와 이동평균`} columns={[{ key: "score", label: "내 점수" }, { key: "ma", label: `내 최근 ${settings.morning.movingAverageSessions}회 이동평균` }, { key: "classMa", label: "반 이동평균" }]} rows={subject.series.map((point) => ({ date: point.date, values: { score: point.score, ma: point.ma, classMa: point.classMa } }))} />}
          <div className="admin-table-frame"><table><thead><tr>{["내 평균", "외부 평균", "반 평균", "반 대비", "변동성", "기울기 (점/회)", "연속 하락"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody><tr><td>{value(subject.average)}</td><td>{value(subject.externalAvg)}</td><td>{value(subject.internalAvg)}</td><td>{value(subject.gap)}</td><td>{withheld || subject.insufficientSample ? "판정 보류" : value(subject.stdDev)}</td><td>{withheld || subject.insufficientSample ? "판정 보류" : value(subject.slope)}</td><td>{withheld || subject.insufficientSample ? "판정 보류" : `${subject.consecutiveDrops}회`}</td></tr></tbody></table></div>
          {!withheld && (subject.insufficientSample ? <p className="admin-empty-state">판정에 필요한 응시 회차가 부족합니다.</p> : subject.flags.filter((flag) => flag.kind !== "lowAttendance").length ? <ul className="admin-help">{subject.flags.filter((flag) => flag.kind !== "lowAttendance").map((flag) => <li key={flag.kind}>{flag.detail}</li>)}</ul> : <p className="admin-help">이 과목에 감지된 하락 신호가 없습니다.</p>)}
          </> };
      })} />
    </section>}
    <section data-report-section="subjects" className="admin-section"><h2 id="personal-subjects" className="admin-section-title">과목별 복습 기록</h2>
      <SubjectTabs label="과목별 복습 기록" subjects={report.subjects.map(subject => {
        const days = report.dailyItems.filter(day => day.subjectId === subject.subjectId).sort((a,b) => b.date.localeCompare(a.date));
        const repeated = days.filter(day => reviewBuckets(day.diagnostics.list, day.diagnostics.responseCorrectness).easyWrong.length > 0).length;
        return { id: subject.subjectId, name: subject.name, content: <>
          <p className="admin-help">응시 {subject.attended}회 · 내 평균 {value(subject.average)} · 반 평균 대비 {value(subject.gap)}</p>
          <p className="admin-help">정답률 높은 문항의 오답 발생 {repeated}/{days.length}회</p>
          {!days.length ? <p className="admin-empty-state">문항별 응답 자료가 없습니다.</p> : <div className="admin-table-frame"><table><thead><tr>{["시험일", "정답률", "오답", "무응답", "쉬운 오답"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{days.map(day => <tr key={day.date}><th scope="row">{day.date}</th><td>{value(day.diagnostics.summary.myCorrectRate, "%")}</td><td>{day.diagnostics.summary.wrong}개</td><td>{day.diagnostics.summary.unanswered}개</td><td>{reviewBuckets(day.diagnostics.list, day.diagnostics.responseCorrectness).easyWrong.length}개</td></tr>)}</tbody></table></div>}
        </> };
      })} />
    </section>
    <section data-report-section="items" className="admin-section"><h2 id="personal-items" className="admin-section-title">문항 분석</h2>
      <SubjectTabs label="문항 분석 과목" subjects={report.subjectDefinitions.filter(subject => report.dailyItems.some(day => day.subjectId === subject.id)).map(subject => ({ id: subject.id, name: subject.name, content:
        <div className="admin-flat-page">{report.dailyItems.filter(day => day.subjectId === subject.id).sort((a,b) => b.date.localeCompare(a.date)).map(day => <details className="admin-disclosure" key={day.date}><summary>{day.date}{day.topic ? ' · '+day.topic : ''}</summary><div className="admin-disclosure-body">
          <p className="admin-help">외부 석차 {value(day.external.rank, "등")} · 상위 {value(day.external.topPercent, "%")} · 백분위 {value(day.external.percentile)}</p>
          <ItemAnalysisTable items={day.diagnostics} subjects={report.subjectDefinitions} heading={false} />
        </div></details>)}</div>
      }))} />
    </section>
    {<section data-report-section="rank" className="admin-section"><h2 className="admin-section-title">누적 시험과 진도 시험 비교</h2>{report.cumulativeGap ? <p className="admin-notice">같은 주끼리 비교한 {report.cumulativeGap.pairedWeeks}주 기준: 누적 평균 {value(report.cumulativeGap.cumulativeAvg, "점")} · 진도 평균 {value(report.cumulativeGap.progressAvg, "점")} · 격차 {value(report.cumulativeGap.gap, "점")}</p> : <p className="admin-empty-state">같은 주의 누적 시험과 진도 시험을 함께 비교할 자료가 없습니다.</p>}</section>}
    {<section data-report-section="rank" className="admin-section"><h2 className="admin-section-title">주간 석차 변동</h2>{!report.weeklyRanks.length ? <p className="admin-empty-state">선택한 기간에 주간 석차 기록이 없습니다.</p> : <><div className="admin-table-frame"><table><thead><tr><th scope="col">주차</th><th scope="col">반 석차</th><th scope="col">응시 인원</th></tr></thead><tbody>{[...report.weeklyRanks].sort((left, right) => right.weekYear - left.weekYear || right.weekNumber - left.weekNumber).map((week) => <tr key={`${week.weekYear}:${week.weekNumber}`}><td>{formatWeekLabel(week)}</td><td>{week.rank}등</td><td>{week.count}명</td></tr>)}</tbody></table></div>{report.weeklyRanks.length < 2 && <p className="admin-empty-state">직전 주 기록이 없어 석차 변동을 비교할 수 없습니다.</p>}</>}</section>}
    {records && <div data-report-section="records" className="admin-flat-page">{records}</div>}
    </PersonalReportTabs>
  </div>;
}
