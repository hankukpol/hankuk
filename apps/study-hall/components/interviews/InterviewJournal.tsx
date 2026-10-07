"use client";

import { CheckCircle2, ExternalLink, FileText, LoaderCircle, MessageSquareText, Plus, Printer } from "lucide-react";

import { getInterviewResultTypeLabel, getInterviewStatusLabel, isFollowUpDue } from "@/lib/interview-meta";
import {
  journalDayLabel,
  latestPromiseInterview,
  parseInterviewContent,
  journalPromises,
  type JournalSection,
  type StudentJournalSummary,
} from "@/lib/interview-journal";
import { formatKstDateTime } from "@/lib/date-utils";
import { getWarningStageLabel, toDemeritPoints } from "@/lib/student-meta";
import type { InterviewItem } from "@/lib/services/interview.service";
import type { StudentListItem } from "@/lib/services/student.service";

/*
 * 면담 일지 화면 (DESIGN.md 0절 11항).
 * 업무 화면처럼 읽히도록 상자·알약 배지를 겹치지 않는다. 묶음은 패널 하나, 안쪽은 1px 구분선,
 * 상태는 배경 없는 글자색으로만 알린다(예약 관리 화면의 "확정/취소" 표기와 같은 방식).
 */

/** 상태 글자. 후속 확인 전은 주황, 기한이 지났으면 빨강, 확인 완료는 회색. */
export function StatusText({ interview, today }: { interview: InterviewItem; today: string }) {
  const due = isFollowUpDue(interview, today);
  const tone = interview.status === "CLOSED" ? "text-admin-text-muted" : due ? "text-admin-danger" : "text-admin-warning";
  return <span className={`text-[13px] font-semibold ${tone}`}>{due ? "확인일 지남" : getInterviewStatusLabel(interview.status)}</span>;
}

/** 소제목 묶음의 줄. 점 표시가 있던 줄은 목록, 없던 줄은 문단으로 그린다. */
export function JournalLines({ lines }: { lines: JournalSection["lines"] }) {
  const groups: { bullet: boolean; texts: string[] }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.bullet === line.bullet) last.texts.push(line.text);
    else groups.push({ bullet: line.bullet, texts: [line.text] });
  }
  return (
    <div className="min-w-0 flex-1 space-y-1 break-keep">
      {groups.map((group, index) =>
        group.bullet ? (
          <ul key={index} className="interview-journal-list">
            {group.texts.map((text, i) => <li key={i}>{text}</li>)}
          </ul>
        ) : (
          group.texts.map((text, i) => <p key={`${index}-${i}`}>{text}</p>)
        ),
      )}
    </div>
  );
}

/** 약속 목록. 번호는 회색 숫자 열, 약속끼리는 얇은 선으로 나눈다. */
export function PromiseList({ promises }: { promises: string[] }) {
  return (
    <ol className="interview-promise-list">
      {promises.map((promise, index) => (
        <li key={index}>
          <span className="interview-promise-no">{index + 1}</span>
          <span className="min-w-0 break-keep">{promise}</span>
        </li>
      ))}
    </ol>
  );
}

type JournalProps = {
  divisionSlug: string;
  student: StudentListItem;
  interviews: InterviewItem[];
  today: string;
  closingId: string | null;
  onCloseInterview: (interview: InterviewItem) => void;
  onCreate: (studentId: string) => void;
  /** 있으면 머리에 '학습 면담' 버튼을 둔다(시험 관리를 쓰는 학원). */
  onCreateStudy?: (studentId: string) => void;
};

