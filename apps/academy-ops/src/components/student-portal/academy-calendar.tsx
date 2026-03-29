"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ── types ────────────────────────────────────────────────────────────────────

export type AcademyCalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  type: "EXAM_SESSION" | "CIVIL_EXAM" | "NOTICE";
  title: string;
  color: "ember" | "forest" | "sky" | "gray";
  link?: string;
};

interface AcademyCalendarProps {
  year: number;
  month: number;
  initialEvents: AcademyCalendarEvent[];
  studentName?: string;
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

const COLOR_DOT: Record<AcademyCalendarEvent["color"], string> = {
  ember: "bg-ember",
  forest: "bg-forest",
  sky: "bg-sky-400",
  gray: "bg-slate/40",
};

const COLOR_BADGE: Record<AcademyCalendarEvent["color"], string> = {
  ember: "bg-ember/15 text-ember border-ember/20",
  forest: "bg-forest/15 text-forest border-forest/20",
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  gray: "bg-slate/10 text-slate border-slate/20",
};

const COLOR_PANEL: Record<AcademyCalendarEvent["color"], string> = {
  ember: "border-l-ember bg-ember/5",
  forest: "border-l-forest bg-forest/5",
  sky: "border-l-sky-400 bg-sky-50",
  gray: "border-l-slate/30 bg-slate/5",
};

const TYPE_LABEL: Record<AcademyCalendarEvent["type"], string> = {
  EXAM_SESSION: "아침시험",
  CIVIL_EXAM: "공채시험",
  NOTICE: "공지",
};

// ── component ─────────────────────────────────────────────────────────────────

export function AcademyCalendar({
  year: initialYear,
  month: initialMonth,
  initialEvents,
  studentName,
}: AcademyCalendarProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [events, setEvents] = useState<AcademyCalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  // ── fetch events on month change ──────────────────────────────────────────
  const fetchEvents = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/student/calendar/events?year=${y}&month=${m}`);
      if (res.ok) {
        const json = await res.json();
        setEvents(json.data ?? []);
      }
    } catch {
      // silently fail — keep existing events
    } finally {
      setLoading(false);
    }
  }, []);

  // ── navigation ────────────────────────────────────────────────────────────
  function navigate(y: number, m: number) {
    setSelectedDateKey(null);
    setYear(y);
    setMonth(m);
    fetchEvents(y, m);
  }

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);

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
  const eventsByDate: Record<string, AcademyCalendarEvent[]> = {};
  for (const ev of events) {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    eventsByDate[ev.date].push(ev);
  }

  // Today
  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // Selected events
  const selectedEvents = selectedDateKey ? (eventsByDate[selectedDateKey] ?? []) : [];

  // KPI counts for this month
  const monthEvents = events.filter((e) => e.date.startsWith(`${year}-${padZero(month)}`));
  const examCount = monthEvents.filter((e) => e.type === "EXAM_SESSION").length;
  const civilCount = monthEvents.filter((e) => e.type === "CIVIL_EXAM").length;
  const noticeCount = monthEvents.filter((e) => e.type === "NOTICE").length;

  return (
    <div className="space-y-4">
      {/* KPI summary */}
      <div className="grid grid-cols-3 gap-3">
        <article className="rounded-[20px] border border-ember/20 bg-ember/5 p-4 text-center">
          <p className="text-xs font-semibold text-ember">아침 시험</p>
          <p className="mt-1.5 text-2xl font-bold text-ember">{examCount}</p>
          <p className="mt-0.5 text-[11px] text-slate">회</p>
        </article>
        <article className="rounded-[20px] border border-forest/20 bg-forest/5 p-4 text-center">
          <p className="text-xs font-semibold text-forest">공채 일정</p>
          <p className="mt-1.5 text-2xl font-bold text-forest">{civilCount}</p>
          <p className="mt-0.5 text-[11px] text-slate">건</p>
        </article>
        <article className="rounded-[20px] border border-sky-200 bg-sky-50 p-4 text-center">
          <p className="text-xs font-semibold text-sky-700">공지 마감</p>
          <p className="mt-1.5 text-2xl font-bold text-sky-700">{noticeCount}</p>
          <p className="mt-0.5 text-[11px] text-slate">건</p>
        </article>
      </div>

      {/* Calendar card */}
      <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
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
            {studentName && (
              <p className="text-xs text-slate">{studentName}님의 일정</p>
            )}
            {loading && (
              <p className="text-xs text-ember mt-0.5">불러오는 중...</p>
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
            const MAX_VISIBLE = 2;
            const visibleEvents = dayEvents.slice(0, MAX_VISIBLE);
            const overflow = dayEvents.length - MAX_VISIBLE;

            return (
              <div
                key={idx}
                role={cell.day !== null ? "button" : undefined}
                tabIndex={cell.day !== null ? 0 : undefined}
                onClick={() => {
                  if (cell.dateKey) {
                    setSelectedDateKey((prev) =>
                      prev === cell.dateKey ? null : cell.dateKey,
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if (cell.dateKey) {
                      setSelectedDateKey((prev) =>
                        prev === cell.dateKey ? null : cell.dateKey,
                      );
                    }
                  }
                }}
                className={`min-h-[80px] border-b border-ink/5 p-1.5 transition-colors sm:min-h-[100px] ${
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

                    {/* Event dots/badges */}
                    <div className="space-y-0.5">
                      {visibleEvents.map((ev) => (
                        <div
                          key={ev.id}
                          title={ev.title}
                          className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight border ${COLOR_BADGE[ev.color]}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_DOT[ev.color]}`}
                          />
                          <span className="truncate hidden sm:inline">{ev.title}</span>
                          <span className="truncate sm:hidden">{TYPE_LABEL[ev.type]}</span>
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div className="px-1 py-0.5 text-[10px] font-medium text-slate">
                          +{overflow}
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

      {/* Selected day detail card */}
      {selectedDateKey && (
        <div className="rounded-[24px] border border-ink/10 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink/5 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">
              {(() => {
                const [y, m, d] = selectedDateKey.split("-").map(Number);
                const weekDay = new Date(y, m - 1, d).getDay();
                return `${y}년 ${MONTH_KO[m - 1]} ${d}일 (${WEEKDAY_LABELS[weekDay]})`;
              })()}
            </h2>
            <button
              onClick={() => setSelectedDateKey(null)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate transition hover:bg-mist hover:text-ink"
              aria-label="닫기"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="divide-y divide-ink/5">
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
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${COLOR_BADGE[ev.color]}`}
                      >
                        {TYPE_LABEL[ev.type]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium leading-snug text-ink">
                      {ev.title}
                    </p>
                  </div>
                  {ev.link && (
                    <Link
                      href={ev.link}
                      className="shrink-0 mt-0.5 text-xs font-semibold text-ember hover:underline underline-offset-2 whitespace-nowrap"
                    >
                      상세보기 →
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        <span className="text-xs font-medium text-slate">범례:</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ember/15 px-2.5 py-0.5 text-xs font-semibold text-ember border border-ember/20">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          아침 시험
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/15 px-2.5 py-0.5 text-xs font-semibold text-forest border border-forest/20">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          공채 D-day
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          공지 마감
        </span>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/student/schedule"
          className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
          </svg>
          시험 시간표 보기
        </Link>
        <Link
          href="/student/civil-exams"
          className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 0 1 8.75 1h2.5A2.75 2.75 0 0 1 14 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.83 2.54-1.952.599-4.024.921-6.17.921s-4.219-.322-6.17-.921C2.694 12.73 2 11.665 2 10.539V7.07c0-1.321.947-2.489 2.294-2.676A41.047 41.047 0 0 1 6 4.193V3.75Zm6.5 0v.325a41.622 41.622 0 0 0-5 0V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25ZM10 10a1 1 0 0 0-1 1v.01a1 1 0 0 0 2 0V11a1 1 0 0 0-1-1Z" clipRule="evenodd" />
            <path d="M3 15.055v-.684c.126.053.255.1.39.142 2.092.642 4.313.987 6.61.987 2.297 0 4.518-.345 6.61-.987.135-.041.264-.089.39-.142v.684c0 1.347-.985 2.53-2.363 2.686a41.454 41.454 0 0 1-9.274 0C3.985 17.585 3 16.402 3 15.055Z" />
          </svg>
          공채 시험 일정 보기
        </Link>
        <Link
          href="/student/notices"
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M4.214 3.227a.75.75 0 0 0-1.156-.956 8.97 8.97 0 0 0-1.856 3.826.75.75 0 0 0 1.466.316 7.47 7.47 0 0 1 1.546-3.186ZM16.942 2.271a.75.75 0 0 0-1.157.956 7.47 7.47 0 0 1 1.547 3.186.75.75 0 0 0 1.466-.316 8.971 8.971 0 0 0-1.856-3.826Z" />
            <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6Zm0 14.5a2 2 0 0 1-1.95-1.557 33.54 33.54 0 0 0 3.9 0A2 2 0 0 1 10 16.5Z" clipRule="evenodd" />
          </svg>
          공지사항 보기
        </Link>
      </div>
    </div>
  );
}
