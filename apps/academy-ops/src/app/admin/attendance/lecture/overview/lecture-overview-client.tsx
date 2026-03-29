"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────

type SessionStats = {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  recorded: number;
};

type TodaySession = {
  id: string;
  scheduleId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  isCancelled: boolean;
  note: string | null;
  schedule: {
    id: string;
    cohortId: string;
    subjectName: string;
    instructorName: string | null;
    dayOfWeek: number;
    cohort: { id: string; name: string; examCategory: string };
  };
  stats: SessionStats;
  inputStatus: "complete" | "partial" | "none";
};

type UpcomingSession = {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  subjectName: string;
  instructorName: string | null;
  cohortName: string;
  examCategory: string;
};

type Props = {
  todaySessions: TodaySession[];
  upcomingSessions: UpcomingSession[];
  todayStr: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소방",
  CUSTOM: "기타",
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type FilterStatus = "all" | "complete" | "partial" | "none";

// ─── Session card ───────────────────────────────────────────────────────────

function SessionCard({ session }: { session: TodaySession }) {
  const { inputStatus, stats, isCancelled } = session;

  // Color scheme based on status
  let cardBorder = "border-ink/10";
  let statusLabel = "";
  let statusClass = "";
  let dotClass = "";

  if (isCancelled) {
    cardBorder = "border-red-200 opacity-60";
    statusLabel = "취소됨";
    statusClass = "border-red-200 bg-red-50 text-red-600";
    dotClass = "bg-red-500";
  } else if (inputStatus === "complete") {
    cardBorder = "border-forest/25";
    statusLabel = "완료";
    statusClass = "border-forest/25 bg-forest/10 text-forest";
    dotClass = "bg-forest";
  } else if (inputStatus === "partial") {
    cardBorder = "border-amber-200";
    statusLabel = "부분입력";
    statusClass = "border-amber-200 bg-amber-50 text-amber-700";
    dotClass = "bg-amber-500";
  } else {
    cardBorder = "border-red-200";
    statusLabel = "미입력";
    statusClass = "border-red-200 bg-red-50 text-red-700";
    dotClass = "bg-red-500";
  }

  return (
    <div className={`rounded-[28px] border bg-white p-6 shadow-sm transition-shadow hover:shadow-md ${cardBorder}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: session info */}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-lg font-semibold text-ink">
              {session.schedule.subjectName}
            </span>
            <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-medium text-slate">
              {session.startTime} ~ {session.endTime}
            </span>
            <span className="rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
              {session.schedule.cohort.name}
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
              {EXAM_CATEGORY_LABEL[session.schedule.cohort.examCategory] ?? session.schedule.cohort.examCategory}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
              {statusLabel}
            </span>
          </div>

          {session.schedule.instructorName && (
            <p className="mt-1.5 text-sm text-slate">
              강사: {session.schedule.instructorName}
            </p>
          )}

          {/* Attendance stats (only if recorded) */}
          {stats.total > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-forest" />
                <span className="font-semibold text-forest">{stats.present}</span>
                <span className="text-slate">출석</span>
              </span>
              {stats.late > 0 && (
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="font-semibold text-amber-700">{stats.late}</span>
                  <span className="text-slate">지각</span>
                </span>
              )}
              {stats.absent > 0 && (
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="font-semibold text-red-600">{stats.absent}</span>
                  <span className="text-slate">결석</span>
                </span>
              )}
              {stats.excused > 0 && (
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                  <span className="font-semibold text-sky-700">{stats.excused}</span>
                  <span className="text-slate">공결</span>
                </span>
              )}
              <span className="text-sm text-slate">/ 총 {stats.total}명</span>
            </div>
          ) : (
            !isCancelled && (
              <p className="mt-3 text-sm font-medium text-red-600">출결 미처리 — 입력이 필요합니다</p>
            )
          )}

          {session.note && (
            <p className="mt-2 text-xs text-slate/70">메모: {session.note}</p>
          )}
        </div>

        {/* Right: action buttons */}
        {!isCancelled && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/admin/attendance/lecture/${session.id}/bulk`}
              className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white hover:bg-ember/90 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              출결 입력
            </Link>
            <Link
              href={`/admin/attendance/lecture/${session.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium text-slate hover:bg-mist transition-colors"
            >
              상세
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Upcoming session row ──────────────────────────────────────────────────

function UpcomingRow({ session }: { session: UpcomingSession }) {
  const dt = new Date(session.sessionDate);
  const month = dt.getMonth() + 1;
  const day = dt.getDate();
  const dow = DAY_LABELS[dt.getDay()];
  const label = `${month}/${day}(${dow})`;

  return (
    <div className="flex items-center gap-4 border-b border-ink/5 px-6 py-3 last:border-b-0">
      <span className="w-20 shrink-0 text-sm font-semibold text-slate">{label}</span>
      <span className="flex-1 text-sm font-medium text-ink">{session.subjectName}</span>
      <span className="text-xs text-slate">{session.startTime} ~ {session.endTime}</span>
      {session.instructorName && (
        <span className="hidden text-xs text-slate sm:inline">{session.instructorName}</span>
      )}
      <span className="hidden rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest sm:inline">
        {session.cohortName}
      </span>
    </div>
  );
}

// ─── Main client component ─────────────────────────────────────────────────

export function LectureOverviewClient({
  todaySessions,
  upcomingSessions,
  todayStr,
}: Props) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterCohort, setFilterCohort] = useState<string>("all");

  // Derive unique subjects and cohorts from today's sessions
  const subjects = [...new Set(todaySessions.map((s) => s.schedule.subjectName))].sort();
  const cohorts = [
    ...new Map(
      todaySessions.map((s) => [
        s.schedule.cohort.id,
        { id: s.schedule.cohort.id, name: s.schedule.cohort.name },
      ])
    ).values(),
  ];

  // Filter
  const filtered = todaySessions.filter((s) => {
    if (filterStatus !== "all") {
      if (s.isCancelled && filterStatus !== "none") return false;
      if (!s.isCancelled && s.inputStatus !== filterStatus) return false;
    }
    if (filterSubject !== "all" && s.schedule.subjectName !== filterSubject) return false;
    if (filterCohort !== "all" && s.schedule.cohort.id !== filterCohort) return false;
    return true;
  });

  const activeSessions = todaySessions.filter((s) => !s.isCancelled);
  const cancelledCount = todaySessions.filter((s) => s.isCancelled).length;

  return (
    <div>
      {/* No sessions at all */}
      {todaySessions.length === 0 && (
        <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-mist">
            <svg className="h-7 w-7 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-base font-medium text-ink">오늘({todayStr}) 예정된 강의 세션이 없습니다.</p>
          <p className="mt-2 text-sm text-slate">강의 스케줄을 설정하고 세션을 생성하세요.</p>
          <Link
            href="/admin/settings/lecture-schedules"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember/90 transition-colors"
          >
            스케줄 설정으로 이동
          </Link>
        </div>
      )}

      {todaySessions.length > 0 && (
        <>
          {/* Filter bar */}
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[28px] border border-ink/10 bg-mist/40 p-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate">상태</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30"
              >
                <option value="all">전체 ({activeSessions.length})</option>
                <option value="complete">
                  완료 ({activeSessions.filter((s) => s.inputStatus === "complete").length})
                </option>
                <option value="partial">
                  부분입력 ({activeSessions.filter((s) => s.inputStatus === "partial").length})
                </option>
                <option value="none">
                  미입력 ({activeSessions.filter((s) => s.inputStatus === "none").length})
                </option>
              </select>
            </div>

            {subjects.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate">과목</label>
                <select
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30"
                >
                  <option value="all">전체</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {cohorts.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate">기수</label>
                <select
                  value={filterCohort}
                  onChange={(e) => setFilterCohort(e.target.value)}
                  className="rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30"
                >
                  <option value="all">전체</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="ml-auto text-xs text-slate">{filtered.length}건 표시</div>
          </div>

          {/* Cancelled notice */}
          {cancelledCount > 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-red-500">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-800">
                오늘 취소된 강의가 {cancelledCount}건 있습니다.{" "}
                <Link href="/admin/attendance/makeups" className="font-semibold underline hover:no-underline">
                  보강 일정 설정
                </Link>
              </p>
            </div>
          )}

          {/* Session cards */}
          {filtered.length === 0 ? (
            <div className="rounded-[28px] border border-ink/10 bg-white p-10 text-center">
              <p className="text-sm font-medium text-slate">해당 조건에 맞는 강의 세션이 없습니다.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filtered.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Upcoming sessions (next 7 days) */}
      {upcomingSessions.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold text-ink">향후 7일 강의 일정</h2>
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <div className="border-b border-ink/5 bg-mist/40 px-6 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                다가오는 강의 ({upcomingSessions.length}개)
              </p>
            </div>
            <div>
              {upcomingSessions.map((s) => (
                <UpcomingRow key={s.id} session={s} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer navigation */}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/admin/attendance"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 출결 관리 허브
        </Link>
        <Link
          href={`/admin/attendance/lecture?date=${todayStr}`}
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-5 py-2.5 text-sm font-medium text-forest transition hover:bg-forest/10"
        >
          날짜별 출결 입력
        </Link>
        <Link
          href="/admin/attendance/makeups"
          className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
        >
          보강 일정 관리
        </Link>
        <Link
          href="/admin/attendance/lecture/reports"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          강의 출결 리포트
        </Link>
      </div>
    </div>
  );
}
