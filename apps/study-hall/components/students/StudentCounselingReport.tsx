import { PrintChecklist, PrintEmpty, PrintHeader, PrintSection as Section, PrintSigns, PrintStatement } from "@/components/print/PrintParts";
import { gapText } from "@/lib/exam-preview/morning-personal";
import { subjectVerdict, weekLabel } from "@/lib/exam-preview/report-summary";
import type { StudentCounselingReport as Report } from "@/lib/services/student-report.service";
import { arrivalWeeks, weekdayLabel } from "@/lib/student-report";
import { getInterviewResultTypeLabel } from "@/lib/interview-meta";
import { STUDY_CAUSE_WORDS, TASK_STATUS_WORDS, VERDICT_WORDS } from "@/lib/student-words";

const n = (value: number | null | undefined, suffix = "") => value == null ? "—" : `${Number(value.toFixed(1)).toLocaleString("ko-KR")}${suffix}`;
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
const tone = (gap: number | null) => gap === null || Math.round(gap * 10) === 0 ? undefined : gap > 0 ? "report-up" : "report-down";
const verdictLabel = VERDICT_WORDS;

/**
 * 학생 상담 자료(A4). 면담 때 학생과 함께 보며 적는 종이다.
 * 면담용이다. 학생에게 주는 성적표(ScorePrintSheet)와 겹치지 않게 성적은 결론·과목표만 두고, 공부할 것은 학습 진단 표 하나로 본다.
 * 순서: 한눈에 보기 → 성적(아침·정기) → 학습 진단·지난 할 일 → 출결 → 등원 시각 → 상벌점 → 최근 면담 → 상담 기록(빈칸).
 * 모든 정보는 표로 적는다(카드·색 상자 없음, components/print/PrintParts.tsx).
 * 출결은 교시마다 한 줄이 아니다: 지각·결석은 날짜별, 사유결석·휴무·반휴는 같은 사유끼리 한 줄이다(운영자 요청 2026-10-07).
 * 인쇄 규칙(쪽 나눔·표 머리 반복)은 globals.css 의 .student-report 규칙이 맡는다.
 */
