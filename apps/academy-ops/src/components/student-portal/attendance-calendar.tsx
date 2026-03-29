"use client";

import { useState } from "react";

export type AttendanceDayStatus = "present" | "late" | "absent" | "excused" | "future" | "none";

export type AttendanceDayRecord = {
  date: string; // "YYYY-MM-DD"
  status: AttendanceDayStatus;
  subjects?: string[]; // 해당 날짜 시험 과목 레이블 목록
};

type AttendanceCalendarProps = {
  /** 초기 표시 연월 (YYYY-MM) — 생략 시 오늘 */
  initialMonth?: string;
  /** 날짜별 출결 기록 맵 */
  records: AttendanceDayRecord[];
  /** 월이 변경될 때 호출 — 새 월 "YYYY-MM" 반환 */
  onMonthChange?: (month: string) => void;
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function padTwo(n: number) {
  return String(n).padStart(2, "0");
}

function formatMonthKey(year: number, month: number) {
  return `${year}-${padTwo(month)}`;
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(now.getDate())}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  // 0 = 일요일
  return new Date(year, month - 1, 1).getDay();
}

/** 상태별 배지 */
function StatusBadge({ status }: { status: AttendanceDayStatus }) {
  if (status === "present") {
    return (
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-base leading-none text-green-700"
        aria-label="출석"
      >
        ●
      </span>
    );
  }
  if (status === "late") {
    return (
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-sm leading-none text-amber-700"
        aria-label="지각"
      >
        △
      </span>
    );
  }
  if (status === "absent") {
    return (
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-base font-bold leading-none text-red-600"
        aria-label="결석"
      >
        ×
      </span>
    );
  }
  if (status === "excused") {
    return (
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-base leading-none text-blue-700"
        aria-label="공결"
      >
        ●
      </span>
    );
  }
  return null;
}

export function AttendanceCalendar({
  initialMonth,
  records,
  onMonthChange,
}: AttendanceCalendarProps) {
  const today = todayString();
  const [year, month] = (() => {
    if (initialMonth) {
      const parts = initialMonth.split("-").map(Number);
      if (parts.length === 2 && parts[0] && parts[1]) {
        return [parts[0], parts[1]] as [number, number];
      }
    }
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1] as [number, number];
  })();

  const [currentYear, setCurrentYear] = useState(year);
  const [currentMonth, setCurrentMonth] = useState(month);

  const recordMap = new Map(records.map((r) => [r.date, r]));

  function prevMonth() {
    let y = currentYear;
    let m = currentMonth - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setCurrentYear(y);
    setCurrentMonth(m);
    onMonthChange?.(formatMonthKey(y, m));
  }

  function nextMonth() {
    let y = currentYear;
    let m = currentMonth + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setCurrentYear(y);
    setCurrentMonth(m);
    onMonthChange?.(formatMonthKey(y, m));
  }

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOfWeek = getFirstDayOfWeek(currentYear, currentMonth);

  // 달력 셀 배열 (null = 빈 셀)
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // 행 단위로 분리
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <div className="rounded-[24px] border border-ink/10 bg-white p-4 sm:p-5">
      {/* 헤더: 월 이동 */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-mist text-ink transition hover:bg-ink/10"
          aria-label="이전 달"
        >
          ◀
        </button>
        <span className="text-base font-semibold">
          {currentYear}년 {currentMonth}월
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-mist text-ink transition hover:bg-ink/10"
          aria-label="다음 달"
        >
          ▶
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-slate">
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={
              i === 0
                ? "text-red-500"
                : i === 6
                  ? "text-blue-500"
                  : ""
            }
          >
            {label}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="space-y-1">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-7">
            {Array.from({ length: 7 }, (_, colIdx) => {
              const day = row[colIdx] ?? null;
              if (day === null) {
                return <div key={colIdx} />;
              }

              const dateStr = `${currentYear}-${padTwo(currentMonth)}-${padTwo(day)}`;
              const record = recordMap.get(dateStr);
              const isToday = dateStr === today;
              const isFuture = dateStr > today;
              const status: AttendanceDayStatus = isFuture
                ? "future"
                : (record?.status ?? "none");

              return (
                <div
                  key={colIdx}
                  className={`group relative flex flex-col items-center py-1 ${
                    colIdx === 0 ? "text-red-500" : colIdx === 6 ? "text-blue-500" : "text-ink"
                  }`}
                  title={
                    record?.subjects && record.subjects.length > 0
                      ? record.subjects.join(", ")
                      : undefined
                  }
                >
                  {/* 날짜 숫자 */}
                  <span
                    className={`mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday
                        ? "bg-ember text-white font-bold ring-2 ring-ember ring-offset-1"
                        : isFuture
                          ? "text-ink/30"
                          : ""
                    }`}
                  >
                    {day}
                  </span>

                  {/* 상태 아이콘 */}
                  {status !== "future" && status !== "none" && (
                    <StatusBadge status={status} />
                  )}
                  {(status === "future" || status === "none") && (
                    <span className="h-7 w-7" />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 범례 */}
      <div className="mt-4 flex flex-wrap gap-3 border-t border-ink/10 pt-3 text-xs text-slate">
        <span className="flex items-center gap-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 text-[10px]">●</span>
          출석
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px]">△</span>
          지각
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 text-[10px] font-bold">×</span>
          결석
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[10px]">●</span>
          공결
        </span>
      </div>
    </div>
  );
}
