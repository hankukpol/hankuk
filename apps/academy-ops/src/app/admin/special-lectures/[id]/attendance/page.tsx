"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "NONE";

type EnrollmentRow = {
  id: string;
  examNumber: string;
  studentName: string;
  studentPhone: string | null;
  status: string;
};

type SessionAttendance = {
  enrollmentId: string;
  status: AttendanceStatus;
};

type LectureInfo = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type AttendanceSummary = {
  date: string;
  present: number;
  late: number;
  absent: number;
  total: number;
  rate: number;
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "출석",
  LATE: "지각",
  ABSENT: "결석",
  NONE: "—",
};

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  PRESENT: "bg-forest/10 text-forest border-forest/20",
  LATE: "bg-amber-50 text-amber-700 border-amber-200",
  ABSENT: "bg-red-50 text-red-600 border-red-200",
  NONE: "bg-ink/5 text-slate border-ink/10",
};

const CYCLE: AttendanceStatus[] = ["NONE", "PRESENT", "LATE", "ABSENT"];

function nextStatus(current: AttendanceStatus): AttendanceStatus {
  const idx = CYCLE.indexOf(current);
  return CYCLE[(idx + 1) % CYCLE.length]!;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Build session dates between startDate and endDate (weekdays only, max 60)
function buildSessionDates(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  while (cursor <= end && dates.length < 60) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SpecialLectureAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const [isPending, startTransition] = useTransition();

  // Data state
  const [lecture, setLecture] = useState<LectureInfo | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Session dates
  const [sessionDates, setSessionDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [customDate, setCustomDate] = useState<string>("");
  const [useCustomDate, setUseCustomDate] = useState(false);

  // Attendance data: { [date]: { [enrollmentId]: status } }
  const [attendance, setAttendance] = useState<
    Record<string, Record<string, AttendanceStatus>>
  >({});

  // Saved state
  const [savedDates, setSavedDates] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ─── Load lecture + enrollments ─────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/special-lectures/${id}/attendance`);
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "불러오기 실패");
      }
      const data = await res.json() as {
        lecture: LectureInfo;
        enrollments: EnrollmentRow[];
        attendance: Record<string, Record<string, AttendanceStatus>>;
      };
      setLecture(data.lecture);
      setEnrollments(data.enrollments);
      setAttendance(data.attendance);

      const dates = buildSessionDates(data.lecture.startDate, data.lecture.endDate);
      setSessionDates(dates);
      const today = new Date().toISOString().slice(0, 10);
      const initialDate =
        dates.includes(today)
          ? today
          : dates[dates.length - 1] ?? today;
      setSelectedDate(initialDate);
      setCustomDate(initialDate);
      setSavedDates(new Set(Object.keys(data.attendance)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ─── Derive current date ─────────────────────────────────────────────────

  const activeDate = useCustomDate ? customDate : selectedDate;

  // ─── Toggle attendance ───────────────────────────────────────────────────

  function toggleAttendance(enrollmentId: string) {
    setAttendance((prev) => {
      const dateMap = prev[activeDate] ?? {};
      const current = dateMap[enrollmentId] ?? "NONE";
      const next = nextStatus(current);
      return {
        ...prev,
        [activeDate]: { ...dateMap, [enrollmentId]: next },
      };
    });
  }

  // ─── Save attendance ─────────────────────────────────────────────────────

  function handleSave() {
    setSaveError(null);
    setSaveSuccess(false);
    startTransition(async () => {
      try {
        const dateAttendance = attendance[activeDate] ?? {};
        const res = await fetch(`/api/special-lectures/${id}/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: activeDate,
            attendance: dateAttendance,
          }),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error ?? "저장 실패");
        }
        setSavedDates((prev) => new Set([...prev, activeDate]));
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  // ─── Compute summary ─────────────────────────────────────────────────────

  function computeSummary(date: string): AttendanceSummary {
    const dateMap = attendance[date] ?? {};
    const total = enrollments.filter((e) => e.status === "ACTIVE").length;
    let present = 0, late = 0, absent = 0;
    for (const enr of enrollments.filter((e) => e.status === "ACTIVE")) {
      const s = dateMap[enr.id] ?? "NONE";
      if (s === "PRESENT") present++;
      else if (s === "LATE") late++;
      else if (s === "ABSENT") absent++;
    }
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { date, present, late, absent, total, rate };
  }

  const currentSummary = computeSummary(activeDate);
  const activeEnrollments = enrollments.filter((e) => e.status === "ACTIVE");
  const currentDateMap = attendance[activeDate] ?? {};

  // Recent session summaries (last 5 saved)
  const recentSummaries: AttendanceSummary[] = savedDates.size > 0
    ? [...savedDates]
        .sort()
        .slice(-5)
        .map((d) => computeSummary(d))
    : [];

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="text-sm text-slate">불러오는 중…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-600">
          {error}
        </div>
        <Link
          href={`/admin/special-lectures/${id}`}
          className="mt-4 inline-flex text-sm text-slate hover:text-ember"
        >
          ← 특강 상세로
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        특강 단과
      </div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{lecture?.name}</h1>
          <p className="mt-1 text-sm text-slate">출결 관리</p>
        </div>
        <Link
          href={`/admin/special-lectures/${id}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ember/40 hover:text-ember"
        >
          ← 특강 상세
        </Link>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 text-center shadow-sm">
          <p className="text-2xl font-bold text-ink">{activeEnrollments.length}</p>
          <p className="mt-1 text-xs text-slate">수강생 수</p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5 text-center">
          <p className="text-2xl font-bold text-forest">{currentSummary.present}</p>
          <p className="mt-1 text-xs text-slate">출석</p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-2xl font-bold text-amber-700">{currentSummary.late}</p>
          <p className="mt-1 text-xs text-slate">지각</p>
        </div>
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-2xl font-bold text-red-600">{currentSummary.absent}</p>
          <p className="mt-1 text-xs text-slate">결석</p>
        </div>
      </div>

      {/* Date selector */}
      <div className="mt-8 rounded-[24px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">날짜 선택</h2>

        <div className="flex flex-wrap gap-2">
          {sessionDates.slice(-14).map((date) => {
            const isSaved = savedDates.has(date);
            const isActive = activeDate === date && !useCustomDate;
            return (
              <button
                key={date}
                onClick={() => {
                  setSelectedDate(date);
                  setUseCustomDate(false);
                }}
                className={`relative rounded-[12px] border px-3 py-2 text-xs font-medium transition ${
                  isActive
                    ? "border-ember/40 bg-ember text-white"
                    : "border-ink/10 bg-white text-slate hover:border-ember/30 hover:text-ember"
                }`}
              >
                {formatShortDate(date)}
                {isSaved && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-forest" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className="text-xs font-medium text-slate">직접 입력:</label>
          <input
            type="date"
            value={customDate}
            onChange={(e) => {
              setCustomDate(e.target.value);
              setUseCustomDate(true);
            }}
            className="rounded-[12px] border border-ink/20 px-3 py-1.5 text-sm outline-none focus:border-forest"
          />
          {useCustomDate && (
            <button
              onClick={() => setUseCustomDate(false)}
              className="text-xs text-slate hover:text-ink"
            >
              취소
            </button>
          )}
        </div>

        <p className="mt-3 text-sm font-medium text-ink">
          선택된 날짜:{" "}
          <span className="text-ember">{formatDate(activeDate)}</span>
          {savedDates.has(activeDate) && (
            <span className="ml-2 inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs text-forest">
              저장됨
            </span>
          )}
        </p>
      </div>

      {/* Attendance table */}
      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            출결 입력
            <span className="ml-2 text-sm font-normal text-slate">
              ({activeEnrollments.length}명) · 클릭으로 상태 변경
            </span>
          </h2>
          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="text-sm text-forest">저장 완료!</span>
            )}
            {saveError && (
              <span className="text-sm text-red-600">{saveError}</span>
            )}
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-[28px] bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest disabled:opacity-60"
            >
              {isPending ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>

        {activeEnrollments.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 py-16 text-center text-sm text-slate">
            활성 수강생이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">학번</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">이름</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">연락처</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">출결 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 bg-white">
                {activeEnrollments.map((enr) => {
                  const status: AttendanceStatus =
                    currentDateMap[enr.id] ?? "NONE";
                  return (
                    <tr
                      key={enr.id}
                      className="transition-colors hover:bg-mist/50"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-slate">
                        <Link
                          href={`/admin/students/${enr.examNumber}`}
                          className="hover:text-ember hover:underline"
                        >
                          {enr.examNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/students/${enr.examNumber}`}
                          className="hover:text-ember hover:underline"
                        >
                          {enr.studentName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate">
                        {enr.studentPhone ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => toggleAttendance(enr.id)}
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition hover:opacity-80 ${STATUS_COLOR[status]}`}
                        >
                          {STATUS_LABEL[status]}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trend summary */}
      {recentSummaries.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-ink">최근 세션별 출석률</h2>
          <div className="overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">날짜</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">수강생</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">출석</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">지각</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">결석</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">출석률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 bg-white">
                {recentSummaries.map((s) => (
                  <tr key={s.date} className="hover:bg-mist/50">
                    <td className="px-5 py-3 font-mono text-xs text-slate">{formatDate(s.date)}</td>
                    <td className="px-5 py-3 text-ink">{s.total}</td>
                    <td className="px-5 py-3 text-forest">{s.present}</td>
                    <td className="px-5 py-3 text-amber-700">{s.late}</td>
                    <td className="px-5 py-3 text-red-600">{s.absent}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-ink/10">
                          <div
                            className="h-full rounded-full bg-forest"
                            style={{ width: `${s.rate}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-ink">{s.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
