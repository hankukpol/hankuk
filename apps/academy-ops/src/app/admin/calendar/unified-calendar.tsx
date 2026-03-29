"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CalendarEvent } from "@/app/api/admin/calendar/events/route";

// ── types ────────────────────────────────────────────────────────────────────

interface UnifiedCalendarProps {
  year: number;
  month: number;
  initialEvents: CalendarEvent[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function padZero(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${padZero(month)}-${padZero(day)}`;
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

const MONTH_KO = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// ── color maps ───────────────────────────────────────────────────────────────

const COLOR_DOT: Record<CalendarEvent["color"], string> = {
  ember: "bg-ember",
  forest: "bg-forest",
  sky: "bg-sky-400",
  gray: "bg-slate/40",
};

const COLOR_BADGE: Record<CalendarEvent["color"], string> = {
  ember: "bg-ember/15 text-ember border-ember/20",
  forest: "bg-forest/15 text-forest border-forest/20",
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  gray: "bg-slate/10 text-slate border-slate/20",
};

const COLOR_PANEL: Record<CalendarEvent["color"], string> = {
  ember: "border-l-ember bg-ember/5",
  forest: "border-l-forest bg-forest/5",
  sky: "border-l-sky-400 bg-sky-50",
  gray: "border-l-slate/30 bg-slate/5",
};

// ── component ─────────────────────────────────────────────────────────────────

export function UnifiedCalendar({ year, month, initialEvents }: UnifiedCalendarProps) {
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  // ── fetch events on month change ──────────────────────────────────────────

  const fetchEvents = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/calendar/events?year=${y}&month=${m}`);
      if (res.ok) {
        const json = await res.json();
        setEvents(json.data ?? []);
      }
    } catch {
      // silently fail — initial events still shown
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(year, month);
  }, [year, month, fetchEvents]);

  // ── navigation ────────────────────────────────────────────────────────────

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);

  function navigate(y: number, m: number) {
    setSelectedDateKey(null);
    router.push(`/admin/calendar?year=${y}&month=${m}`);
  }

  // ── calendar grid ─────────────────────────────────────────────────────────

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const cells: Array<{ day: number | null; dateKey: string | null }> = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDayOfWeek + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ day: null, dateKey: null });
    } else {
      cells.push({ day: dayNum, dateKey: toDateKey(year, month, dayNum) });
    }
  }

  // Group events by date
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    eventsByDate[ev.date].push(ev);
  }

  // Today
  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // Selected day events for side panel
  const selectedEvents = selectedDateKey ? (eventsByDate[selectedDateKey] ?? []) : [];

  // KPI
  const examSessionCount = events.filter((e) => e.type === "EXAM_SESSION" && e.status !== "CANCELLED").length;
  const counselingCount = events
    .filter((e) => e.type === "COUNSELING_APPOINTMENT")
    .reduce((acc, e) => acc + ((e.meta?.activeCount as number) ?? 0), 0);
  const gongchaeCount = events.filter((e) => e.type === "EXAM_SESSION" && (e.meta?.examType as string) === "GONGCHAE" && e.status !== "CANCELLED").length;
  const gyeongchaeCount = events.filter((e) => e.type === "EXAM_SESSION" && (e.meta?.examType as string) === "GYEONGCHAE" && e.status !== "CANCELLED").length;

  return (
    <div className="p-6 sm:p-10">
      {/* Page header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        일정 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">통합 일정 캘린더</h1>
      <p className="mt-3 text-sm leading-7 text-slate">
        시험 회차와 면담 예약을 한 달력에서 확인합니다.
      </p>

      {/* KPI row */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <article className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">시험 회차</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{examSessionCount}회</p>
          <div className="mt-2 flex gap-2 flex-wrap">
            {gongchaeCount > 0 && (
              <span className="rounded-full bg-ember/15 px-2 py-0.5 text-xs font-semibold text-ember">
                공채 {gongchaeCount}
              </span>
            )}
            {gyeongchaeCount > 0 && (
              <span className="rounded-full bg-forest/15 px-2 py-0.5 text-xs font-semibold text-forest">
                경채 {gyeongchaeCount}
              </span>
            )}
          </div>
        </article>
        <article className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">면담 예약</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{counselingCount}건</p>
          <p className="mt-2 text-xs text-slate">취소 제외</p>
        </article>
      </div>

      {/* Main content: calendar + side panel */}
      <div className="mt-6 flex gap-4 lg:gap-6 items-start">
        {/* Calendar card */}
        <div className={`min-w-0 flex-1 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden transition-all ${selectedDateKey ? "lg:max-w-[calc(100%-340px)]" : ""}`}>
          {/* Month nav */}
          <div className="flex items-center justify-between border-b border-ink/5 px-5 py-4">
            <button
              onClick={() => navigate(prev.year, prev.month)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:bg-mist hover:text-ink"
              aria-label="이전 달"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="text-center">
              <p className="text-lg font-semibold text-ink">
                {year}년 {MONTH_KO[month - 1]}
              </p>
              {loading && (
                <p className="text-xs text-slate mt-0.5">불러오는 중...</p>
              )}
            </div>

            <button
              onClick={() => navigate(next.year, next.month)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:bg-mist hover:text-ink"
              aria-label="다음 달"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-ink/5">
            {WEEKDAY_LABELS.map((label, idx) => (
              <div
                key={label}
                className={`py-2 text-center text-xs font-semibold ${
                  idx === 0 ? "text-red-400" : idx === 6 ? "text-blue-400" : "text-slate"
                }`}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 divide-x divide-ink/5">
            {cells.map((cell, idx) => {
              const isToday = cell.dateKey === todayKey;
              const isSelected = cell.dateKey === selectedDateKey;
              const dayEvents = cell.dateKey ? (eventsByDate[cell.dateKey] ?? []) : [];
              const colIndex = idx % 7;
              const MAX_VISIBLE = 3;
              const visibleEvents = dayEvents.slice(0, MAX_VISIBLE);
              const overflow = dayEvents.length - MAX_VISIBLE;

              return (
                <div
                  key={idx}
                  role={cell.day !== null ? "button" : undefined}
                  tabIndex={cell.day !== null ? 0 : undefined}
                  onClick={() => {
                    if (cell.dateKey) {
                      setSelectedDateKey((prev) => (prev === cell.dateKey ? null : cell.dateKey));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (cell.dateKey) {
                        setSelectedDateKey((prev) => (prev === cell.dateKey ? null : cell.dateKey));
                      }
                    }
                  }}
                  className={`min-h-[100px] border-b border-ink/5 p-1.5 transition-colors ${
                    cell.day === null
                      ? "bg-mist/40"
                      : isSelected
                        ? "bg-ember/5 cursor-pointer"
                        : "cursor-pointer bg-white hover:bg-mist/30"
                  }`}
                >
                  {cell.day !== null && (
                    <>
                      {/* Day number */}
                      <div className="mb-1">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                            isToday
                              ? "bg-ember text-white"
                              : isSelected
                                ? "bg-ember/20 text-ember"
                                : colIndex === 0
                                  ? "text-red-400"
                                  : colIndex === 6
                                    ? "text-blue-400"
                                    : "text-ink"
                          }`}
                        >
                          {cell.day}
                        </span>
                      </div>

                      {/* Event badges */}
                      <div className="space-y-0.5">
                        {visibleEvents.map((ev) => (
                          <div
                            key={ev.id}
                            title={ev.title}
                            className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight border ${COLOR_BADGE[ev.color]}`}
                          >
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_DOT[ev.color]}`} />
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                        {overflow > 0 && (
                          <div className="px-1 py-0.5 text-[10px] font-medium text-slate">
                            +{overflow}개 더보기
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel — slides in when a day is selected */}
        {selectedDateKey && (
          <aside className="w-full lg:w-80 shrink-0 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-ink/5 px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">
                {(() => {
                  const [y, m, d] = selectedDateKey.split("-").map(Number);
                  return `${y}년 ${MONTH_KO[m - 1]} ${d}일`;
                })()}
              </h2>
              <button
                onClick={() => setSelectedDateKey(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate transition hover:bg-mist hover:text-ink"
                aria-label="닫기"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Panel body */}
            <div className="divide-y divide-ink/5 max-h-[60vh] overflow-y-auto">
              {selectedEvents.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate">
                  등록된 일정이 없습니다.
                </div>
              ) : (
                selectedEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className={`flex items-start justify-between gap-3 border-l-[3px] px-4 py-4 ${COLOR_PANEL[ev.color]}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${COLOR_BADGE[ev.color]}`}>
                          {ev.type === "EXAM_SESSION" ? "시험" : "면담"}
                        </span>
                        {ev.status === "CANCELLED" && (
                          <span className="inline-flex rounded-full bg-slate/10 px-2 py-0.5 text-[10px] font-semibold text-slate border border-slate/20">
                            취소
                          </span>
                        )}
                      </div>
                      <p className={`mt-1 text-sm font-medium leading-tight ${ev.status === "CANCELLED" ? "line-through text-slate" : "text-ink"}`}>
                        {ev.title}
                      </p>
                    </div>
                    <Link
                      href={ev.link}
                      className="shrink-0 mt-0.5 text-xs font-semibold text-ember underline-offset-2 hover:underline whitespace-nowrap"
                    >
                      {ev.type === "EXAM_SESSION" ? "상세보기" : "목록보기"} →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-slate">범례:</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ember/15 px-2.5 py-0.5 text-xs font-semibold text-ember border border-ember/20">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          공채 시험
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/15 px-2.5 py-0.5 text-xs font-semibold text-forest border border-forest/20">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          경채 시험
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          면담 예약
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate/10 px-2.5 py-0.5 text-xs font-semibold text-slate border border-slate/20">
          <span className="h-1.5 w-1.5 rounded-full bg-slate/40" />
          취소
        </span>
      </div>

      {/* Mobile: selected day events below calendar */}
      {selectedDateKey && selectedEvents.length > 0 && (
        <div className="mt-4 lg:hidden rounded-[20px] border border-ink/10 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink/5 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">
              {(() => {
                const [y, m, d] = selectedDateKey.split("-").map(Number);
                return `${y}년 ${MONTH_KO[m - 1]} ${d}일 일정`;
              })()}
            </h2>
            <button
              onClick={() => setSelectedDateKey(null)}
              className="text-xs text-slate hover:text-ink"
            >
              닫기
            </button>
          </div>
          <div className="divide-y divide-ink/5">
            {selectedEvents.map((ev) => (
              <div
                key={ev.id}
                className={`flex items-center justify-between gap-3 border-l-[3px] px-4 py-3 ${COLOR_PANEL[ev.color]}`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium leading-tight ${ev.status === "CANCELLED" ? "line-through text-slate" : "text-ink"}`}>
                    {ev.title}
                  </p>
                </div>
                <Link
                  href={ev.link}
                  className="shrink-0 text-xs font-semibold text-ember underline-offset-2 hover:underline"
                >
                  보기 →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
