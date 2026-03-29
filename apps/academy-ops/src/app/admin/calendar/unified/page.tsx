import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── helpers ───────────────────────────────────────────────────────────────────

function padZero(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
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

function getSubjectLabel(subject: string): string {
  const labels: Record<string, string> = {
    POLICE_SCIENCE: "경찰학",
    CONSTITUTIONAL_LAW: "헌법",
    CRIMINOLOGY: "범죄학",
    CRIMINAL_PROCEDURE: "형사소송법",
    CRIMINAL_LAW: "형법",
    CUMULATIVE: "누적",
  };
  return labels[subject] ?? subject;
}

// ── types ────────────────────────────────────────────────────────────────────

type EventColor = "blue" | "purple" | "amber" | "gray";

interface CalendarEvent {
  id: string;
  date: string; // "YYYY-MM-DD"
  type: "EXAM_SESSION" | "STUDY_ROOM" | "PAYMENT_DEADLINE";
  title: string;
  color: EventColor;
  link: string;
}

// ── color maps ────────────────────────────────────────────────────────────────

const COLOR_DOT: Record<EventColor, string> = {
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  amber: "bg-amber-500",
  gray: "bg-slate/40",
};

const COLOR_BADGE: Record<EventColor, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  gray: "bg-slate/10 text-slate border-slate/20",
};

const COLOR_PANEL: Record<EventColor, string> = {
  blue: "border-l-blue-500 bg-blue-50",
  purple: "border-l-purple-500 bg-purple-50",
  amber: "border-l-amber-500 bg-amber-50",
  gray: "border-l-slate/30 bg-slate/5",
};