/** 한 학생의 면담 일지. 학생 머리 → 지켜야 할 약속 → 면담 기록(최신순)을 패널 하나에 담는다. */
export function InterviewJournal({ divisionSlug, student, interviews, today, closingId, onCloseInterview, onCreate, onCreateStudy }: JournalProps) {
  const promiseInterview = latestPromiseInterview(interviews);
  const promises = promiseInterview ? journalPromises(promiseInterview) : [];
  const demerit = student.demeritPoints ?? toDemeritPoints(student.netPoints);
  const base = `/${divisionSlug}/admin/students/${encodeURIComponent(student.id)}`;

  const closeButton = (interview: InterviewItem) => (
    <button type="button" onClick={() => onCloseInterview(interview)} disabled={closingId === interview.id} className="admin-button admin-button-compact">
      {closingId === interview.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      확인 완료
    </button>
  );

  return (
    <section className="admin-panel interview-journal" aria-label={`${student.name} 면담 일지`}>
      <header className="interview-journal-head">
        <div className="min-w-0">
          <h2 className="interview-journal-name">{student.name}</h2>
          <p className="interview-meta-line">
            <span className="tabular-nums">{student.studentNumber}</span>
            <span className="tabular-nums">면담 {interviews.length}회</span>
            <span className="tabular-nums">최근 {interviews[0] ? journalDayLabel(interviews[0].date) : "없음"}</span>
            <span className={`tabular-nums ${demerit > 0 ? "text-admin-danger" : ""}`}>벌점 {demerit}점</span>
            <span>경고 {student.warningStageLabel ?? getWarningStageLabel(student.warningStage)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a className="admin-button admin-button-compact" href={`${base}/report`} target="_blank" rel="noopener">
            <FileText className="h-4 w-4" aria-hidden="true" />상담 자료
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">(새 탭)</span>
          </a>
          {interviews.length ? (
            <a className="admin-button admin-button-compact" href={`${base}/interviews`} target="_blank" rel="noopener">
              <Printer className="h-4 w-4" aria-hidden="true" />일지 인쇄
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">(새 탭)</span>
            </a>
          ) : null}
          {onCreateStudy ? (
            <button type="button" className="admin-button admin-button-compact" onClick={() => onCreateStudy(student.id)}>
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />학습 면담
            </button>
          ) : null}
          <button type="button" className="admin-button admin-button-primary admin-button-compact" onClick={() => onCreate(student.id)}>
            <Plus className="h-4 w-4" />면담 기록
          </button>
        </div>
      </header>

      <div className="interview-journal-block">
        <div className="interview-block-head">
          <h3>지켜야 할 약속</h3>
          {promiseInterview ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="interview-meta-line">
                <span className="tabular-nums">{journalDayLabel(promiseInterview.date)} 면담</span>
                {promiseInterview.followUpDate ? <span className="tabular-nums">후속 확인 {journalDayLabel(promiseInterview.followUpDate)}</span> : null}
              </p>
              <StatusText interview={promiseInterview} today={today} />
              {promiseInterview.status === "OPEN" ? closeButton(promiseInterview) : null}
            </div>
          ) : null}
        </div>
        {promiseInterview ? (
          <PromiseList promises={promises} />
        ) : (
          <p className="admin-help">{interviews.length ? "적어 둔 약속이 없습니다. 면담 기록의 ‘약속 · 후속 조치’에 한 줄에 하나씩 적으면 여기 모입니다." : "아직 면담 기록이 없습니다."}</p>
        )}
      </div>

      <div className="interview-journal-block interview-journal-block-flush">
        <div className="interview-block-head">
          <h3>면담 기록 <span className="tabular-nums text-admin-text-muted">{interviews.length}</span></h3>
          <span className="admin-help">최신순</span>
        </div>
        {interviews.length ? (
          <ol className="interview-entry-list">
            {interviews.map((interview) => (
              <li key={interview.id}>
                <JournalEntry
                  interview={interview}
                  today={today}
                  action={interview.status === "OPEN" && interview.id !== promiseInterview?.id ? closeButton(interview) : null}
                />
              </li>
            ))}
          </ol>
        ) : (
          <div className="admin-empty-state mx-5 mb-5">
            <p className="font-semibold">{student.name} 학생의 면담 기록이 없습니다.</p>
            <p className="admin-help mt-2">오른쪽 위 ‘면담 기록’으로 첫 면담을 남깁니다.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * 면담 한 회. 왼쪽 날짜 열(날짜·상태), 오른쪽 본문(사유 → 소제목 행 → 약속 → 기록자).
 * 회차마다 상자를 두르지 않고 목록의 구분선으로 나눈다.
 */
export function JournalEntry({ interview, today, action }: { interview: InterviewItem; today: string; action?: React.ReactNode }) {
  const sections = parseInterviewContent(interview.content);
  const promises = journalPromises(interview);

  return (
    <article className="interview-entry" aria-label={`${journalDayLabel(interview.date)} 면담`}>
      <div className="interview-entry-date">
        <p className="interview-entry-day">{journalDayLabel(interview.date)}</p>
        <StatusText interview={interview} today={today} />
        {interview.followUpDate ? <p className="admin-help tabular-nums">확인일 {journalDayLabel(interview.followUpDate)}</p> : null}
      </div>
      <div className="min-w-0">
        <h4 className="interview-entry-title">{interview.reason}</h4>
        {interview.resultType !== "INTERVIEW" || interview.guardianContacted || interview.category === "STUDY" ? (
          <p className="interview-meta-line mt-1">
            {interview.category === "STUDY" ? <span className="font-semibold text-admin-accent">학습 면담</span> : null}
            {interview.resultType !== "INTERVIEW" ? <span className="font-semibold text-admin-danger">{getInterviewResultTypeLabel(interview.resultType)}</span> : null}
            {interview.guardianContacted ? <span>보호자 연락함</span> : null}
          </p>
        ) : null}
        {interview.diagnosis ? <p className="admin-help mt-1 break-keep">진단: {interview.diagnosis.headline.text}</p> : null}

        <dl className="interview-entry-rows">
          {sections.length ? sections.map((section, index) => (
            <div key={index}>
              <dt>{section.title ?? "내용"}</dt>
              <dd><JournalLines lines={section.lines} /></dd>
            </div>
          )) : (
            <div><dt>내용</dt><dd className="text-admin-text-muted">기록 없음</dd></div>
          )}
          <div>
            <dt>약속 · 후속</dt>
            <dd>{promises.length ? <PromiseList promises={promises} /> : <span className="text-admin-text-muted">기록 없음</span>}</dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="interview-meta-line">
            <span>{interview.trigger || "수동 등록"}</span>
            <span>{interview.createdByName}</span>
            <span className="tabular-nums">{formatKstDateTime(interview.createdAt)}</span>
          </p>
          {action}
        </div>
      </div>
    </article>
  );
}

type StudentListProps = {
  students: StudentListItem[];
  summaries: Map<string, StudentJournalSummary>;
  selectedId: string;
  warnInterview: number;
  onSelect: (studentId: string) => void;
};

/** 왼쪽 학생 목록. 표처럼 학생 · 면담 수 · 최근 날짜 세 열, 알릴 것은 이름 아래 색 글자 한 줄. */
export function JournalStudentList({ students, summaries, selectedId, warnInterview, onSelect }: StudentListProps) {
  return (
    <div className="interview-student-table">
      <div className="interview-student-row interview-student-header" aria-hidden="true">
        <span>학생</span>
        <span>면담</span>
        <span>최근</span>
      </div>
      <ul className="interview-student-list" aria-label="학생 목록">
        {students.map((student) => {
          const summary = summaries.get(student.id);
          const demerit = student.demeritPoints ?? toDemeritPoints(student.netPoints);
          const notes = [
            summary?.overdue ? <span key="due" className="text-admin-danger">확인일 지남</span> : null,
            demerit >= warnInterview ? <span key="warn" className="text-admin-warning">벌점 {demerit}점</span> : null,
          ].filter(Boolean);
          return (
            <li key={student.id}>
              <button type="button" className="interview-student-row interview-student-item" data-journal-student={student.id} aria-pressed={student.id === selectedId} onClick={() => onSelect(student.id)}>
                <span className="min-w-0">
                  <span className="block truncate">
                    <span className="interview-student-name">{student.name}</span>
                    <span className="ml-2 text-[13px] tabular-nums text-admin-text-muted">{student.studentNumber}</span>
                  </span>
                  {notes.length ? <span className="interview-meta-line mt-1 text-[13px] font-semibold">{notes}</span> : null}
                </span>
                <span className="tabular-nums">{summary ? summary.count : "–"}</span>
                <span className="tabular-nums text-admin-text-secondary">{summary?.lastDate ? journalDayLabel(summary.lastDate) : "–"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
