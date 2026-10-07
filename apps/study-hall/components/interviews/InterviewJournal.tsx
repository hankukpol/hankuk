"use client";

import { CheckCircle2, ExternalLink, FileText, LoaderCircle, Plus, Printer } from "lucide-react";

import { WarningStageBadge } from "@/components/students/StudentBadges";
import {
  getInterviewResultTypeClasses,
  getInterviewResultTypeLabel,
  getInterviewStatusClasses,
  getInterviewStatusLabel,
  isFollowUpDue,
} from "@/lib/interview-meta";
import {
  journalDayLabel,
  latestPromiseInterview,
  parseInterviewContent,
  parsePromises,
  type JournalSection,
  type StudentJournalSummary,
} from "@/lib/interview-journal";
import { formatKstDateTime } from "@/lib/date-utils";
import { toDemeritPoints } from "@/lib/student-meta";
import type { InterviewItem } from "@/lib/services/interview.service";
import type { StudentListItem } from "@/lib/services/student.service";

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

export function PromiseList({ promises }: { promises: string[] }) {
  return (
    <ol className="interview-promise-list">
      {promises.map((promise, index) => <li key={index}>{promise}</li>)}
    </ol>
  );
}

function followUpText(interview: InterviewItem, today: string) {
  if (!interview.followUpDate) return interview.status === "OPEN" ? "후속 확인일 없음" : null;
  const due = isFollowUpDue(interview, today);
  return `후속 확인 ${journalDayLabel(interview.followUpDate)}${due ? " · 지남" : ""}`;
}

type JournalProps = {
  divisionSlug: string;
  student: StudentListItem;
  interviews: InterviewItem[];
  today: string;
  closingId: string | null;
  onCloseInterview: (interview: InterviewItem) => void;
  onCreate: (studentId: string) => void;
};

