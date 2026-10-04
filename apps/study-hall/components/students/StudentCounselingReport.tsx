import type { ReactNode } from "react";
import { gapText } from "@/lib/exam-preview/morning-personal";
import { subjectVerdict, weekLabel } from "@/lib/exam-preview/report-summary";
import type { StudentCounselingReport as Report } from "@/lib/services/student-report.service";
import { weekdayLabel } from "@/lib/student-report";
import { getInterviewResultTypeLabel } from "@/lib/interview-meta";

const n = (value: number | null | undefined, suffix = "") => value == null ? "—" : `${Number(value.toFixed(1)).toLocaleString("ko-KR")}${suffix}`;
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
const tone = (gap: number | null) => gap === null || Math.round(gap * 10) === 0 ? undefined : gap > 0 ? "report-up" : "report-down";
const verdictLabel = { "과락": "과락", "우수": "잘하고 있음", "보통": "보통", "취약": "복습 필요", "판정 불가": "판정 불가" } as const;

function Section({ title, note, children, keep = false }: { title: string; note?: string; children: ReactNode; keep?: boolean }) {
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

function Empty({ children }: { children: ReactNode }) {
  return <p className="report-empty">{children}</p>;
}

/**
 * 학생 상담 자료(A4). 면담 때 학생과 함께 보며 적는 종이다.
 * 순서: 한눈에 보기 → 성적(아침·정기) → 출결 → 등원 시각 → 상벌점 → 최근 면담 → 상담 기록(빈칸).
 * 인쇄 규칙(쪽 나눔·표 머리 반복)은 globals.css 의 .student-report 규칙이 맡는다.
 */
export function StudentCounselingReport({ report, today }: { report: Report; today: string }) {
  const { student, range, morning, regular, attendance, arrivals, points, standing, interviews } = report;
  const count = (status: string) => attendance?.counts.find((c) => c.status === status)?.count ?? 0;
  const regularRank = regular?.report.ranks.external;

  return (
    <article className="student-report" aria-label={`${student.name} 상담 자료`}>
      <header className="report-header">
        <div>
          <p className="report-eyebrow">학생 상담 자료</p>
          <h1>{student.name}<span>{student.studentNumber}</span></h1>
          <p className="report-meta">
            {[student.studyTrack, student.seat ? `좌석 ${student.seat}` : null, student.courseStartDate ? `과정 ${student.courseStartDate.slice(0, 10)} ~ ${student.courseEndDate?.slice(0, 10) ?? ""}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <dl className="report-header-side">
          <div><dt>조회 기간</dt><dd>{range.from} ~ {range.to} ({days(range.from, range.to)}일)</dd></div>
          <div><dt>작성일</dt><dd>{today}</dd></div>
        </dl>
      </header>

      <Section title="한눈에 보기" keep>
        <dl className="report-kpis">
          <div><dt>아침 모의고사 평균</dt><dd>{n(morning?.summary.overall.my, "점")}</dd><p>{morning?.summary.overall.benchmark != null ? `전체 평균 ${n(morning.summary.overall.benchmark, "점")} · ${gapText(morning.summary.overall.gap)}` : "기간 내 성적 없음"}</p></div>
          <div><dt>정기 모의고사 (최근)</dt><dd>{regular ? `${n(regular.report.myScore.total)} / ${n(regular.report.session.fullScore)}점` : "—"}</dd><p>{regular ? `${regular.date} · ${regularRank?.rank != null ? `${regularRank.rank}위 / ${regularRank.count}명` : "석차 없음"}` : "응시 기록 없음"}</p></div>
          <div><dt>출결</dt><dd>{attendance ? `출석 ${count("PRESENT")}` : "—"}</dd><p>{attendance ? `지각 ${count("TARDY")} · 결석 ${count("ABSENT")} · 사유결석 ${count("EXCUSED")} (교시 기준)` : "출결 관리 미사용"}</p></div>
          <div><dt>평균 등원 시각</dt><dd>{arrivals?.average ?? "—"}</dd><p>{arrivals?.days ? `${arrivals.days}일 기록 · 가장 늦은 ${arrivals.latest}` : "등원 기록 없음"}</p></div>
          <div><dt>누적 벌점</dt><dd className={standing && standing.demeritPoints > 0 ? "report-down" : undefined}>{standing ? `${standing.demeritPoints}점` : "—"}</dd><p>{standing ? `경고 단계 ${standing.warningStage}` : ""}</p></div>
          <div><dt>기간 상벌점</dt><dd>{points ? `상점 ${points.merit} · 벌점 ${points.demerit}` : "—"}</dd><p>{standing ? `남은 휴가 외출 ${standing.leave.holidayRemaining} · 반휴 ${standing.leave.halfDayRemaining} · 병가 ${standing.leave.healthRemaining}` : ""}</p></div>
        </dl>
        {morning ? <p className={`report-callout report-callout-${morning.summary.headline.tone}`}>{morning.summary.headline.text}</p> : null}
      </Section>

      <Section title={`아침 모의고사 · ${morning?.examTypeName ?? ""}`} note="전체 평균 = 같은 시험을 본 전체 응시자 평균. 차이는 100점 기준.">
        {morning ? (
          <>
            <table className="report-table">
              <thead><tr><th>과목</th><th>내 평균</th><th>전체 평균</th><th>차이</th>{morning.summary.weeks.map((w) => <th key={w}>{weekLabel(w)}</th>)}<th>상태</th></tr></thead>
              <tbody>
                {morning.summary.subjects.filter((s) => s.expected > 0).map((s) => (
                  <tr key={s.subjectId}>
                    <th scope="row">{s.name}</th>
                    <td className="num">{n(s.my)}</td><td className="num">{n(s.benchmark)}</td>
                    <td className={`num ${tone(s.gap) ?? ""}`}>{s.gap === null ? "—" : gapText(s.gap)}</td>
                    {s.weeks.map((attempts, i) => <td key={morning.summary.weeks[i]} className="num">{attempts.length ? attempts.map((a) => <span key={a.date} className={`report-score${a.below ? " report-down" : ""}`}>{attempts.length > 1 ? `${md(a.date)} ` : ""}{a.my === null ? "결시" : n(a.my)}</span>) : "—"}</td>)}
                    <td>{s.statusLabel}{s.few ? ` (${s.paired}회 · 참고)` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="report-subhead">먼저 공부할 것</h3>
            {morning.study.length ? (
              <table className="report-table">
                <thead><tr><th>순서</th><th>과목</th><th>시험일</th><th>시험 범위</th><th>내 점수 / 평균</th><th>다시 볼 문항</th></tr></thead>
                <tbody>
                  {morning.study.map((r, i) => (
                    <tr key={`${r.sessionId}-${r.subjectId}`}>
                      <td>{i + 1}</td><td>{r.subjectName}</td><td>{md(r.date)}({weekdayLabel(r.date)})</td><td className="wrap">{r.topic || "범위 미등록"}</td>
                      <td className="num">{n(r.my)} / {n(r.external)}</td>
                      <td className="wrap"><strong>{r.easy.map((item) => `${item.itemNo}`).join(", ")}</strong>{r.easy.length && r.other.length ? " · " : ""}{r.other.map((item) => `${item.itemNo}`).join(", ")}{r.easy.length + r.other.length ? "번" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>기간 내 틀린 문항이 없습니다.</Empty>}
            <p className="report-note">굵은 번호는 응시자 {n(morning.easyThreshold, "%")} 이상이 맞힌 문제입니다. 빨간 점수는 과락(만점의 {n(morning.failCutoffPercent, "%")} 미만)입니다.</p>
          </>
        ) : <Empty>조회 기간에 응시한 아침 모의고사가 없습니다.</Empty>}
      </Section>

      {regular ? (
        <Section title={`정기 모의고사 · ${regular.examTypeName}`} note={`${regular.date} 시험`} keep>
          <table className="report-table">
            <thead><tr><th>과목</th><th>내 점수 / 만점</th><th>전체 평균</th><th>차이</th><th>석차</th><th>상태</th></tr></thead>
            <tbody>
              {regular.report.stats.subjects.map((s) => {
                const gap = s.externalAvg === null ? null : s.my - s.externalAvg;
                return (
                  <tr key={s.subjectId}>
                    <th scope="row">{s.name}</th><td className="num">{n(s.my)} / {n(s.fullScore)}</td><td className="num">{n(s.externalAvg)}</td>
                    <td className={`num ${tone(gap) ?? ""}`}>{gap === null ? "—" : gapText(gap)}</td>
                    <td>{s.externalRank === null ? "—" : `${s.externalRank}위${s.externalCount ? ` / ${s.externalCount}명` : ""}`}</td>
                    <td>{verdictLabel[subjectVerdict(s, regular.failCutoffPercent)]}</td>
                  </tr>
                );
              })}
              <tr className="report-total"><th scope="row">총점</th><td className="num">{n(regular.report.myScore.total)} / {n(regular.report.session.fullScore)}</td><td className="num">{n(regular.report.stats.external.average)}</td><td className={`num ${tone(regular.report.stats.external.average === null ? null : regular.report.myScore.total - regular.report.stats.external.average) ?? ""}`}>{regular.report.stats.external.average === null ? "—" : gapText(regular.report.myScore.total - regular.report.stats.external.average)}</td><td>{regularRank?.rank != null ? `${regularRank.rank}위 / ${regularRank.count}명` : "—"}</td><td>{regularRank?.topPercent != null ? `상위 ${n(regularRank.topPercent, "%")}` : ""}</td></tr>
            </tbody>
          </table>
        </Section>
      ) : null}

      <Section title="출결" note="교시별 기록 수입니다. 아래 표는 출석이 아닌 기록만 모았습니다.">
        {attendance ? (
          <>
            <table className="report-table report-counts">
              <thead><tr>{attendance.counts.map((c) => <th key={c.status}>{c.label}</th>)}</tr></thead>
              <tbody><tr>{attendance.counts.map((c) => <td key={c.status} className={`num ${c.count && ["TARDY", "ABSENT"].includes(c.status) ? "report-down" : ""}`}>{c.count}회</td>)}</tr></tbody>
            </table>
            {attendance.exceptions.length ? (
              <table className="report-table">
                <thead><tr><th>날짜</th><th>교시</th><th>상태</th><th>사유</th></tr></thead>
                <tbody>{attendance.exceptions.map((r, i) => <tr key={`${r.date}-${r.period}-${i}`}><td>{md(r.date)}({weekdayLabel(r.date)})</td><td>{r.period}</td><td className={["TARDY", "ABSENT"].includes(r.status) ? "report-down" : undefined}>{r.label}</td><td className="wrap">{r.reason || "—"}</td></tr>)}</tbody>
              </table>
            ) : <Empty>기간 내 지각·결석·사유 기록이 없습니다.</Empty>}
          </>
        ) : <Empty>출결 기록을 불러올 수 없습니다.</Empty>}
      </Section>

      <Section title="등원 시각" note={arrivals?.days ? `${arrivals.days}일 · 평균 ${arrivals.average} · 가장 이른 ${arrivals.earliest} · 가장 늦은 ${arrivals.latest}` : undefined}>
        {arrivals?.rows.length ? (
          <ol className="report-arrivals">
            {arrivals.rows.map((r) => <li key={r.date} className={r.tardy ? "report-arrival-tardy" : undefined}><span>{md(r.date)}({r.weekday})</span><strong>{r.time}</strong><em>{r.tardy ? "지각" : ""}</em></li>)}
          </ol>
        ) : <Empty>조회 기간에 등원 기록이 없습니다.</Empty>}
      </Section>

      <Section title="상벌점" note={standing ? `누적 벌점 ${standing.demeritPoints}점 · 경고 단계 ${standing.warningStage} · 집계 ${standing.aggregation}` : undefined}>
        {points?.rows.length ? (
          <table className="report-table">
            <thead><tr><th>날짜</th><th>항목</th><th>점수</th><th>메모</th></tr></thead>
            <tbody>{points.rows.map((r, i) => <tr key={`${r.date}-${i}`}><td>{md(r.date)}({weekdayLabel(r.date)})</td><td className="wrap">{r.name}</td><td className={`num ${r.points < 0 ? "report-down" : "report-up"}`}>{r.points > 0 ? `+${r.points}` : r.points}점</td><td className="wrap">{r.notes || "—"}</td></tr>)}</tbody>
          </table>
        ) : <Empty>조회 기간에 상벌점 기록이 없습니다.</Empty>}
      </Section>

      {interviews.length ? (
        <Section title="최근 면담" keep>
          <table className="report-table">
            <thead><tr><th>날짜</th><th>사유</th><th>결과</th><th>후속 확인일</th></tr></thead>
            <tbody>{interviews.map((r) => <tr key={r.id}><td>{r.date.slice(0, 10)}</td><td className="wrap">{r.reason}</td><td>{getInterviewResultTypeLabel(r.resultType)}</td><td>{r.followUpDate?.slice(0, 10) ?? "—"}</td></tr>)}</tbody>
          </table>
        </Section>
      ) : null}

      <Section title="상담 기록" keep>
        <table className="report-table report-write">
          <tbody>
            <tr><th scope="row">상담 내용</th><td className="report-write-tall" /></tr>
            <tr><th scope="row">학생과 정한 목표</th><td className="report-write-mid" /></tr>
            <tr><th scope="row">다음 주 과제</th><td className="report-write-mid" /></tr>
            <tr><th scope="row">다음 점검일</th><td /></tr>
          </tbody>
        </table>
        <div className="report-signs"><span>학생 확인</span><span>상담자</span></div>
      </Section>
    </article>
  );
}
