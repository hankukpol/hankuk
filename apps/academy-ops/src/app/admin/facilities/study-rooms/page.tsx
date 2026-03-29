import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { BookingManager } from "../../study-rooms/booking-manager";
import type { StudyRoomRow, BookingRow } from "../../study-rooms/page";

export const dynamic = "force-dynamic";

export default async function FacilitiesStudyRoomsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayStr = todayDate.toISOString().slice(0, 10);

  const [rooms, todayBookings] = await Promise.all([
    getPrisma().studyRoom.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getPrisma().studyRoomBooking.findMany({
      where: { bookingDate: todayDate },
      include: {
        room: { select: { name: true } },
        student: { select: { name: true, generation: true } },
        assigner: { select: { name: true } },
      },
      orderBy: [{ roomId: "asc" }, { startTime: "asc" }],
    }),
  ]);

  const serializedBookings: BookingRow[] = todayBookings.map((b) => ({
    ...b,
    bookingDate: b.bookingDate.toISOString(),
  }));

  const confirmedCount = serializedBookings.filter((b) => b.status === "CONFIRMED").length;
  const occupiedRooms = new Set(
    serializedBookings.filter((b) => b.status === "CONFIRMED").map((b) => b.roomId),
  ).size;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">스터디룸 예약</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            날짜별 스터디룸 예약 현황을 확인하고 직원이 직접 배정합니다.
          </p>
        </div>
        <Link
          href="/admin/facilities/study-rooms/calendar"
          className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
        >
          주간 캘린더
        </Link>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="스터디룸" value={rooms.length} unit="개" />
        <KpiCard label="오늘 예약" value={confirmedCount} unit="건" />
        <KpiCard label="사용 중인 룸" value={occupiedRooms} unit="개" />
        <KpiCard label="여유 룸" value={rooms.length - occupiedRooms} unit="개" />
      </div>

      {/* Rooms at a glance */}
      {rooms.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          {rooms.map((room) => {
            const count = serializedBookings.filter(
              (b) => b.roomId === room.id && b.status === "CONFIRMED",
            ).length;
            return (
              <Link
                key={room.id}
                href={`/admin/facilities/study-rooms/${room.id}`}
                className={`rounded-[20px] border px-4 py-3 text-sm transition hover:shadow-md ${
                  count > 0
                    ? "border-ember/30 bg-ember/5 hover:border-ember/50"
                    : "border-forest/20 bg-forest/5 hover:border-forest/40"
                }`}
              >
                <p className="font-semibold text-ink">{room.name}</p>
                <p className="text-xs text-slate">
                  최대 {room.capacity}명 ·{" "}
                  {count > 0 ? (
                    <span className="text-ember font-medium">예약 {count}건</span>
                  ) : (
                    <span className="text-forest">여유</span>
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      {/* Main booking manager */}
      <div className="mt-10">
        <BookingManager
          initialRooms={rooms as StudyRoomRow[]}
          initialBookings={serializedBookings}
          todayStr={todayStr}
        />
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