/** 한 학생의 면담 일지. 머리(학생·요약·작업) → 지켜야 할 약속 → 면담 기록(최신순). */
export function InterviewJournal({ divisionSlug, student, interviews, today, closingId, onCloseInterview, onCreate }: JournalProps) {
  const promiseInterview = latestPromiseInterview(interviews);
  const promises = parsePromises(promiseInterview?.result);
  const demerit = student.demeritPoints ?? toDemeritPoints(student.netPoints);
  const base = `/${divisionSlug}/admin/students/${encodeURIComponent(student.id)}`;

  const closeButton = (interview: InterviewItem) => (
    <button type="button" onClick={() => onCloseInterview(interview)} disabled={closingId === interview.id} className="admin-button admin-button-compact">
      {closingId === interview.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      확인 완료
    </button>
  );

  return (
    <div className="space-y-4">
      <section className="admin-panel" aria-label={`${student.name} 면담 일지`}>
        <div className="admin-panel-header flex-wrap">
          <div className="min-w-0">
            <h2 className="admin-section-title">
              {student.name}
              <span className="admin-help ml-2 tabular-nums">{student.studentNumber}</span>
            </h2>
            <p className="admin-help mt-1 tabular-nums">
              면담 {interviews.length}회{interviews[0] ? ` · 마지막 ${journalDayLabel(interviews[0].date)}` : ""} · 벌점 {demerit}점
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WarningStageBadge stage={student.warningStage} label={student.warningStageLabel} />
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
            <button type="button" className="admin-button admin-button-primary admin-button-compact" onClick={() => onCreate(student.id)}>
              <Plus className="h-4 w-4" />면담 기록
            </button>
          </div>
        </div>

        {promiseInterview ? (
          <div className="admin-panel-row items-start max-md:flex-col">
            <div className="w-28 shrink-0">
              <p className="admin-label">지켜야 할 약속</p>
              <p className="admin-help mt-1 tabular-nums">{journalDayLabel(promiseInterview.date)} 면담</p>
            </div>
            <div className="min-w-0 flex-1">
              <PromiseList promises={promises} />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className={`admin-badge ${getInterviewStatusClasses(promiseInterview.status)}`}>{getInterviewStatusLabel(promiseInterview.status)}</span>
                {followUpText(promiseInterview, today) ? (
                  <span className={`text-sm tabular-nums ${isFollowUpDue(promiseInterview, today) ? "font-semibold text-admin-danger" : "admin-help"}`}>{followUpText(promiseInterview, today)}</span>
                ) : null}
                {promiseInterview.status === "OPEN" ? closeButton(promiseInterview) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="admin-panel-row">
            <span className="admin-label w-28 shrink-0">지켜야 할 약속</span>
            <span className="admin-help">{interviews.length ? "적어 둔 약속이 없습니다. 면담 기록의 ‘약속 · 후속 조치’에 한 줄에 하나씩 적으면 여기 모입니다." : "아직 면담 기록이 없습니다."}</span>
          </div>
        )}
      </section>

      {interviews.length ? (
        <div className="space-y-4">
          <h3 className="admin-section-title">면담 기록 <span className="text-admin-accent tabular-nums">{interviews.length}회</span><span className="admin-help ml-2">최신순</span></h3>
          {interviews.map((interview) => (
            <JournalEntry
              key={interview.id}
              interview={interview}
              today={today}
              action={interview.status === "OPEN" && interview.id !== promiseInterview?.id ? closeButton(interview) : null}
            />
          ))}
        </div>
      ) : (
        <div className="admin-empty-state">
          <p className="font-semibold">{student.name} 학생의 면담 기록이 없습니다.</p>
          <p className="admin-help mt-2">오른쪽 위 ‘면담 기록’으로 첫 면담을 남깁니다.</p>
        </div>
      )}
    </div>
  );
}

/** 면담 한 회. 소제목마다 한 행(왼쪽 소제목, 오른쪽 내용), 약속은 번호 목록. */
export function JournalEntry({ interview, today, action }: { interview: InterviewItem; today: string; action?: React.ReactNode }) {
  const sections = parseInterviewContent(interview.content);
  const promises = parsePromises(interview.result);
  const follow = followUpText(interview, today);

  return (
    <article className="admin-panel" aria-label={`${journalDayLabel(interview.date)} 면담`}>
      <div className="admin-panel-header flex-wrap items-start">
        <div className="min-w-0 flex-1">
          <p className="admin-label tabular-nums">{journalDayLabel(interview.date)}</p>
          <h4 className="mt-1 break-keep text-[15px] font-semibold text-admin-text">{interview.reason}</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {interview.resultType !== "INTERVIEW" ? (
            <span className={`admin-badge ${getInterviewResultTypeClasses(interview.resultType)}`}>{getInterviewResultTypeLabel(interview.resultType)}</span>
          ) : null}
          <span className={`admin-badge ${getInterviewStatusClasses(interview.status)}`}>{getInterviewStatusLabel(interview.status)}</span>
          {interview.guardianContacted ? <span className="admin-badge border-sky-200 bg-sky-50 text-sky-700">보호자 연락</span> : null}
        </div>
      </div>

      {sections.length ? sections.map((section, index) => (
        <div key={index} className="admin-panel-row items-start max-md:flex-col max-md:gap-1">
          <span className="admin-label w-28 shrink-0 pt-1">{section.title ?? "내용"}</span>
          <JournalLines lines={section.lines} />
        </div>
      )) : (
        <div className="admin-panel-row">
          <span className="admin-label w-28 shrink-0">내용</span>
          <span className="admin-help">기록 없음</span>
        </div>
      )}

      <div className="admin-panel-row items-start max-md:flex-col max-md:gap-1">
        <span className="admin-label w-28 shrink-0 pt-1">약속 · 후속</span>
        {promises.length ? <div className="min-w-0 flex-1"><PromiseList promises={promises} /></div> : <span className="admin-help">기록 없음</span>}
      </div>

      <div className="admin-panel-row flex-wrap justify-between">
        <p className="admin-help">
          {[follow, interview.trigger || "수동 등록", `${interview.createdByName} · ${formatKstDateTime(interview.createdAt)}`].filter(Boolean).join(" · ")}
        </p>
        {action}
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

/** 왼쪽 학생 목록. 이름·수험번호, 면담 횟수·마지막 날짜, 확인일 지남·면담 권장 표시. */
export function JournalStudentList({ students, summaries, selectedId, warnInterview, onSelect }: StudentListProps) {
  return (
    <ul className="interview-student-list" aria-label="학생 목록">
      {students.map((student) => {
        const summary = summaries.get(student.id);
        const demerit = student.demeritPoints ?? toDemeritPoints(student.netPoints);
        return (
          <li key={student.id}>
            <button type="button" className="interview-student-item" data-journal-student={student.id} aria-pressed={student.id === selectedId} onClick={() => onSelect(student.id)}>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate font-semibold">{student.name}</span>
                <span className="admin-help shrink-0 tabular-nums">{student.studentNumber}</span>
              </span>
              <span className="admin-help shrink-0 tabular-nums">
                {summary ? `${summary.count}회 · ${journalDayLabel(summary.lastDate ?? "")}` : "면담 없음"}
              </span>
              {summary?.overdue || demerit >= warnInterview ? (
                <span className="col-span-2 flex flex-wrap gap-1">
                  {summary?.overdue ? <span className="admin-badge border-admin-danger-line bg-admin-danger-soft text-admin-danger">확인일 지남</span> : null}
                  {demerit >= warnInterview ? <span className="admin-badge border-warn-interview-line bg-warn-interview-soft text-warn-interview">면담 권장 · 벌점 {demerit}</span> : null}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
