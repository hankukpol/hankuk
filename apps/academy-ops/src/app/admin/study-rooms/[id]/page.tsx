import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { RoomDetailClient, type BookingRowDetail } from "./room-detail-client";

export const dynamic = "force-dynamic";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudyRoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const { id } = await params;

  // Fetch room with recent bookings (last 50, descending)
  const room = await getPrisma().studyRoom.findUnique({
    where: { id },
    include: {
      bookings: {
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              generation: true,
              phone: true,
            },
          },
          assigner: { select: { name: true } },
        },
        orderBy: [{ bookingDate: "desc" }, { startTime: "desc" }],
        take: 50,
      },
    },
  });

  if (!room) notFound();

  // ── Aggregate stats (all-time) ─────────────────────────────────────────────
  const allBookings = await getPrisma().studyRoomBooking.findMany({
    where: { roomId: id },
    select: { status: true, examNumber: true },
  });

  const totalBookings = allBookings.length;
  const confirmedBookings = allBookings.filter((b) => b.status === "CONFIRMED").length;
  const cancelledBookings = allBookings.filter((b) => b.status === "CANCELLED").length;
  const noshowBookings = allBookings.filter((b) => b.status === "NOSHOW").length;
  const uniqueStudents = new Set(allBookings.map((b) => b.examNumber)).size;

  // ── Monthly stats ─────────────────────────────────────────────────────────
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const monthlyBookingsRaw = await getPrisma().studyRoomBooking.findMany({
    where: {
      roomId: id,
      bookingDate: { gte: monthStart, lte: monthEnd },
    },
    select: {
      status: true,
      examNumber: true,
      startTime: true,
      endTime: true,
      student: { select: { name: true } },
    },
  });

  const monthlyConfirmed = monthlyBookingsRaw.filter((b) => b.status === "CONFIRMED");
  const monthlyTotal = monthlyBookingsRaw.length;

  // Top 3 bookers this month (by confirmed booking count)
  const bookerMap = new Map<string, { name: string; count: number }>();
  for (const b of monthlyBookingsRaw) {
    if (b.status !== "CONFIRMED") continue;
    const entry = bookerMap.get(b.examNumber);
    if (entry) {
      entry.count += 1;
    } else {
      bookerMap.set(b.examNumber, { name: b.student.name, count: 1 });
    }
  }
  const topBookers = Array.from(bookerMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([examNumber, { name, count }]) => ({ examNumber, name, count }));

  // Utilization rate: booked confirmed hours / available hours this month
  // Available hours = operating hours per day * working days in month
  // Operating hours: 09:00~21:00 weekdays (12h), 09:00~18:00 weekends (9h)
  const daysInMonth = monthEnd.getDate();
  let availableHours = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(now.getFullYear(), now.getMonth(), d).getDay();
    availableHours += dayOfWeek === 0 || dayOfWeek === 6 ? 9 : 12;
  }

  // Confirmed booked hours this month
  let bookedHours = 0;
  for (const b of monthlyConfirmed) {
    const [sh, sm] = b.startTime.split(":").map(Number);
    const [eh, em] = b.endTime.split(":").map(Number);
    const hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
    if (hours > 0) bookedHours += hours;
  }

  const utilizationRate =
    availableHours > 0 ? Math.round((bookedHours / availableHours) * 100) : 0;

  const monthlyStats = {
    monthLabel: `${now.getFullYear()}년 ${now.getMonth() + 1}월`,
    totalBookings: monthlyTotal,
    confirmedBookings: monthlyConfirmed.length,
    bookedHours: Math.round(bookedHours * 10) / 10,
    availableHours,
    utilizationRate,
    topBookers,
  };

  // ── Serialize dates ────────────────────────────────────────────────────────
  const serializedRoom = {
    id: room.id,
    name: room.name,
    capacity: room.capacity,
    description: room.description,
    isActive: room.isActive,
    sortOrder: room.sortOrder,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };

  const serializedBookings: BookingRowDetail[] = room.bookings.map((b) => ({
    id: b.id,
    roomId: b.roomId,
    examNumber: b.examNumber,
    bookingDate: b.bookingDate.toISOString(),
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    note: b.note,
    createdAt: b.createdAt.toISOString(),
    student: b.student,
    assigner: b.assigner,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/study-rooms" className="hover:text-ink transition-colors">
          시설 관리
        </Link>
        <span className="text-slate/50">/</span>
        <span className="text-ink">스터디룸 상세</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            스터디룸 상세
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">{room.name}</h1>
          <p className="mt-2 text-sm text-slate">
            수용 {room.capacity}명
            {room.description ? ` · ${room.description}` : ""}
            {" · "}
            <span className={room.isActive ? "text-forest" : "text-slate"}>
              {room.isActive ? "운영 중" : "비활성"}
            </span>
          </p>
        </div>

        <Link
          href="/admin/study-rooms"
          className="rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-slate hover:border-ink/40 hover:text-ink transition-colors"
        >
          ← 목록으로
        </Link>
      </div>

      {/* Detail content */}
      <div className="mt-10">
        <RoomDetailClient
          room={serializedRoom}
          recentBookings={serializedBookings}
          stats={{
            totalBookings,
            confirmedBookings,
            cancelledBookings,
            noshowBookings,
            uniqueStudents,
          }}
          monthlyStats={monthlyStats}
        />
      </div>
    </div>
  );
}
