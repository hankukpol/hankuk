"use client";

import { useState, useTransition } from "react";
import {
  AttendanceCalendar,
  type AttendanceDayRecord,
} from "@/components/student-portal/attendance-calendar";
import { SUBJECT_LABEL, ATTEND_TYPE_LABEL } from "@/lib/constants";
import type { AttendType, Subject } from "@prisma/client";
import { formatDateWithWeekday } from "@/lib/format";

// ── 타입 ──────────────────────────────────────────────────────────────

type CalendarRecord = {
  date: string;
  status: "present" | "late" | "absent" | "excused" | "future" | "none";
  subjects: string[];
};

type MonthlySummary = {
  present: number;
  excused: number;
  absent: number;
  total: number;
  attendanceRate: number;
  streak: number;
};

type RecentSession = {
  id: number;
  week: number;
  subject: Subject;
  examDate: Date;
  attendType: AttendType;
  finalScore: number | null;
  noteStatus: string | null;
  noteReason: string | null;
  noteCategory: string | null;
  countedAsAttendance: boolean;
};

type SummaryStats = {
  currentStatus: string;
  thisWeekAbsences: number;
  thisMonthAbsences: number;
  totalSessions: number;
  attendedSessions: number;
  attendanceRate: number;
};

type AttendanceSectionProps = {
  /** 이번 달 캘린더 초기 데이터 */
  initialCalendarRecords: CalendarRecord[];
  initialMonthlySummary: MonthlySummary;
  initialMonth: string; // "YYYY-MM"
  /** 전체 요약 */
  summary: SummaryStats;
  /** 최근 시험 출결 세션 목록 */
  recentSessions: RecentSession[];
  studentName: string;
};

// ── 출석률 원형 프로그레스 ─────────────────────────────────────────────

function CircleProgress({ value }: { value: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="72" height="72" className="-rotate-90">
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="6"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="#C55A11"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-sm font-bold text-ink">{value.toFixed(0)}%</span>
    </div>
  );
}

// ── 출결 현황 바 ──────────────────────────────────────────────────────

function AttendanceBar({ present, absent, excused, total }: {
  present: number;
  absent: number;
  excused: number;
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="h-3 w-full rounded-full bg-ink/10" />
    );
  }

  const presentPct = (present / total) * 100;
  const excusedPct = (excused / total) * 100;
  const absentPct = (absent / total) * 100;

  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink/10">
      {present > 0 && (
        <div
          className="h-full bg-green-500"
          style={{ width: `${presentPct}%` }}
          title={`출석 ${present}일`}
        />
      )}
      {excused > 0 && (
        <div
          className="h-full bg-blue-400"
          style={{ width: `${excusedPct}%` }}
          title={`공결 ${excused}일`}
        />
      )}
      {absent > 0 && (
        <div
          className="h-full bg-red-400"
          style={{ width: `${absentPct}%` }}
          title={`결석 ${absent}일`}
        />
      )}
    </div>
  );
}

// ── 출결 상태 뱃지 ────────────────────────────────────────────────────

function AttendTypeBadge({ attendType }: { attendType: AttendType }) {
  const colorMap: Record<AttendType, string> = {
    NORMAL: "bg-green-100 text-green-700 border-green-200",
    LIVE: "bg-green-100 text-green-700 border-green-200",
    EXCUSED: "bg-blue-100 text-blue-700 border-blue-200",
    ABSENT: "bg-red-100 text-red-600 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${colorMap[attendType] ?? "bg-mist text-slate border-ink/10"}`}
    >
      {ATTEND_TYPE_LABEL[attendType]}
    </span>
  );
}

// ── 상태 필터 ─────────────────────────────────────────────────────────

type StatusFilter = "all" | AttendType;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "NORMAL", label: "출석" },
  { value: "LIVE", label: "라이브" },
  { value: "EXCUSED", label: "공결" },
  { value: "ABSENT", label: "결석" },
];

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

