import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingEntry = {
  id: string;
  roomId: string;
  roomName: string;
  examNumber: string;
  studentName: string;
  startTime: string;
  endTime: string;
  date: string;
  status: string;
  note: string | null;
};

type WeekData = {
  weekStart: string;
  weekEnd: string;
  weekDates: string[]; // 7 dates Mon-Sun
  rooms: { id: string; name: string; capacity: number }[];
  days: BookingEntry[][];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "bg-forest/10 border-forest/30 text-forest",
  PENDING:   "bg-amber-50 border-amber-300 text-amber-800",
  CANCELLED: "bg-ink/5 border-ink/10 text-slate",
  NOSHOW:    "bg-red-50 border-red-300 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "확정",
  PENDING:   "대기",
  CANCELLED: "취소",
  NOSHOW:    "노쇼",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOf(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const rawDay = d.getDay(); // 0=Sun
  const dayFromMon = rawDay === 0 ? 6 : rawDay - 1;
  d.setDate(d.getDate() - dayFromMon);
  return d;
}

function formatDateKo(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchWeekData(dateStr: string, roomId: string | null): Promise<WeekData> {
  const monday = getMondayOf(dateStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const rooms = await getPrisma().studyRoom.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, capacity: true },
  });

  const whereClause: Record<string, unknown> = {
    bookingDate: { gte: monday, lte: sunday },
  };
  if (roomId) whereClause.roomId = roomId;

  const bookings = await getPrisma().studyRoomBooking.findMany({
    where: whereClause,
    include: {
      room: { select: { name: true } },
      student: { select: { name: true, examNumber: true } },
    },
    orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
  });

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const days: BookingEntry[][] = Array.from({ length: 7 }, () => []);

  for (const b of bookings) {
    const bDate = new Date(b.bookingDate);
    bDate.setHours(0, 0, 0, 0);
    const diffMs = bDate.getTime() - monday.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 6) continue;
    days[diffDays].push({
      id: b.id,
      roomId: b.roomId,
      roomName: b.room.name,
      examNumber: b.examNumber,
      studentName: b.student.name,
      startTime: b.startTime,
      endTime: b.endTime,
      date: bDate.toISOString().slice(0, 10),
      status: b.status,
      note: b.note,
    });
  }

  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
    weekDates,
    rooms,
    days,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudyRoomCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; roomId?: string }>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const dateParam = params.date ?? today;
  const roomIdParam = params.roomId ?? null;

  const data = await fetchWeekData(dateParam, roomIdParam);

  const prevWeek = addDays(data.weekStart, -7);
  const nextWeek = addDays(data.weekStart, 7);

  // Build query string helper
  function weekHref(weekStart: string) {
    const q = new URLSearchParams({ date: weekStart });
    if (roomIdParam) q.set("roomId", roomIdParam);
    return `/admin/study-rooms/calendar?${q.toString()}`;
  }

  function roomHref(rId: string | null) {
    const q = new URLSearchParams({ date: dateParam });
    if (rId) q.set("roomId", rId);
    return `/admin/study-rooms/calendar?${q.toString()}`;
  }

  // Summary counts
  const allBookings = data.days.flat();
  const confirmedCount = allBookings.filter((b) => b.status === "CONFIRMED").length;
  const pendingCount = allBookings.filter((b) => b.status === "PENDING").length;

  // Week label
  const weekLabel = (() => {
    const s = new Date(data.weekStart);
    const e = new Date(data.weekEnd);
    return `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}일 ~ ${e.getMonth() + 1}월 ${e.getDate()}일`;
  })();

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/study-rooms" className="transition-colors hover:text-ink">
          스터디룸 관리
        </Link>
        <span className="text-slate/50">/</span>
        <span className="text-ink">주간 캘린더</span>
      </div>

      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">스터디룸 주간 캘린더</h1>
          <p className="mt-2 text-sm leading-7 text-slate">
            한 주간 스터디룸 예약 현황을 한눈에 확인합니다.
          </p>
        </div>
        <Link
          href="/admin/study-rooms"
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          ← 목록으로
        </Link>
      </div>

      {/* Week navigation */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-ink/10 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href={weekHref(prevWeek)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ←
          </Link>
          <span className="min-w-[280px] text-center text-sm font-semibold text-ink">
            {weekLabel}
          </span>
          <Link
            href={weekHref(nextWeek)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-slate transition hover:border-ink/30 hover:text-ink"
          >
            →
          </Link>
        </div>
        <Link
          href={roomHref(null).replace(dateParam, today)}
          className="rounded-full border border-forest/30 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          이번 주
        </Link>
      </div>

      {/* Room filter + summary */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={roomHref(null)}
          className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
            !roomIdParam
              ? "border-ink bg-ink text-white"
              : "border-ink/15 bg-white text-slate hover:border-ink/30 hover:text-ink"
          }`}
        >
          전체
        </Link>
        {data.rooms.map((room) => (
          <Link
            key={room.id}
            href={roomHref(room.id)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              roomIdParam === room.id
                ? "border-forest bg-forest text-white"
                : "border-ink/15 bg-white text-slate hover:border-ink/30 hover:text-ink"
            }`}
          >
            {room.name}
          </Link>
        ))}

        <div className="ml-auto flex items-center gap-4 text-xs text-slate">
          <span>
            확정{" "}
            <span className="font-semibold text-forest">{confirmedCount}건</span>
          </span>
          {pendingCount > 0 && (
            <span>
              대기{" "}
              <span className="font-semibold text-amber-700">{pendingCount}건</span>
            </span>
          )}
        </div>
      </div>

      {/* Weekly grid table */}
      <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10 shadow-sm">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-mist">
              {DAY_LABELS.map((label, i) => {
                const dateStr = data.weekDates[i];
                const todayMark = isToday(dateStr);
                return (
                  <th
                    key={i}
                    className={`border-b border-ink/10 px-3 py-3 text-center text-xs font-semibold ${
                      todayMark ? "text-ember" : i >= 5 ? "text-sky-600" : "text-slate"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{label}</span>
                      <span
                        className={`text-[11px] font-normal ${
                          todayMark
                            ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-ember text-white"
                            : ""
                        }`}
                      >
                        {formatDateKo(dateStr)}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="align-top">
              {data.days.map((dayBookings, i) => {
                const dateStr = data.weekDates[i];
                const todayMark = isToday(dateStr);
                return (
                  <td
                    key={i}
                    className={`min-w-[130px] border-r border-ink/5 px-2 py-3 align-top last:border-r-0 ${
                      todayMark ? "bg-ember/3" : ""
                    } ${i >= 5 ? "bg-sky-50/40" : ""}`}
                  >
                    {dayBookings.length === 0 ? (
                      <p className="py-4 text-center text-[11px] text-slate/50">예약 없음</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {dayBookings.map((b) => (
                          <div
                            key={b.id}
                            className={`rounded-[10px] border px-2.5 py-2 text-xs ${
                              STATUS_STYLE[b.status] ?? "bg-ink/5 border-ink/10 text-slate"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-semibold leading-tight">{b.roomName}</span>
                              <span className="shrink-0 rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-medium leading-none">
                                {STATUS_LABEL[b.status] ?? b.status}
                              </span>
                            </div>
                            <Link
                              href={`/admin/students/${b.examNumber}`}
                              className="mt-1 block font-medium hover:underline"
                            >
                              {b.studentName}
                            </Link>
                            <p className="mt-0.5 font-mono text-[11px] opacity-70">
                              {b.startTime} ~ {b.endTime}
                            </p>
                            {b.note && (
                              <p className="mt-0.5 truncate text-[10px] opacity-60">{b.note}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate">
        <span className="font-medium">범례:</span>
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-3 rounded-sm border ${STATUS_STYLE[key] ?? ""}`}
            />
            {label}
          </span>
        ))}
      </div>

      {/* Total stats */}
      {allBookings.length === 0 && (
        <div className="mt-8 rounded-[20px] border border-dashed border-ink/10 py-12 text-center text-sm text-slate">
          이번 주 예약이 없습니다.
        </div>
      )}
    </div>
  );
}
