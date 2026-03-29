"use client";

import { useState } from "react";

export type CalendarInstallment = {
  id: string;
  seq: number;
  amount: number;
  dueDate: string | null; // ISO string
  paidAt: string | null; // ISO string
  courseName: string;
  isOverdue: boolean;
};

type Props = {
  installments: CalendarInstallment[];
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function PaymentCalendar({ installments }: Props) {
  const today = new Date();

  // Find the earliest upcoming unpaid dueDate (or current month if none)
  const upcomingInstallments = installments.filter(
    (i) => i.paidAt === null && i.dueDate !== null,
  );
  const referenceDate =
    upcomingInstallments.length > 0
      ? new Date(
          Math.min(...upcomingInstallments.map((i) => new Date(i.dueDate!).getTime())),
        )
      : today;

  const [year, setYear] = useState(referenceDate.getFullYear());
  const [month, setMonth] = useState(referenceDate.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDow = firstDayOfMonth.getDay(); // 0=Sun
  const daysInMonth = lastDayOfMonth.getDate();

  // Map day → installments for this month
  const dayMap: Record<number, CalendarInstallment[]> = {};
  for (const inst of installments) {
    if (!inst.dueDate) continue;
    const d = new Date(inst.dueDate);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(inst);
    }
  }

  // Installments on selected day
  const selectedInsts = selectedDay !== null ? (dayMap[selectedDay] ?? []) : [];

  function prevMonth() {
    setSelectedDay(null);
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    setSelectedDay(null);
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  // Build grid cells: leading empty + days
  const cells: (number | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to multiple of 7
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
          Payment Calendar
        </p>
        <h2 className="mt-1 text-xl font-semibold">납부일 달력</h2>
        <p className="mt-1 text-xs text-slate">납부 예정일과 납부 완료일을 달력으로 확인하세요.</p>
      </div>

      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
          aria-label="이전 달"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <p className="text-base font-semibold text-ink">
          {year}년 {month + 1}월
        </p>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
          aria-label="다음 달"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`py-1 text-center text-[11px] font-semibold ${
              i === 0 ? "text-red-500" : i === 6 ? "text-sky-500" : "text-slate"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-10" />;
          }

          const insts = dayMap[day] ?? [];
          const hasPaid = insts.some((i) => i.paidAt !== null);
          const hasUnpaid = insts.some((i) => i.paidAt === null);
          const hasOverdue = insts.some((i) => i.isOverdue);
          const isToday = sameDay(new Date(year, month, day), today);
          const isSelected = selectedDay === day;
          const hasAny = insts.length > 0;
          const dow = (startDow + day - 1) % 7;

          let dayClass =
            "relative flex h-10 w-full flex-col items-center justify-center rounded-xl text-xs font-medium transition select-none";

          if (isSelected) {
            dayClass += " ring-2 ring-ember bg-ember/5 text-ember";
          } else if (hasAny) {
            dayClass += " cursor-pointer hover:bg-ink/5";
          }

          let textColor = "";
          if (!isSelected) {
            if (dow === 0) textColor = "text-red-500";
            else if (dow === 6) textColor = "text-sky-500";
            else textColor = "text-ink";
          }

          return (
            <button
              key={day}
              type="button"
              disabled={!hasAny}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={`${dayClass} ${textColor}`}
              aria-label={`${month + 1}월 ${day}일`}
            >
              {/* Today indicator */}
              {isToday && !isSelected && (
                <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-ink/20" />
              )}
              {/* Day number */}
              <span className={isToday ? "font-bold" : ""}>{day}</span>
              {/* Dot indicators */}
              {hasAny && (
                <div className="mt-0.5 flex items-center gap-0.5">
                  {hasPaid && (
                    <span className="h-1.5 w-1.5 rounded-full bg-forest" />
                  )}
                  {hasOverdue && (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  )}
                  {hasUnpaid && !hasOverdue && (
                    <span className="h-1.5 w-1.5 rounded-full bg-ember" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay !== null && selectedInsts.length > 0 && (
        <div className="mt-4 rounded-[20px] border border-ink/10 bg-mist p-3">
          <p className="mb-2.5 text-xs font-semibold text-ink">
            {month + 1}월 {selectedDay}일 납부 일정
          </p>
          <div className="space-y-2">
            {selectedInsts.map((inst) => (
              <div
                key={inst.id}
                className={`flex items-center justify-between rounded-[14px] border px-3 py-2 ${
                  inst.paidAt !== null
                    ? "border-forest/20 bg-forest/5"
                    : inst.isOverdue
                    ? "border-red-200 bg-red-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <div>
                  <p className="text-xs font-semibold text-ink">
                    {inst.seq}회차 — {inst.courseName}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-ember">
                    {formatAmount(inst.amount)}
                  </p>
                </div>
                {inst.paidAt !== null ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-forest/20 bg-white px-2 py-0.5 text-[10px] font-semibold text-forest">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    완료
                  </span>
                ) : inst.isOverdue ? (
                  <span className="inline-flex rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    연체
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    미납
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-forest" />
          납부 완료
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ember" />
          납부 예정
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          연체
        </span>
      </div>
    </div>
  );
}
