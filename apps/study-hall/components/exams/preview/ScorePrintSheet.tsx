import { Fragment } from "react";

import { PrintEmpty, PrintHeader, PrintSection, PrintStatement, type PrintTone } from "@/components/print/PrintParts";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "@/lib/exam-analysis-settings";
import { reviewGroups } from "@/lib/exam-preview/metrics";
import { gapText, morningPersonalSummary, morningStudyRows, type StudyRow } from "@/lib/exam-preview/morning-personal";
import { regularHeadline, subjectVerdict } from "@/lib/exam-preview/report-summary";
import { morningRecordRows, regularHistoryRows, type WrongItem } from "@/lib/exam-preview/score-print";
import type { PreviewData } from "@/lib/exam-preview/types";
import { weekdayLabel } from "@/lib/student-report";
import { VERDICT_WORDS } from "@/lib/student-words";

/**
 * 성적표 인쇄 서식(A4). 화면 성적표를 복사하지 않고, 학생이 볼 정보만 표로 적는다(운영자 요청 2026-10-07).
 * 아침: 학생 정보 → 성적 요약 → 과목별 성적 → 먼저 공부할 것 → 시험 기록(시험마다 점수·틀린 문항).
 * 정기: 학생 정보 → 성적 요약 → 과목별 성적 → 점수 변화 → 먼저 공부할 것.
 * 빼는 것: 응시자 선택비율, 문항별 상세, 차트, 석차 비교, 화면 조작 안내, 복습 예약.
 * 숫자와 판정은 화면과 같은 함수에서 나온다(morning-personal, report-summary).
 */
export type ScorePrintHeadline = { text: string; tone: PrintTone };

const n = (value: number | null | undefined, suffix = "") => (value == null ? "—" : `${Number(value.toFixed(1)).toLocaleString("ko-KR")}${suffix}`);
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const day = (date: string) => `${md(date)}(${weekdayLabel(date)})`;
const tone = (gap: number | null) => (gap === null || Math.round(gap * 10) === 0 ? undefined : gap > 0 ? "report-up" : "report-down");

/** 틀린 문항 번호. 많이 맞힌 문제를 틀린 것은 굵게. */
function Items({ items }: { items: WrongItem[] }) {
  if (!items.length) return <>없음</>;
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={item.itemNo}>
          {index ? ", " : ""}
          {item.easy ? <strong>{item.itemNo}</strong> : item.itemNo}
        </Fragment>
      ))}
      번
    </>
  );
}

const studyItems = (row: StudyRow): WrongItem[] =>
  [...row.easy.map((i) => ({ itemNo: i.itemNo, easy: true })), ...row.other.map((i) => ({ itemNo: i.itemNo, easy: false }))].sort((a, b) => a.itemNo - b.itemNo);

export function ScorePrintSheet({ data, mode, today, headline }: { data: PreviewData; mode: "admin" | "student"; today: string; headline?: ScorePrintHeadline | null }) {
  return data.kind === "regular"
    ? <RegularSheet data={data} mode={mode} today={today} headline={headline} />
    : <MorningSheet data={data} today={today} />;
}

function Footnote({ data }: { data: PreviewData }) {
  return (
    <p className="report-note">
      굵은 번호는 응시자 {n(data.easyThreshold, "%")} 이상이 맞힌 문제입니다(실수였는지 먼저 확인하세요).
      {data.failCutoffPercent > 0 ? ` 빨간 점수는 과락(만점의 ${n(data.failCutoffPercent, "%")} 미만)입니다.` : ""}
    </p>
  );
}

