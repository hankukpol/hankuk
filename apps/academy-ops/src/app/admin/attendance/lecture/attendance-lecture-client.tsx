"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Cohort = { id: string; name: string; examCategory: string };
type Schedule = {
  id: string;
  cohortId: string;
  subjectName: string;
  instructorName: string | null;
  dayOfWeek: number;
  cohort: Cohort;
};
type SessionStats = {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
};
type SessionItem = {
  id: string;
  scheduleId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  isCancelled: boolean;
  note: string | null;
  schedule: Schedule;
  stats: SessionStats;
  hasAttendance: boolean;
};

type Props = {
  initialSessions: SessionItem[];
  initialDate: string;
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소방",
  CUSTOM: "기타",
};

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_LABELS[d.getDay()]})`;
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function AttendanceLectureClient({ initialSessions, initialDate }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionItem[]>(initialSessions);
  const [currentDate, setCurrentDate] = useState<string>(initialDate);
  const [isPending, startTransition] = useTransition();

  function navigateDate(dateStr: string) {
    setCurrentDate(dateStr);
    startTransition(() => {
      router.push(`/admin/attendance/lecture?date=${dateStr}`);
    });
  }

  function handleDateInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) navigateDate(e.target.value);
  }

  // 로딩 중에는 기존 세션 유지하고 date만 변경
  const displaySessions = sessions;

  return (
    <div>
      {/* 날짜 네비게이션 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateDate(offsetDate(currentDate, -1))}
            disabled={isPending}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white hover:bg-mist transition-colors disabled:opacity-50"
          >
            <span className="sr-only">이전 날짜</span>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate">
              <path
                fillRule="evenodd"
                d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <input
            type="date"
            value={currentDate}
            onChange={handleDateInputChange}
            className="rounded-xl border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
          />

          <button
            onClick={() => navigateDate(offsetDate(currentDate, 1))}
            disabled={isPending}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white hover:bg-mist transition-colors disabled:opacity-50"
          >
            <span className="sr-only">다음 날짜</span>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate">
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <p className="text-base font-semibold text-ink">
          {formatDisplayDate(currentDate)}
        </p>

        <button
          onClick={() => navigateDate(new Date().toISOString().split("T")[0])}
          className="rounded-xl border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-slate hover:bg-mist transition-colors"
        >
          오늘
        </button>
      </div>

      {/* 세션 목록 */}
      {isPending ? (
        <div className="flex items-center justify-center py-20 text-slate">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-ember border-t-transparent" />
          <span className="ml-3">불러오는 중...</span>
        </div>
      ) : displaySessions.length === 0 ? (
        <div className="rounded-[28px] border border-ink/8 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-mist">
            <svg
              className="h-7 w-7 text-slate"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-base font-medium text-ink">이 날짜에 강의 세션이 없습니다.</p>
          <p className="mt-2 text-sm text-slate">
            강의 스케줄을 먼저 설정하고 세션을 생성하세요.
          </p>
          <Link
            href="/admin/settings/lecture-schedules"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember/90 transition-colors"
          >
            스케줄 설정
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {displaySessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: SessionItem }) {
  const { stats, hasAttendance, isCancelled } = session;

  return (
    <div
      className={`rounded-[28px] border bg-white p-6 shadow-sm transition-shadow hover:shadow-md ${
        isCancelled ? "border-red-200 opacity-60" : "border-ink/8"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* 세션 정보 */}
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
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
            {isCancelled && (
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                취소됨
              </span>
            )}
          </div>

          {session.schedule.instructorName && (
            <p className="mt-1.5 text-sm text-slate">
              강사: {session.schedule.instructorName}
            </p>
          )}

          {/* 출결 통계 */}
          {hasAttendance ? (
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
            <p className="mt-3 text-sm text-slate">출결 미처리</p>
          )}
        </div>

        {/* 액션 버튼 */}
        {!isCancelled && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/admin/attendance/lecture/${session.id}/qr`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border border-forest/30 bg-forest/10 px-4 py-2.5 text-sm font-semibold text-forest hover:bg-forest/20 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                />
              </svg>
              QR 출력
            </Link>
            <Link
              href={`/admin/attendance/lecture/${session.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white hover:bg-ember/90 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              출결 입력
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
