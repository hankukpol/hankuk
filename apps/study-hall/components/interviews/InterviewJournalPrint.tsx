import { Fragment } from "react";

import { getInterviewResultTypeLabel, getInterviewStatusLabel } from "@/lib/interview-meta";
import {
  journalDayLabel,
  latestPromiseInterview,
  parseInterviewContent,
  journalPromises,
  sortJournal,
  type JournalSection,
} from "@/lib/interview-journal";
import { toDemeritPoints } from "@/lib/student-meta";
import type { InterviewItem } from "@/lib/services/interview.service";
import type { StudentDetail } from "@/lib/services/student.service";

function Lines({ lines }: { lines: JournalSection["lines"] }) {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index ? <br /> : null}
          {line.bullet ? `· ${line.text}` : line.text}
        </Fragment>
      ))}
    </>
  );
}

/**
 * 학생 면담 일지(A4). 지켜야 할 약속(펜으로 확인 칸) → 면담 기록(최신순) → 다음 면담 메모 빈칸.
 * 쪽 나눔 규칙은 globals.css 의 .student-report 인쇄 규칙을 그대로 쓴다(표는 행 단위로만 넘어간다).
 */
export function InterviewJournalPrint({ student, interviews, today }: { student: StudentDetail; interviews: InterviewItem[]; today: string }) {
  const sorted = sortJournal(interviews);
  const promiseInterview = latestPromiseInterview(sorted);
  const promises = promiseInterview ? journalPromises(promiseInterview) : [];
  const first = sorted[sorted.length - 1];
  const demerit = student.demeritPoints ?? toDemeritPoints(student.netPoints);

  return (
    <article className="student-report interview-journal-print" aria-label={`${student.name} 면담 일지`}>
      <header className="report-header">
        <div>
          <p className="report-eyebrow">학생 면담 일지</p>
          <h1>{student.name}<span>{student.studentNumber}</span></h1>
          <p className="report-meta">
            {[student.studyTrack, `누적 벌점 ${demerit}점`, student.warningStageLabel ? `경고 ${student.warningStageLabel}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <dl className="report-header-side">
          <div><dt>면담</dt><dd>{sorted.length}회{first ? ` (${first.date.slice(0, 10)} ~ ${sorted[0].date.slice(0, 10)})` : ""}</dd></div>
          <div><dt>작성일</dt><dd>{today}</dd></div>
        </dl>
      </header>

      <section className="report-section report-keep">
        <div className="report-section-head">
          <h2>지켜야 할 약속</h2>
          <p>{promiseInterview ? `${journalDayLabel(promiseInterview.date)} 면담 · ${getInterviewStatusLabel(promiseInterview.status)}${promiseInterview.followUpDate ? ` · 후속 확인 ${journalDayLabel(promiseInterview.followUpDate)}` : ""}` : "적어 둔 약속 없음"}</p>
        </div>
        {promises.length ? (
          <table className="report-table">
            <thead><tr><th style={{ width: "8%" }}>번호</th><th>약속</th><th style={{ width: "14%" }}>지켰나요</th></tr></thead>
            <tbody>
              {promises.map((promise, index) => (
                <tr key={index}><td>{index + 1}</td><td className="wrap">{promise}</td><td>□ 예 □ 아니오</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="report-empty">면담 기록의 ‘약속 · 후속 조치’에 한 줄에 하나씩 적으면 여기 모입니다.</p>
        )}
      </section>

      {sorted.map((interview) => {
        const sections = parseInterviewContent(interview.content);
        const items = journalPromises(interview);
        return (
          <section key={interview.id} className="report-section">
            <div className="report-section-head">
              <h2>{journalDayLabel(interview.date)} · {interview.reason}</h2>
              <p>
                {[
                  interview.resultType !== "INTERVIEW" ? getInterviewResultTypeLabel(interview.resultType) : null,
                  getInterviewStatusLabel(interview.status),
                  interview.followUpDate ? `후속 확인 ${journalDayLabel(interview.followUpDate)}` : null,
                  interview.guardianContacted ? "보호자 연락" : null,
                  `기록 ${interview.createdByName}`,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <table className="report-table report-journal">
              <tbody>
                {sections.length ? sections.map((section, index) => (
                  <tr key={index}><th scope="row">{section.title ?? "내용"}</th><td className="wrap"><Lines lines={section.lines} /></td></tr>
                )) : <tr><th scope="row">내용</th><td className="wrap">기록 없음</td></tr>}
                <tr>
                  <th scope="row">약속 · 후속</th>
                  <td className="wrap">{items.length ? items.map((item, index) => <Fragment key={index}>{index ? <br /> : null}{index + 1}. {item}</Fragment>) : "기록 없음"}</td>
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}

      <section className="report-section report-keep">
        <div className="report-section-head"><h2>다음 면담 메모</h2></div>
        <table className="report-table report-write">
          <tbody>
            <tr><th scope="row">지난 약속 확인</th><td className="report-write-mid" /></tr>
            <tr><th scope="row">상담 내용</th><td className="report-write-tall" /></tr>
            <tr><th scope="row">새 약속</th><td className="report-write-mid" /></tr>
            <tr><th scope="row">다음 점검일</th><td /></tr>
          </tbody>
        </table>
        <div className="report-signs"><span>학생 확인</span><span>면담자</span></div>
      </section>
    </article>
  );
}