// ── page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnifiedCalendarPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);

  const resolvedSearch = searchParams ? await searchParams : {};

  const rawYear = Array.isArray(resolvedSearch?.year)
    ? resolvedSearch.year[0]
    : resolvedSearch?.year;
  const rawMonth = Array.isArray(resolvedSearch?.month)
    ? resolvedSearch.month[0]
    : resolvedSearch?.month;

  const now = new Date();
  const year =
    rawYear && !isNaN(parseInt(rawYear, 10)) ? parseInt(rawYear, 10) : now.getFullYear();
  const month =
    rawMonth && !isNaN(parseInt(rawMonth, 10)) && parseInt(rawMonth, 10) >= 1 && parseInt(rawMonth, 10) <= 12
      ? parseInt(rawMonth, 10)
      : now.getMonth() + 1;

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // Payment deadline: endDate within next 7 days from today
  const deadlineStart = new Date();
  deadlineStart.setHours(0, 0, 0, 0);
  const deadlineEnd = new Date(deadlineStart);
  deadlineEnd.setDate(deadlineEnd.getDate() + 7);

  const prisma = getPrisma();

  const [examSessions, studyRoomBookings, expiringEnrollments] = await Promise.all([
    prisma.examSession.findMany({
      where: {
        examDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        examType: true,
        examDate: true,
        week: true,
        subject: true,
        displaySubjectName: true,
        isCancelled: true,
        period: { select: { id: true, name: true } },
      },
      orderBy: { examDate: "asc" },
    }),
    prisma.studyRoomBooking.findMany({
      where: {
        bookingDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        bookingDate: true,
        startTime: true,
        endTime: true,
        status: true,
        room: { select: { name: true } },
        student: { select: { name: true, examNumber: true } },
      },
      orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
    }),
    prisma.courseEnrollment.findMany({
      where: {
        endDate: { gte: deadlineStart, lte: deadlineEnd },
        status: "ACTIVE",
      },
      select: {
        id: true,
        endDate: true,
        examNumber: true,
        student: { select: { name: true, examNumber: true } },
        cohort: { select: { name: true } },
        product: { select: { name: true } },
      },
      orderBy: { endDate: "asc" },
    }),
  ]);

  // ── Build events ──────────────────────────────────────────────────────────

  const events: CalendarEvent[] = [];

  // Exam sessions → blue
  for (const session of examSessions) {
    const dateKey = toDateKey(session.examDate);
    const examTypeLabel = session.examType === "GONGCHAE" ? "공채" : "경채";
    const subjectLabel =
      session.displaySubjectName?.trim() || getSubjectLabel(session.subject);
    const title = `${examTypeLabel} ${session.week}회차 ${subjectLabel}`;

    events.push({
      id: `exam-${session.id}`,
      date: dateKey,
      type: "EXAM_SESSION",
      title: session.isCancelled ? `[취소] ${title}` : title,
      color: session.isCancelled ? "gray" : "blue",
      link: `/admin/periods`,
    });
  }

  // Study room bookings → purple (group by date+room)
  const studyByDate: Record<string, typeof studyRoomBookings> = {};
  for (const b of studyRoomBookings) {
    const dateKey = toDateKey(b.bookingDate);
    if (!studyByDate[dateKey]) studyByDate[dateKey] = [];
    studyByDate[dateKey].push(b);
  }
  for (const [dateKey, bookings] of Object.entries(studyByDate)) {
    events.push({
      id: `study-${dateKey}`,
      date: dateKey,
      type: "STUDY_ROOM",
      title: `스터디룸 예약 ${bookings.length}건`,
      color: "purple",
      link: `/admin/study-rooms`,
    });
  }

  // Payment deadlines → amber (show in both the deadline day and current month view)
  for (const enroll of expiringEnrollments) {
    if (!enroll.endDate) continue;
    const dateKey = toDateKey(enroll.endDate);
    // Only show if within current month view
    if (dateKey >= toDateKey(monthStart) && dateKey <= toDateKey(monthEnd)) {
      const courseName =
        enroll.cohort?.name ?? enroll.product?.name ?? "수강";
      events.push({
        id: `deadline-${enroll.id}`,
        date: dateKey,
        type: "PAYMENT_DEADLINE",
        title: `수강만료: ${enroll.student.name} (${courseName})`,
        color: "amber",
        link: `/admin/students/${enroll.student.examNumber}/enrollments`,
      });
    }
  }

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date));

  // ── Build calendar grid ───────────────────────────────────────────────────

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const cells: Array<{ day: number | null; dateKey: string | null }> = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDayOfWeek + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ day: null, dateKey: null });
    } else {
      cells.push({
        day: dayNum,
        dateKey: `${year}-${padZero(month)}-${padZero(dayNum)}`,
      });
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
  const todayKey = toDateKey(today);

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);

  // KPI counts
  const examCount = events.filter(
    (e) => e.type === "EXAM_SESSION" && e.color !== "gray"
  ).length;
  const studyCount = studyRoomBookings.length;
  const deadlineCount = expiringEnrollments.length;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 sm:p-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/calendar"
          className="text-sm text-slate transition hover:text-ember"
        >
          ← 일정 캘린더
        </Link>
      </div>

      <div className="mt-4 inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        통합 일정
      </div>
      <h1 className="mt-4 text-3xl font-semibold">통합 관리자 캘린더</h1>
      <p className="mt-2 text-sm leading-7 text-slate">
        시험 회차 · 스터디룸 예약 · 수강 만료 예정을 한 달력에서 확인합니다.
      </p>

      {/* KPI row */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <article className="rounded-[20px] border border-blue-200 bg-blue-50/60 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            시험 회차
          </p>
          <p className="mt-3 text-3xl font-semibold text-blue-700">{examCount}회</p>
          <p className="mt-1 text-xs text-blue-600">이번 달 예정</p>
        </article>
        <article className="rounded-[20px] border border-purple-200 bg-purple-50/60 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-purple-700">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            스터디룸 예약
          </p>
          <p className="mt-3 text-3xl font-semibold text-purple-700">{studyCount}건</p>
          <p className="mt-1 text-xs text-purple-600">이번 달 확정</p>
        </article>
        <article className="rounded-[20px] border border-amber-200 bg-amber-50/60 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-700">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            수강 만료 예정
          </p>
          <p className="mt-3 text-3xl font-semibold text-amber-700">{deadlineCount}건</p>
          <p className="mt-1 text-xs text-amber-600">7일 이내</p>
        </article>
      </div>

      {/* Calendar card */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        {/* Month navigation */}
        <div className="flex items-center justify-between border-b border-ink/5 px-5 py-4">
          <Link
            href={`/admin/calendar/unified?year=${prev.year}&month=${prev.month}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:bg-mist hover:text-ink"
            aria-label="이전 달"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <div className="text-center">
            <p className="text-lg font-semibold text-ink">
              {year}년 {MONTH_KO[month - 1]}
            </p>
          </div>

          <Link
            href={`/admin/calendar/unified?year=${next.year}&month=${next.month}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:bg-mist hover:text-ink"
            aria-label="다음 달"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
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

        {/* Calendar grid */}
        <div className="grid grid-cols-7 divide-x divide-ink/5">
          {cells.map((cell, idx) => {
            const isToday = cell.dateKey === todayKey;
            const dayEvents = cell.dateKey ? (eventsByDate[cell.dateKey] ?? []) : [];
            const colIndex = idx % 7;
            const MAX_VISIBLE = 3;
            const visibleEvents = dayEvents.slice(0, MAX_VISIBLE);
            const overflow = dayEvents.length - MAX_VISIBLE;

            return (
              <div
                key={idx}
                className={`min-h-[100px] border-b border-ink/5 p-1.5 ${
                  cell.day === null
                    ? "bg-mist/40"
                    : "bg-white"
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
                        <Link
                          key={ev.id}
                          href={ev.link}
                          title={ev.title}
                          className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight border transition hover:opacity-80 ${COLOR_BADGE[ev.color]}`}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_DOT[ev.color]}`} />
                          <span className="truncate">{ev.title}</span>
                        </Link>
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

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-slate">범례:</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          시험 회차
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
          스터디룸 예약
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          수강 만료 예정 (7일 이내)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate/20 bg-slate/10 px-2.5 py-0.5 text-xs font-semibold text-slate">
          <span className="h-1.5 w-1.5 rounded-full bg-slate/40" />
          취소
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/15 px-2.5 py-0.5 text-xs font-semibold text-ember">
          오늘 (ember 배경)
        </span>
      </div>

      {/* Expiring enrollments table */}
      {expiringEnrollments.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            7일 이내 수강 만료 예정
          </h2>
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist text-left text-xs text-slate">
                    <th className="px-5 py-3 font-semibold">학생</th>
                    <th className="px-4 py-3 font-semibold">강좌/기수</th>
                    <th className="px-4 py-3 font-semibold">만료일</th>
                    <th className="px-4 py-3 font-semibold">바로가기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {expiringEnrollments.map((enroll) => {
                    const courseName =
                      enroll.cohort?.name ?? enroll.product?.name ?? "—";
                    const daysLeft = enroll.endDate
                      ? Math.ceil(
                          (new Date(enroll.endDate).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : null;
                    return (
                      <tr key={enroll.id} className="transition hover:bg-mist/40">
                        <td className="px-5 py-3">
                          <Link
                            href={`/admin/students/${enroll.student.examNumber}`}
                            className="font-medium text-ink hover:text-ember"
                          >
                            {enroll.student.name}
                          </Link>
                          <span className="ml-1.5 font-mono text-xs text-slate">
                            {enroll.student.examNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate">
                          {courseName}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono text-amber-700">
                            {enroll.endDate
                              ? toDateKey(new Date(enroll.endDate))
                              : "—"}
                          </span>
                          {daysLeft !== null && (
                            <span
                              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                daysLeft <= 1
                                  ? "bg-red-100 text-red-600"
                                  : daysLeft <= 3
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-amber-50 text-amber-600"
                              }`}
                            >
                              D-{daysLeft}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/students/${enroll.student.examNumber}/enrollments`}
                            className="text-xs font-semibold text-ember hover:underline"
                          >
                            수강 상세 →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
