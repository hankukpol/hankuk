import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function formatHeaderDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "확정",
  CANCELLED: "취소",
  NOSHOW: "노쇼",
};

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: "border-forest/20 bg-forest/10 text-forest",
  CANCELLED: "border-ink/10 bg-mist text-slate line-through",
  NOSHOW: "border-red-200 bg-red-50 text-red-600",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingItem = {
  id: string;
  examNumber: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  note: string | null;
  studentName: string;
  studentGeneration: number | null;
  assignerName: string;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = { params: Promise<{ id: string }> };

export default async function StudyRoomDetailPage({ params }: PageProps) {
  const { id } = await params;
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const today = new Date();
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const todayStr = toDateStr(todayMidnight);

  // 7-day window: today ~ today+6
  const windowEnd = addDays(todayMidnight, 7);

  // Week for calendar (Mon–Sun containing today)
  const weekStart = getWeekStart(todayMidnight);
  const weekEnd = addDays(weekStart, 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [room, upcomingBookings, todayBookings] = await Promise.all([
    prisma.studyRoom.findUnique({ where: { id } }),
    // Upcoming: today ~ +30 days
    prisma.studyRoomBooking.findMany({
      where: {
        roomId: id,
        bookingDate: { gte: todayMidnight, lt: addDays(todayMidnight, 31) },
      },
      include: {
        student: { select: { name: true, generation: true } },
        assigner: { select: { name: true } },
      },
      orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
    }),
    // Today only for utilization
    prisma.studyRoomBooking.findMany({
      where: {
        roomId: id,
        bookingDate: todayMidnight,
        status: "CONFIRMED",
      },
    }),
    // Week for calendar
  ]);

  if (!room) notFound();

  // Fetch week bookings for calendar
  const weekBookings = await prisma.studyRoomBooking.findMany({
    where: {
      roomId: id,
      bookingDate: { gte: weekStart, lt: weekEnd },
      status: "CONFIRMED",
    },
    include: {
      student: { select: { name: true, generation: true } },
    },
    orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
  });

  // Serialize bookings
  const serialized: BookingItem[] = upcomingBookings.map((b) => ({
    id: b.id,
    examNumber: b.examNumber,
    bookingDate: toDateStr(b.bookingDate),
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    note: b.note,
    studentName: b.student.name,
    studentGeneration: b.student.generation,
    assignerName: b.assigner.name,
  }));

  // Build calendar map: dateStr -> BookingItem[]
  const calendarMap = new Map<string, typeof weekBookings>();
  for (const b of weekBookings) {
    const ds = toDateStr(b.bookingDate);
    if (!calendarMap.has(ds)) calendarMap.set(ds, []);
    calendarMap.get(ds)!.push(b);
  }

  // Stats
  const todayConfirmed = todayBookings.length;
  const weekConfirmed = weekBookings.length;
  const upcomingConfirmed = serialized.filter((b) => b.status === "CONFIRMED").length;

  // Window bookings (7-day)
  const windowBookings = serialized.filter(
    (b) =>
      b.status === "CONFIRMED" &&
      b.bookingDate >= todayStr &&
      b.bookingDate < toDateStr(windowEnd),
  );

  const prevWeekStr = toDateStr(addDays(weekStart, -7));
  const nextWeekStr = toDateStr(addDays(weekStart, 7));

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "시설 관리" },
          { label: "스터디룸", href: "/admin/facilities/study-rooms" },
          { label: room.name },
        ]}
      />

      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{room.name}</h1>
          <p className="mt-2 text-sm text-slate">
            최대 {room.capacity}명
            {room.description && (
              <span className="ml-2 text-slate/70">· {room.description}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/facilities/study-rooms"
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-slate hover:border-ink/40 hover:text-ink"
          >
            ← 목록으로
          </Link>
          <Link
            href="/admin/facilities/study-rooms/calendar"
            className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-5 py-2.5 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
          >
            주간 캘린더
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="오늘 예약" value={todayConfirmed} unit="건" />
        <KpiCard label="이번 주 예약" value={weekConfirmed} unit="건" />
        <KpiCard label="앞으로 7일" value={windowBookings.length} unit="건" />
        <KpiCard label="30일 내 총예약" value={upcomingConfirmed} unit="건" />
      </div>

      {/* Room info card */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-base font-semibold text-ink">룸 정보</h2>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
          <InfoRow label="룸 이름" value={room.name} />
          <InfoRow label="최대 정원" value={`${room.capacity}명`} />
          <InfoRow label="상태" value={room.isActive ? "운영 중" : "비활성"} />
          <InfoRow label="정렬 순서" value={`${room.sortOrder}`} />
          {room.description && (
            <div className="col-span-2 sm:col-span-4">
              <InfoRow label="설명" value={room.description} />
            </div>
          )}
        </div>
      </div>

      {/* Weekly calendar */}
      <div className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">주간 예약 현황</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/facilities/study-rooms/${id}?week=${prevWeekStr}`}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-slate hover:border-ink/40 hover:text-ink"
            >
              ← 이전 주
            </Link>
            <Link
              href={`/admin/facilities/study-rooms/${id}?week=${nextWeekStr}`}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-slate hover:border-ink/40 hover:text-ink"
            >
              다음 주 →
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 rounded-[24px] border border-ink/10 bg-white text-sm">
            <thead>
              <tr>
                {weekDays.map((day, idx) => {
                  const ds = toDateStr(day);
                  const isToday = ds === todayStr;
                  const isWeekend = idx >= 5;
                  return (
                    <th
                      key={ds}
                      className={`border-b border-r border-ink/10 px-3 py-3 text-center text-xs font-semibold last:border-r-0 ${
                        idx === 0 ? "rounded-tl-[24px]" : ""
                      } ${idx === 6 ? "rounded-tr-[24px]" : ""} ${
                        isToday
                          ? "bg-forest/10 text-forest"
                          : isWeekend
                            ? "bg-red-50/60 text-red-600"
                            : "bg-mist/60 text-slate"
                      }`}
                    >
                      <span className="block">{WEEKDAY_LABELS[idx]}</span>
                      <span
                        className={`mt-0.5 block text-base font-bold ${
                          isToday
                            ? "text-forest"
                            : isWeekend
                              ? "text-red-500"
                              : "text-ink"
                        }`}
                      >
                        {formatHeaderDate(day)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                {weekDays.map((day, dayIdx) => {
                  const ds = toDateStr(day);
                  const isToday = ds === todayStr;
                  const isWeekend = dayIdx >= 5;
                  const isLastDay = dayIdx === 6;
                  const cellBookings = calendarMap.get(ds) ?? [];

                  return (
                    <td
                      key={ds}
                      className={`align-top px-2 py-2 ${
                        isLastDay ? "rounded-br-[24px]" : "border-r border-ink/10"
                      } ${dayIdx === 0 ? "rounded-bl-[24px]" : ""} ${
                        isToday ? "bg-forest/5" : isWeekend ? "bg-red-50/30" : ""
                      }`}
                      style={{ minWidth: "100px" }}
                    >
                      {cellBookings.length === 0 ? (
                        <div className="flex h-14 items-center justify-center text-[10px] text-slate/40">
                          예약 없음
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {cellBookings.map((b) => (
                            <div
                              key={b.id}
                              title={`${b.student.name}${b.student.generation != null ? ` (${b.student.generation}기)` : ""} · ${b.startTime}~${b.endTime}`}
                              className="rounded-[8px] border border-sky-200 bg-sky-100 px-2 py-1.5 text-[10px] leading-tight"
                            >
                              <p className="truncate font-semibold text-sky-800">
                                {b.student.name}
                                {b.student.generation != null && (
                                  <span className="ml-1 opacity-70">
                                    {b.student.generation}기
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-sky-700">
                                {b.startTime}~{b.endTime}
                              </p>
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
      </div>

      {/* Upcoming bookings table */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-ink">
          예정 예약 (오늘 이후 30일)
        </h2>

        {serialized.length === 0 ? (
          <div className="rounded-[20px] border border-ink/10 bg-mist/50 py-14 text-center text-sm text-slate">
            예정된 예약이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate">
                    날짜
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate">
                    시간
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate">
                    학생
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate">
                    상태
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate">
                    배정 직원
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate">
                    메모
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {serialized.map((b) => (
                  <tr
                    key={b.id}
                    className={`transition hover:bg-mist/40 ${
                      b.bookingDate === todayStr ? "bg-forest/5" : ""
                    }`}
                  >
                    <td className="px-5 py-3.5 font-medium text-ink">
                      {b.bookingDate === todayStr ? (
                        <span className="text-forest font-semibold">
                          오늘 ({b.bookingDate})
                        </span>
                      ) : (
                        b.bookingDate
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-ink">
                      {b.startTime} ~ {b.endTime}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/admin/students/${b.examNumber}`}
                        className="font-medium text-ink transition hover:text-ember"
                      >
                        {b.studentName}
                        {b.studentGeneration != null && (
                          <span className="ml-1 text-xs text-slate">
                            {b.studentGeneration}기
                          </span>
                        )}
                      </Link>
                      <p className="text-xs text-slate">{b.examNumber}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          STATUS_COLOR[b.status] ??
                          "border-ink/10 bg-mist text-slate"
                        }`}
                      >
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate">{b.assignerName}</td>
                    <td className="px-5 py-3.5 text-slate">
                      {b.note ?? (
                        <span className="text-slate/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
      <p className="text-xs font-medium text-slate">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">
        {value}
        <span className="ml-1 text-sm font-normal text-slate">{unit}</span>
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
    </div>
  );
}