function MorningSheet({ data, today }: { data: PreviewData; today: string }) {
  const summary = morningPersonalSummary(data);
  const maxTasks = data.morning?.settings?.diagnosis?.maxTasks ?? DEFAULT_EXAM_ANALYSIS_SETTINGS.diagnosis.maxTasks;
  const study = morningStudyRows(data).slice(0, maxTasks);
  const records = morningRecordRows(data);
  const subjects = summary.subjects.filter((s) => s.expected > 0);
  const failTotal = subjects.reduce((sum, s) => sum + s.failCount, 0);

  return (
    <article className="student-report score-print-sheet" aria-label={`${data.student?.name ?? ""} 아침 모의고사 성적표`}>
      <PrintHeader
        title="아침 모의고사 성적표"
        info={[
          ["이름", data.student?.name ?? "—"],
          ["수험번호", data.student?.studentNumber ?? "—"],
          ["시험", data.examType.name],
          ["조회 기간", `${data.range.from} ~ ${data.range.to}`],
          ["응시", `${summary.overall.attended} / ${summary.overall.expected}회`],
          ["출력일", today],
        ]}
      />
      <PrintStatement rows={[{ label: "성적 요약", text: summary.headline.text, tone: summary.headline.tone }]} />

      <PrintSection title="과목별 성적" note={`점수는 100점 기준 평균 · 전체 평균은 같은 시험을 본 전체 응시자 평균${summary.scaledNote ? " · 만점이 100점이 아닌 시험은 100점으로 바꿔 계산" : ""}`} keep>
        {subjects.length ? (
          <table className="report-table">
            <thead><tr><th scope="col">과목</th><th scope="col">응시</th><th scope="col">내 평균</th><th scope="col">전체 평균</th><th scope="col">차이</th><th scope="col">과락</th><th scope="col">상태</th></tr></thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.subjectId}>
                  <th scope="row">{s.name}</th>
                  <td>{s.attended} / {s.expected}회</td>
                  <td>{n(s.my)}</td>
                  <td>{n(s.benchmark)}</td>
                  <td className={tone(s.gap)}>{s.gap === null ? "—" : gapText(s.gap)}</td>
                  <td className={s.failCount ? "report-down" : undefined}>{s.failCount ? `${s.failCount}회` : "—"}</td>
                  <td>{s.statusLabel}{s.few ? " (참고)" : ""}</td>
                </tr>
              ))}
              <tr className="report-total">
                <th scope="row">전체</th>
                <td>{summary.overall.attended} / {summary.overall.expected}회</td>
                <td>{n(summary.overall.my)}</td>
                <td>{n(summary.overall.benchmark)}</td>
                <td className={tone(summary.overall.gap)}>{summary.overall.gap === null ? "—" : gapText(summary.overall.gap)}</td>
                <td className={failTotal ? "report-down" : undefined}>{failTotal ? `${failTotal}회` : "—"}</td>
                <td />
              </tr>
            </tbody>
          </table>
        ) : <PrintEmpty>조회 기간에 아침 모의고사가 없습니다.</PrintEmpty>}
      </PrintSection>

      <PrintSection title="먼저 공부할 것" note={`전체 평균보다 많이 낮았던 시험부터 ${maxTasks}개`} keep>
        {study.length ? (
          <table className="report-table">
            <thead><tr><th scope="col">순서</th><th scope="col">과목</th><th scope="col">시험일</th><th scope="col">시험 범위</th><th scope="col">내 점수 / 평균</th><th scope="col">다시 볼 문항</th></tr></thead>
            <tbody>
              {study.map((row, index) => (
                <tr key={`${row.sessionId}-${row.subjectId}`}>
                  <td>{index + 1}</td>
                  <td>{row.subjectName}</td>
                  <td>{day(row.date)}</td>
                  <td className="wrap">{row.topic || "범위 미등록"}</td>
                  <td>{n(row.my)} / {n(row.external)}</td>
                  <td className="wrap"><Items items={studyItems(row)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <PrintEmpty>기간 안에 틀린 문항이 없습니다.</PrintEmpty>}
      </PrintSection>

      <PrintSection title="시험 기록" note={`${records.length}회 · 날짜순`}>
        {records.length ? (
          <table className="report-table">
            <thead><tr><th scope="col">날짜</th><th scope="col">과목</th><th scope="col">시험 범위</th><th scope="col">내 점수</th><th scope="col">전체 평균</th><th scope="col">차이</th><th scope="col">틀린 문항</th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.key}>
                  <td>{day(r.date)}</td>
                  <td>{r.subjectName}</td>
                  <td className="wrap">{r.topic || "—"}</td>
                  <td className={r.below ? "report-down" : undefined}>{r.my === null ? "결시" : n(r.my)}</td>
                  <td>{n(r.external)}</td>
                  <td className={tone(r.gap)}>{r.gap === null ? "—" : gapText(r.gap)}</td>
                  <td className="wrap">{r.my === null ? "—" : <Items items={r.wrong} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <PrintEmpty>조회 기간에 응시한 시험이 없습니다.</PrintEmpty>}
      </PrintSection>
      <Footnote data={data} />
    </article>
  );
}

function RegularSheet({ data, mode, today, headline }: { data: PreviewData; mode: "admin" | "student"; today: string; headline?: ScorePrintHeadline | null }) {
  const report = data.regular;
  const rank = report?.ranks.external;
  const header = (
    <PrintHeader
      title="정기 모의고사 성적표"
      info={[
        ["이름", data.student?.name ?? "—"],
        ["수험번호", data.student?.studentNumber ?? "—"],
        ["시험", data.examType.name],
        ["시험일", data.range.to],
        ["석차", rank?.rank != null ? `${rank.rank}위 / ${rank.count}명` : "—"],
        ["출력일", today],
      ]}
    />
  );
  if (!report) {
    return <article className="student-report score-print-sheet" aria-label="정기 모의고사 성적표">{header}<PrintEmpty>이 시험의 성적이 없습니다.</PrintEmpty></article>;
  }
  // 학생 화면과 같이 학생 인쇄에는 과목 석차 열을 두지 않는다(총 석차는 머리 표에 있다).
  const subjectRank = mode === "admin";
  const current = data.comparisons.filter((r) => r.date === data.range.to);
  const study = morningStudyRows(data, current);
  const history = regularHistoryRows(data);
  const statement = headline ?? regularHeadline({
    total: report.myScore.total, fullScore: report.session.fullScore, isPartial: report.myScore.isPartial,
    rank: report.ranks.external.rank, count: report.ranks.external.count, topPercent: report.ranks.external.topPercent,
    subjects: report.stats.subjects.map((s) => ({ name: s.name, my: s.my, fullScore: s.fullScore, grade: s.grade })),
    failCutoffPercent: data.failCutoffPercent, easyWrong: reviewGroups(data.items, data.easyThreshold).easy.length, repeatedTopic: null,
    wrong: data.items.filter((i) => i.correct === false).length,
    declining: report.flags.some((f) => f.kind === "totalDrop" || f.kind === "rankDrop"),
  });
  const totalGap = report.stats.external.average === null || report.myScore.isPartial ? null : report.myScore.total - report.stats.external.average;

  return (
    <article className="student-report score-print-sheet" aria-label={`${data.student?.name ?? ""} 정기 모의고사 성적표`}>
      {header}
      <PrintStatement rows={[{ label: "성적 요약", text: statement.text, tone: statement.tone }]} />

      <PrintSection title="과목별 성적" note="전체 평균은 같은 시험을 본 전체 응시자 평균" keep>
        <table className="report-table">
          <thead><tr><th scope="col">과목</th><th scope="col">내 점수 / 만점</th><th scope="col">전체 평균</th><th scope="col">차이</th>{subjectRank ? <th scope="col">석차</th> : null}<th scope="col">상태</th></tr></thead>
          <tbody>
            {report.stats.subjects.map((s) => {
              const gap = s.externalAvg === null ? null : s.my - s.externalAvg;
              const verdict = subjectVerdict(s, data.failCutoffPercent);
              return (
                <tr key={s.subjectId}>
                  <th scope="row">{s.name}</th>
                  <td className={verdict === "과락" ? "report-down" : undefined}>{n(s.my)} / {n(s.fullScore)}</td>
                  <td>{n(s.externalAvg)}</td>
                  <td className={tone(gap)}>{gap === null ? "—" : gapText(gap)}</td>
                  {subjectRank ? <td>{s.externalRank === null ? "—" : `${s.externalRank}위${s.externalCount ? ` / ${s.externalCount}명` : ""}`}</td> : null}
                  <td>{VERDICT_WORDS[verdict]}</td>
                </tr>
              );
            })}
            <tr className="report-total">
              <th scope="row">총점</th>
              <td>{n(report.myScore.total)} / {n(report.session.fullScore)}{report.myScore.isPartial ? " (부분 응시)" : ""}</td>
              <td>{n(report.stats.external.average)}</td>
              <td className={tone(totalGap)}>{totalGap === null ? "—" : gapText(totalGap)}</td>
              {subjectRank ? <td>{rank?.rank != null ? `${rank.rank}위 / ${rank.count}명` : "—"}</td> : null}
              <td />
            </tr>
          </tbody>
        </table>
      </PrintSection>

      {history.length > 1 ? (
        <PrintSection title="점수 변화" note={`최근 ${history.length}회`} keep>
          <table className="report-table">
            <thead><tr><th scope="col">시험일</th><th scope="col">총점</th><th scope="col">석차</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.date}>
                  <td>{day(h.date)}</td>
                  <td>{n(h.total)} / {n(h.fullScore)}{h.isPartial ? " (부분 응시)" : ""}</td>
                  <td>{h.rank === null ? "—" : `${h.rank}위 / ${h.count}명`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintSection>
      ) : null}

      <PrintSection title="먼저 공부할 것" note="전체 평균보다 많이 낮은 과목부터" keep>
        {study.length ? (
          <table className="report-table">
            <thead><tr><th scope="col">순서</th><th scope="col">과목</th><th scope="col">내 점수 / 평균</th><th scope="col">차이</th><th scope="col">다시 볼 문항</th></tr></thead>
            <tbody>
              {study.map((row, index) => (
                <tr key={`${row.sessionId}-${row.subjectId}`}>
                  <td>{index + 1}</td>
                  <td>{row.subjectName}</td>
                  <td>{n(row.my)} / {n(row.external)}</td>
                  <td className={tone(row.gap)}>{row.gap === null ? "—" : gapText(row.gap)}</td>
                  <td className="wrap"><Items items={studyItems(row)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <PrintEmpty>틀린 문항이 없습니다.</PrintEmpty>}
      </PrintSection>
      <Footnote data={data} />
    </article>
  );
}
