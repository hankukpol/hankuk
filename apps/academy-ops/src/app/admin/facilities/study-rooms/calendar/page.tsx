import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Room color palette (cycles through rooms) ────────────────────────────────

const ROOM_COLORS = [
  { bg: "bg-sky-100", text: "text-sky-800", border: "border-sky-200" },
  { bg: "bg-violet-100", text: "text-violet-800", border: "border-violet-200" },
  { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
  { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-200" },
  { bg: "bg-teal-100", text: "text-teal-800", border: "border-teal-200" },
  { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse "YYYY-MM-DD" string into a local Date at midnight.
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/**
 * Format a Date to "YYYY-MM-DD" in local time.
 */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Return the Monday of the week that contains `date`.
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Advance a date by `days` days (returns a new Date).
 */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function formatHeaderDate(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RoomInfo = {
  id: string;
  name: string;
  capacity: number;
  colorIndex: number;
};

type BookingCell = {
  id: string;
  studentName: string;
  generation: number | null;
  startTime: string;
  endTime: string;
  status: string;
  note: string | null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: { week?: string };
}

export default async function StudyRoomCalendarPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  // Determine week start (Monday)
  const today = new Date();
  const weekParam = searchParams.week;
  const baseDate = weekParam ? parseLocalDate(weekParam) : today;
  const weekStart = getWeekStart(baseDate);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7); // exclusive

  const prevWeekStr = toDateStr(addDays(weekStart, -7));
  const nextWeekStr = toDateStr(addDays(weekStart, 7));
  const thisWeekStr = toDateStr(getWeekStart(today));

  // Fetch rooms + bookings for the full week
  const [rooms, bookings] = await Promise.all([
    getPrisma().studyRoom.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getPrisma().studyRoomBooking.findMany({
      where: {
        bookingDate: {
          gte: weekStart,
          lt: weekEnd,
        },
        status: "CONFIRMED",
      },
      include: {
        student: { select: { name: true, generation: true } },
      },
      orderBy: [{ bookingDate: "asc" }, { roomId: "asc" }, { startTime: "asc" }],
    }),
  ]);

  // Map rooms with color indices
  const roomInfos: RoomInfo[] = rooms.map((r, i) => ({
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    colorIndex: i % ROOM_COLORS.length,
  }));

  // Build lookup: dayStr -> roomId -> BookingCell[]
  const bookingMap = new Map<string, Map<string, BookingCell[]>>();

  for (const b of bookings) {
    const dayStr = toDateStr(b.bookingDate);
    if (!bookingMap.has(dayStr)) {
      bookingMap.set(dayStr, new Map());
    }
    const dayMap = bookingMap.get(dayStr)!;
    if (!dayMap.has(b.roomId)) {
      dayMap.set(b.roomId, []);
    }
    dayMap.get(b.roomId)!.push({
      id: b.id,
      studentName: b.student.name,
      generation: b.student.generation,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      note: b.note,
    });
  }

  const todayStr = toDateStr(today);

  // Count total bookings this week
  const totalConfirmed = bookings.length;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">스터디룸 주간 캘린더</h1>
          <p className="mt-2 text-sm text-slate">
            {weekStart.getFullYear()}년 {weekStart.getMonth() + 1}월{" "}
            {weekStart.getDate()}일 ~ {weekDays[6]!.getMonth() + 1}월{" "}
            {weekDays[6]!.getDate()}일 &middot; 확정 예약{" "}
            <strong className="text-ink">{totalConfirmed}</strong>건
          </p>
        </div>
        <Link
          href="/admin/facilities/study-rooms"
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-slate hover:border-ink/40 hover:text-ink"
        >
          ← 예약 관리로
        </Link>
      </div>

      {/* Week navigation */}
      <div className="mt-8 flex items-center gap-3">
        <Link
          href={`/admin/facilities/study-rooms/calendar?week=${prevWeekStr}`}
          className="rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-slate hover:border-ink/40 hover:text-ink"
        >
          ← 이전 주
        </Link>
        {thisWeekStr !== toDateStr(weekStart) && (
          <Link
            href={`/admin/facilities/study-rooms/calendar?week=${thisWeekStr}`}
            className="rounded-full border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-medium text-forest hover:bg-forest/10"
          >
            이번 주
          </Link>
        )}
        <Link
          href={`/admin/facilities/study-rooms/calendar?week=${nextWeekStr}`}
          className="rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-slate hover:border-ink/40 hover:text-ink"
        >
          다음 주 →
        </Link>
      </div>

      {/* Room legend */}
      {roomInfos.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {roomInfos.map((room) => {
            const c = ROOM_COLORS[room.colorIndex]!;
            return (
              <span
                key={room.id}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${c.bg} ${c.text} ${c.border}`}
              >
                {room.name} (최대 {room.capacity}명)
              </span>
            );
          })}
        </div>
      )}

      {/* Weekly calendar table */}
      {rooms.length === 0 ? (
        <div className="mt-10 rounded-[20px] border border-ink/10 bg-mist/50 py-16 text-center text-sm text-slate">
          등록된 스터디룸이 없습니다.{" "}
          <Link href="/admin/settings/study-rooms" className="underline hover:text-ink">
            스터디룸 설정
          </Link>
          에서 먼저 추가하세요.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 rounded-[24px] border border-ink/10 bg-white text-sm">
            <thead>
              <tr>
                {/* Room column header */}
                <th className="rounded-tl-[24px] border-b border-r border-ink/10 bg-mist/60 px-4 py-3 text-left text-xs font-semibold text-slate">
                  룸
                </th>
                {weekDays.map((day, idx) => {
                  const dayStr = toDateStr(day);
                  const isToday = dayStr === todayStr;
                  const isWeekend = idx >= 5; // Sat(5) or Sun(6)
                  return (
                    <th
                      key={dayStr}
                      className={`border-b border-r border-ink/10 px-3 py-3 text-center text-xs font-semibold last:border-r-0 ${
                        idx === 6 ? "rounded-tr-[24px]" : ""
                      } ${isToday ? "bg-forest/10 text-forest" : isWeekend ? "bg-red-50/60 text-red-600" : "bg-mist/60 text-slate"}`}
                    >
                      <span className="block">{WEEKDAY_LABELS[idx]}</span>
                      <span
                        className={`mt-0.5 block text-base font-bold ${isToday ? "text-forest" : isWeekend ? "text-red-500" : "text-ink"}`}
                      >
                        {formatHeaderDate(day)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {roomInfos.map((room, roomIdx) => {
                const c = ROOM_COLORS[room.colorIndex]!;
                const isLastRoom = roomIdx === roomInfos.length - 1;
                return (
                  <tr key={room.id}>
                    {/* Room name cell */}
                    <td
                      className={`border-r border-ink/10 bg-mist/30 px-4 py-3 align-top font-medium text-ink ${
                        isLastRoom ? "rounded-bl-[24px]" : "border-b"
                      }`}
                    >
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}
                      >
                        {room.name}
                      </span>
                      <p className="mt-1 text-[10px] text-slate">최대 {room.capacity}명</p>
                    </td>

                    {/* Day cells */}
                    {weekDays.map((day, dayIdx) => {
                      const dayStr = toDateStr(day);
                      const isToday = dayStr === todayStr;
                      const isWeekend = dayIdx >= 5;
                      const isLastDay = dayIdx === 6;
                      const cellBookings = bookingMap.get(dayStr)?.get(room.id) ?? [];

                      return (
                        <td
                          key={dayStr}
                          className={`align-top px-2 py-2 ${isLastDay ? "" : "border-r border-ink/10"} ${
                            isLastRoom ? (isLastDay ? "rounded-br-[24px]" : "") : "border-b border-ink/10"
                          } ${isToday ? "bg-forest/5" : isWeekend ? "bg-red-50/30" : ""}`}
                          style={{ minWidth: "110px", maxWidth: "160px" }}
                        >
                          {cellBookings.length === 0 ? (
                            <div className="flex h-12 items-center justify-center text-[10px] text-slate/40">
                              —
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {cellBookings.map((b) => (
                                <div
                                  key={b.id}
                                  title={`${b.studentName}${b.generation != null ? ` (${b.generation}기)` : ""} · ${b.startTime}~${b.endTime}${b.note ? ` · ${b.note}` : ""}`}
                                  className={`rounded-[8px] border px-2 py-1.5 text-[10px] leading-tight ${c.bg} ${c.border}`}
                                >
                                  <p className={`truncate font-semibold ${c.text}`}>
                                    {b.studentName}
                                    {b.generation != null && (
                                      <span className="ml-1 opacity-70">{b.generation}기</span>
                                    )}
                                  </p>
                                  <p className="mt-0.5 opacity-80">
                                    {b.startTime}~{b.endTime}
                                  </p>
                                  {b.note && (
                                    <p className="mt-0.5 truncate italic opacity-60">{b.note}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state for current week with no bookings */}
      {rooms.length > 0 && totalConfirmed === 0 && (
        <p className="mt-6 text-center text-sm text-slate">이번 주 확정된 예약이 없습니다.</p>
      )}
    </div>
  );
}