export function StudentCounselingReport({ report, today }: { report: Report; today: string }) {
  const { student, range, morning, regular, attendance, arrivals, points, standing, interviews, diagnosis, studyTasks } = report;
  const count = (status: string) => attendance?.counts.find((c) => c.status === status)?.count ?? 0;
  const regularRank = regular?.report.ranks.external;

  return (
    <article className="student-report" aria-label={`${student.name} 상담 자료`}>
      <PrintHeader
        title="학생 상담 자료"
        info={[
          ["이름", student.name],
          ["수험번호", student.studentNumber],
          ["직렬", student.studyTrack || "—"],
          ["좌석", student.seat || "—"],
          ["과정", student.courseStartDate ? `${student.courseStartDate.slice(0, 10)} ~ ${student.courseEndDate?.slice(0, 10) ?? ""}` : "—"],
          ["조회 기간", `${range.from} ~ ${range.to} (${days(range.from, range.to)}일)`],
          ["작성일", today],
        ]}
      />

      <Section title="한눈에 보기" keep>
        <table className="report-table report-kpi-table">
          <thead><tr><th scope="col">아침 모의고사 평균</th><th scope="col">정기 모의고사 (최근)</th><th scope="col">출결 (교시)</th><th scope="col">평균 등원 시각</th><th scope="col">누적 벌점</th><th scope="col">기간 상벌점</th></tr></thead>
          <tbody>
            <tr className="report-kpi-values">
              <td>{n(morning?.summary.overall.my, "점")}</td>
              <td>{regular ? `${n(regular.report.myScore.total)} / ${n(regular.report.session.fullScore)}점` : "—"}</td>
              <td>{attendance ? `출석 ${count("PRESENT")}` : "—"}</td>
              <td>{arrivals?.average ?? "—"}</td>
              <td className={standing && standing.demeritPoints > 0 ? "report-down" : undefined}>{standing ? `${standing.demeritPoints}점` : "—"}</td>
              <td>{points ? `상점 ${points.merit} · 벌점 ${points.demerit}` : "—"}</td>
            </tr>
            <tr className="report-kpi-notes">
              <td>{morning?.summary.overall.benchmark != null ? `전체 평균 ${n(morning.summary.overall.benchmark, "점")} · ${gapText(morning.summary.overall.gap)}` : "기간 내 성적 없음"}</td>
              <td>{regular ? `${regular.date} · ${regularRank?.rank != null ? `${regularRank.rank}위 / ${regularRank.count}명` : "석차 없음"}` : "응시 기록 없음"}</td>
              <td>{attendance ? `지각 ${count("TARDY")} · 결석 ${count("ABSENT")} · 사유결석 ${count("EXCUSED")}` : "출결 관리 미사용"}</td>
              <td>{arrivals?.days ? `${arrivals.days}일 · 가장 늦은 ${arrivals.latest}` : "등원 기록 없음"}</td>
              <td>{standing ? `경고 단계 ${standing.warningStage}` : "—"}</td>
              <td>{standing ? `남은 휴가 외출 ${standing.leave.holidayRemaining} · 반휴 ${standing.leave.halfDayRemaining} · 병가 ${standing.leave.healthRemaining}` : "—"}</td>
            </tr>
          </tbody>
        </table>
        {morning ? <PrintStatement rows={[{ label: "아침 성적 요약", text: morning.summary.headline.text, tone: morning.summary.headline.tone }]} /> : null}
      </Section>

      <Section title={morning ? `아침 모의고사 · ${morning.examTypeName}` : "아침 모의고사"} note="전체 평균 = 같은 시험을 본 전체 응시자 평균. 차이는 100점 기준.">
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
            {/* 먼저 공부할 것은 아래 학습 진단의 할 일 표가 같은 시험을 원인·방법과 함께 보여 준다. 시험마다 점수·틀린 문항은 학생용 성적표에 있다(운영자 결정 2026-10-07: 두 인쇄물 중복 정리). */}
            <p className="report-note">{morning.failCutoffPercent > 0 ? `빨간 점수는 과락(만점의 ${n(morning.failCutoffPercent, "%")} 미만)입니다. ` : ""}먼저 공부할 것은 아래 학습 진단에, 시험마다 점수와 틀린 문항은 학생용 성적표에 있습니다.</p>
          </>
        ) : <PrintEmpty>조회 기간에 응시한 아침 모의고사가 없습니다.</PrintEmpty>}
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

      {studyTasks?.tasks.length ? (
        <Section title="지난 할 일" note={`${studyTasks.interviewDate.slice(0, 10)} 학습 면담에서 정한 할 일 · 했는지 먼저 확인합니다.`} keep>
          <table className="report-table">
            <thead><tr><th>과목</th><th>할 일</th><th>기한</th><th>확인</th></tr></thead>
            <tbody>
              {studyTasks.tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.subjectName}</td>
                  <td className="wrap">{task.title}{task.method ? <><br /><span className="report-note">방법: {task.method}</span></> : null}</td>
                  <td>{task.dueDate ? md(task.dueDate) : "—"}</td>
                  <td>{task.status === "PLANNED" ? "□ 했음 □ 일부 □ 못 함" : TASK_STATUS_WORDS[task.status] ?? task.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {diagnosis ? (
        <Section title="학습 진단" note="성적으로 만든 초안입니다. 원인은 면담에서 학생 설명을 듣고 정합니다." keep>
          <PrintStatement rows={[
            { label: "진단", text: diagnosis.headline.text, tone: diagnosis.headline.tone },
            ...(diagnosis.strengths.length ? [{ label: "잘한 점", text: diagnosis.strengths.join(" ") }] : []),
          ]} />
          {diagnosis.priorities.length ? (
            <table className="report-table">
              <thead><tr><th>순서</th><th>과목 · 시험</th><th>짐작한 원인</th><th>할 일(방법)</th></tr></thead>
              <tbody>
                {diagnosis.priorities.map((p, i) => (
                  <tr key={p.key}>
                    <td>{i + 1}</td>
                    <td className="wrap">{p.examCategory === "REGULAR" ? "정기 " : ""}{p.subjectName} · {md(p.date)}{p.scope ? ` · ${p.scope}` : ""}{p.itemNos.length ? <><br /><span className="report-note">틀린 문항 {p.itemNos.join(", ")}번</span></> : null}</td>
                    <td className="wrap">{p.reference ? "참고(오답 적음)" : STUDY_CAUSE_WORDS[p.cause].label}<br /><span className="report-note">{p.reason}</span></td>
                    <td className="wrap">{p.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {diagnosis.questions.length ? (
            <>
              <h3 className="report-subhead">면담 때 확인할 것</h3>
              <PrintChecklist items={diagnosis.questions.map((q) => q.text)} />
            </>
          ) : null}
          {diagnosis.cautions.length ? <p className="report-note">{diagnosis.cautions.join(" ")}</p> : null}
        </Section>
      ) : null}

      <Section title="출결" note="교시별 기록 수입니다. 지각·결석은 날짜별로, 사유결석·휴무·반휴는 같은 사유끼리 한 줄로 묶었습니다.">
        {attendance ? (
          <>
            <table className="report-table report-counts">
              <thead><tr>{attendance.counts.map((c) => <th key={c.status} scope="col">{c.label}</th>)}</tr></thead>
              <tbody><tr>{attendance.counts.map((c) => <td key={c.status} className={c.count && ["TARDY", "ABSENT"].includes(c.status) ? "report-down" : undefined}>{c.count}회</td>)}</tr></tbody>
            </table>
            <h3 className="report-subhead">지각 · 결석</h3>
            {attendance.daily.length ? (
              <table className="report-table">
                <thead><tr><th scope="col">날짜</th><th scope="col">상태</th><th scope="col">교시</th><th scope="col">사유</th></tr></thead>
                <tbody>{attendance.daily.map((r) => <tr key={`${r.date}-${r.status}-${r.reason ?? ""}`}><td>{md(r.date)}({weekdayLabel(r.date)})</td><td className="report-down">{r.label}</td><td>{r.periods}</td><td className="wrap">{r.reason || "—"}</td></tr>)}</tbody>
              </table>
            ) : <PrintEmpty>기간 내 지각·결석이 없습니다.</PrintEmpty>}
            {attendance.grouped.length ? (
              <>
                <h3 className="report-subhead">사유결석 · 휴무 · 반휴</h3>
                <table className="report-table">
                  <thead><tr><th scope="col">상태</th><th scope="col">사유</th><th scope="col">교시</th><th scope="col">날짜</th><th scope="col">일수</th><th scope="col">교시 수</th></tr></thead>
                  <tbody>{attendance.grouped.map((r) => <tr key={`${r.status}-${r.reason ?? ""}`}><td>{r.label}</td><td className="wrap">{r.reason || "사유 없음"}</td><td>{r.periods}</td><td className="wrap">{r.dates}</td><td>{r.days}일</td><td>{r.count}회</td></tr>)}</tbody>
                </table>
              </>
            ) : null}
          </>
        ) : <PrintEmpty>출결 기록을 불러올 수 없습니다.</PrintEmpty>}
      </Section>

      <Section title="등원 시각" note={arrivals?.days ? `${arrivals.days}일 · 평균 ${arrivals.average} · 가장 이른 ${arrivals.earliest} · 가장 늦은 ${arrivals.latest}` : undefined} keep>
        {arrivals?.rows.length ? (
          <>
            <ArrivalWeeks rows={arrivals.rows} range={range} />
            <p className="report-note">칸 위 작은 글자는 날짜입니다. 빨간 시각은 그날 지각 기록이 있는 날입니다.</p>
          </>
        ) : <PrintEmpty>조회 기간에 등원 기록이 없습니다.</PrintEmpty>}
      </Section>

      <Section title="상벌점" note={standing ? `누적 벌점 ${standing.demeritPoints}점 · 경고 단계 ${standing.warningStage} · 집계 ${standing.aggregation}` : undefined}>
        {points?.rows.length ? (
          <table className="report-table">
            <thead><tr><th>날짜</th><th>항목</th><th>점수</th><th>메모</th></tr></thead>
            <tbody>{points.rows.map((r, i) => <tr key={`${r.date}-${i}`}><td>{md(r.date)}({weekdayLabel(r.date)})</td><td className="wrap">{r.name}</td><td className={`num ${r.points < 0 ? "report-down" : "report-up"}`}>{r.points > 0 ? `+${r.points}` : r.points}점</td><td className="wrap">{r.notes || "—"}</td></tr>)}</tbody>
          </table>
        ) : <PrintEmpty>조회 기간에 상벌점 기록이 없습니다.</PrintEmpty>}
      </Section>

      {interviews.length ? (
        <Section title="최근 면담" keep>
          <table className="report-table">
            <thead><tr><th>날짜</th><th>사유</th><th>결과</th><th>후속 확인일</th></tr></thead>
            <tbody>{interviews.map((r) => <tr key={r.id}><td>{r.date.slice(0, 10)}</td><td className="wrap">{r.reason}</td><td>{r.category === "STUDY" ? "학습 면담" : getInterviewResultTypeLabel(r.resultType)}</td><td>{r.followUpDate?.slice(0, 10) ?? "—"}</td></tr>)}</tbody>
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
        <PrintSigns staff="상담자" />
      </Section>
    </article>
  );
}

const WEEKDAY_COLUMNS = ["월", "화", "수", "목", "금", "토", "일"];

/** 등원 시각 주 단위 표. 기록이 한 번도 없는 요일 열은 뺀다(예: 일요일 휴무 학원). */
function ArrivalWeeks({ rows, range }: { rows: Array<{ date: string; time: string; tardy: boolean }>; range: { from: string; to: string } }) {
  const weeks = arrivalWeeks(rows, range);
  const columns = WEEKDAY_COLUMNS.map((label, index) => ({ label, index })).filter(({ index }) => weeks.some((week) => week.days[index].time !== null));
  return (
    <table className="report-table report-arrival-weeks">
      <thead><tr><th scope="col">주</th>{columns.map((c) => <th key={c.label} scope="col">{c.label}</th>)}</tr></thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week.monday}>
            <th scope="row">{md(week.monday)} 주</th>
            {columns.map(({ index }) => {
              const day = week.days[index];
              if (!day.inRange) return <td key={day.date} className="report-out" />;
              return <td key={day.date} className={day.tardy ? "report-down" : undefined}>{day.time ? <><span className="report-day">{md(day.date)}</span>{day.time}</> : "—"}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