export function AttendanceSection({
  initialCalendarRecords,
  initialMonthlySummary,
  initialMonth,
  summary,
  recentSessions,
  studentName,
}: AttendanceSectionProps) {
  const [calendarRecords, setCalendarRecords] = useState<AttendanceDayRecord[]>(
    initialCalendarRecords,
  );
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>(initialMonthlySummary);
  const [_currentMonth, setCurrentMonth] = useState(initialMonth);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isPending, startTransition] = useTransition();

  // 월 변경 시 API 호출
  function handleMonthChange(month: string) {
    setCurrentMonth(month);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/student/attendance?month=${month}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: {
            records: CalendarRecord[];
            summary: MonthlySummary;
          };
        };
        if (json.data) {
          setCalendarRecords(json.data.records);
          setMonthlySummary(json.data.summary);
        }
      } catch {
        // 실패 시 무시 — 기존 데이터 유지
      }
    });
  }

  // 필터 적용된 세션 목록
  const filteredSessions =
    statusFilter === "all"
      ? recentSessions
      : recentSessions.filter((s) => s.attendType === statusFilter);

  return (
    <div className="space-y-6">
      {/* ── 출결 요약 카드 ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="mb-4 text-xl font-semibold">{studentName}의 출결 요약</h2>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* 출석률 원형 */}
          <article className="flex items-center gap-4 rounded-[24px] border border-ink/10 bg-mist p-4">
            <CircleProgress value={summary.attendanceRate} />
            <div>
              <p className="text-xs text-slate">전체 출석률</p>
              <p className="mt-1 text-lg font-semibold">{summary.attendanceRate.toFixed(1)}%</p>
              <p className="text-xs text-slate">{summary.attendedSessions}/{summary.totalSessions}회</p>
            </div>
          </article>

          {/* 이번 주/달 결석 */}
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-xs text-slate">이번 주 결석</p>
            <p className="mt-2 text-2xl font-bold text-ink">{summary.thisWeekAbsences}
              <span className="text-base font-normal text-slate">회</span>
            </p>
            <p className="mt-1 text-xs text-slate">이번 달 결석 {summary.thisMonthAbsences}회</p>
          </article>

          {/* 연속 출석 스트릭 */}
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-xs text-slate">연속 출석</p>
            <p className="mt-2 text-2xl font-bold text-ember">{monthlySummary.streak}
              <span className="text-base font-normal text-slate">일</span>
            </p>
            <p className="mt-1 text-xs text-slate">이번 달 기준</p>
          </article>

          {/* 이번 달 출결 현황 */}
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="mb-3 text-xs text-slate">이번 달 현황</p>
            <AttendanceBar
              present={monthlySummary.present}
              excused={monthlySummary.excused}
              absent={monthlySummary.absent}
              total={monthlySummary.total}
            />
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                출석 {monthlySummary.present}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                공결 {monthlySummary.excused}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                결석 {monthlySummary.absent}
              </span>
            </div>
          </article>
        </div>
      </section>

      {/* ── 월별 출결 캘린더 ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="mb-4 text-xl font-semibold">월별 출결 캘린더</h2>
        <div className={isPending ? "opacity-60 transition-opacity" : ""}>
          <AttendanceCalendar
            initialMonth={initialMonth}
            records={calendarRecords}
            onMonthChange={handleMonthChange}
          />
        </div>
        {isPending && (
          <p className="mt-2 text-center text-xs text-slate">불러오는 중...</p>
        )}
      </section>

      {/* ── 출결 상세 목록 ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">최근 시험 출결</h2>

          {/* 상태 필터 */}
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === opt.value
                    ? "border-ember bg-ember text-white"
                    : "border-ink/10 bg-mist text-slate hover:border-ember/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            {statusFilter === "all"
              ? "선택한 기간에 확인할 출결 정보가 없습니다."
              : `${FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label} 기록이 없습니다.`}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => (
              <article
                key={session.id}
                className="rounded-[24px] border border-ink/10 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                        {formatDateWithWeekday(session.examDate)}
                      </span>
                      <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                        {session.week}주차
                      </span>
                      <AttendTypeBadge attendType={session.attendType} />
                    </div>
                    <h3 className="mt-3 text-base font-semibold">
                      {SUBJECT_LABEL[session.subject]}
                    </h3>
                    <p className="mt-1 text-xs text-slate">
                      출석 인정: {session.countedAsAttendance ? "인정" : "미인정"}
                    </p>
                  </div>
                  {session.finalScore !== null && (
                    <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-center text-sm">
                      <div className="text-xs text-slate">점수</div>
                      <div className="mt-1 text-lg font-bold">{session.finalScore}</div>
                    </div>
                  )}
                </div>
                {session.noteReason && (
                  <div className="mt-3 rounded-[16px] border border-ink/10 bg-mist/60 px-4 py-3 text-xs leading-6 text-slate">
                    사유서: {session.noteReason}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
