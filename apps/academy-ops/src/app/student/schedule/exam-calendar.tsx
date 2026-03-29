"use client";

import { useState } from "react";

type ExamCalendarProps = {
  examDates: string[]; // "YYYY-MM-DD" strings
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function buildCalendar(year: number, month: number) {
  // month is 0-indexed (Jan = 0)
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<number | null> = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }
  // Pad to complete last row
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function ExamCalendar({ examDates }: ExamCalendarProps) {
  const today = new Date();
  const [displayYear, setDisplayYear] = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth()); // 0-indexed

  const examDateSet = new Set(examDates);
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = buildCalendar(displayYear, displayMonth);

  function prevMonth() {
    if (displayMonth === 0) {
      setDisplayMonth(11);
      setDisplayYear((y) => y - 1);
    } else {
      setDisplayMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (displayMonth === 11) {
      setDisplayMonth(0);
      setDisplayYear((y) => y + 1);
    } else {
      setDisplayMonth((m) => m + 1);
    }
  }

  const examDatesThisMonth = cells
    .filter((d): d is number => d !== null)
    .filter((d) => examDateSet.has(toDateKey(displayYear, displayMonth, d)));

  return (
    <div>
      {/* Calendar header */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
          aria-label="이전 달"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-ink">
          {displayYear}년 {MONTH_LABELS[displayMonth]}
          {examDatesThisMonth.length > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-ember px-1.5 text-[10px] font-bold text-white">
              {examDatesThisMonth.length}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
          aria-label="다음 달"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAY_LABELS.map((label, idx) => (
          <div
            key={label}
            className={`py-1 text-[10px] font-semibold ${
              idx === 0 ? "text-red-500" : idx === 6 ? "text-blue-500" : "text-slate"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="mt-0.5 grid grid-cols-7 gap-0.5 text-center">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} />;
          }

          const dateKey = toDateKey(displayYear, displayMonth, day);
          const isExamDay = examDateSet.has(dateKey);
          const isToday = dateKey === todayKey;
          const colIdx = idx % 7;

          return (
            <div
              key={dateKey}
              className={`relative flex h-8 w-full items-center justify-center rounded-full text-xs font-medium transition ${
                isExamDay
                  ? "bg-ember text-white font-bold"
                  : isToday
                  ? "bg-forest/10 text-forest font-bold ring-1 ring-forest/30"
                  : colIdx === 0
                  ? "text-red-500"
                  : colIdx === 6
                  ? "text-blue-500"
                  : "text-ink hover:bg-mist"
              }`}
              title={isExamDay ? `${displayYear}년 ${displayMonth + 1}월 ${day}일 시험` : undefined}
            >
              {day}
              {isExamDay && (
                <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ember/60" />
              )}
            </div>
          );
        })}
      </div>

      {examDatesThisMonth.length === 0 && (
        <p className="mt-3 text-center text-xs text-slate">이번 달 예정 시험 없음</p>
      )}
    </div>
  );
}
