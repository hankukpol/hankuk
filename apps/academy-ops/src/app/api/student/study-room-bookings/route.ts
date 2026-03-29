import { NextRequest } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getPrisma } from "@/lib/prisma";

// ─── GET /api/student/study-room-bookings ──────────────────────────────────────
// Returns available study rooms for date selection

export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const rooms = await getPrisma().studyRoom.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, capacity: true, description: true },
  });

  return Response.json({ data: rooms });
}

// ─── POST /api/student/study-room-bookings ─────────────────────────────────────
// Student creates a PENDING booking request

export async function POST(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as {
      roomId?: string;
      bookingDate?: string;
      startTime?: string;
      endTime?: string;
      note?: string;
    };

    const { roomId, bookingDate, startTime, endTime, note } = body;

    if (!roomId || !bookingDate || !startTime || !endTime) {
      return Response.json({ error: "필수 항목을 모두 입력하세요." }, { status: 400 });
    }

    // Validate time order
    const toMinutes = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };

    if (toMinutes(startTime) >= toMinutes(endTime)) {
      return Response.json(
        { error: "종료 시간은 시작 시간 이후여야 합니다." },
        { status: 400 },
      );
    }

    // Validate room exists
    const room = await getPrisma().studyRoom.findUnique({
      where: { id: roomId },
      select: { id: true, isActive: true },
    });

    if (!room || !room.isActive) {
      return Response.json({ error: "유효하지 않은 스터디룸입니다." }, { status: 400 });
    }

    const bookingDateObj = new Date(bookingDate);

    // Find a system admin to satisfy the assignedBy FK constraint
    // Use the first active SUPER_ADMIN or any admin as fallback
    const systemAdmin = await getPrisma().adminUser.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (!systemAdmin) {
      return Response.json({ error: "시스템 오류: 처리 담당자를 찾을 수 없습니다." }, { status: 500 });
    }

    const booking = await getPrisma().studyRoomBooking.create({
      data: {
        roomId,
        examNumber: auth.student.examNumber,
        bookingDate: bookingDateObj,
        startTime,
        endTime,
        status: "PENDING",
        note: note?.trim() || null,
        assignedBy: systemAdmin.id,
      },
      include: {
        room: { select: { name: true } },
      },
    });

    return Response.json(
      { data: { ...booking, bookingDate: booking.bookingDate.toISOString() } },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "예약 신청 실패" },
      { status: 400 },
    );
  }
}
