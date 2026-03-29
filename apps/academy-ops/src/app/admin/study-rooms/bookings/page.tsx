import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { BookingsManagementClient } from "./bookings-management-client";

export const dynamic = "force-dynamic";

export type BookingDetailRow = {
  id: string;
  roomId: string;
  roomName: string;
  examNumber: string;
  studentName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  note: string | null;
  assignerName: string;
  createdAt: string;
};

export type StudyRoomSummary = {
  id: string;
  name: string;
  capacity: number;
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function pick(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = params?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function StudyRoomBookingsManagementPage({
  searchParams,
}: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const resolvedParams = searchParams ? await searchParams : {};
  const dateParam = pick(resolvedParams, "date");

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const activeDate = dateParam ?? todayStr;
  const dateObj = new Date(activeDate);

  const prisma = getPrisma();

  const [rooms, bookings] = await Promise.all([
    prisma.studyRoom.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, capacity: true },
    }),
    prisma.studyRoomBooking.findMany({
      where: { bookingDate: dateObj },
      include: {
        room: { select: { name: true } },
        student: { select: { name: true } },
        assigner: { select: { name: true } },
      },
      orderBy: [{ startTime: "asc" }, { roomId: "asc" }],
    }),
  ]);

  const serializedBookings: BookingDetailRow[] = bookings.map((b) => ({
    id: b.id,
    roomId: b.roomId,
    roomName: b.room.name,
    examNumber: b.examNumber,
    studentName: b.student.name,
    bookingDate: b.bookingDate.toISOString(),
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    note: b.note ?? null,
    assignerName: b.assigner.name,
    createdAt: b.createdAt.toISOString(),
  }));

  const pending = serializedBookings.filter((b) => b.status === "PENDING").length;
  const confirmed = serializedBookings.filter((b) => b.status === "CONFIRMED").length;
  const cancelled = serializedBookings.filter((b) => b.status === "CANCELLED").length;
  const noshow = serializedBookings.filter((b) => b.status === "NOSHOW").length;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">스터디룸 예약 관리</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            날짜별 예약 현황을 관리하고 승인·노쇼·취소 처리를 수행합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/study-rooms"
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            ← 스터디룸 현황
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 text-center shadow-sm">
          <p className="text-2xl font-bold text-ink">{serializedBookings.length}</p>
          <p className="mt-1 text-xs text-slate">오늘 전체 예약</p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-2xl font-bold text-amber-700">{pending}</p>
          <p className="mt-1 text-xs text-slate">승인 대기</p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5 text-center">
          <p className="text-2xl font-bold text-forest">{confirmed}</p>
          <p className="mt-1 text-xs text-slate">확정</p>
        </div>
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-2xl font-bold text-red-600">{cancelled + noshow}</p>
          <p className="mt-1 text-xs text-slate">취소/노쇼</p>
        </div>
      </div>

      {/* Management client */}
      <div className="mt-8">
        <BookingsManagementClient
          bookings={serializedBookings}
          rooms={rooms as StudyRoomSummary[]}
          activeDate={activeDate}
          todayStr={todayStr}
        />
      </div>
    </div>
  );
}
