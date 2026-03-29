import { AdminRole, BookingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

// ─── GET /api/study-room-bookings ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date"); // "YYYY-MM-DD"
  const roomId = searchParams.get("roomId");

  const where: Record<string, unknown> = {};
  if (dateStr) where.bookingDate = new Date(dateStr);
  if (roomId) where.roomId = roomId;

  const bookings = await getPrisma().studyRoomBooking.findMany({
    where,
    include: {
      room: { select: { name: true } },
      student: { select: { name: true, generation: true } },
      assigner: { select: { name: true } },
    },
    orderBy: [{ bookingDate: "desc" }, { startTime: "asc" }],
    take: 200,
  });

  // Serialize Date fields
  const serialized = bookings.map((b) => ({
    ...b,
    bookingDate: b.bookingDate.toISOString(),
  }));

  return NextResponse.json({ bookings: serialized });
}

// ─── POST /api/study-room-bookings ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as {
      roomId?: string;
      examNumber?: string;
      bookingDate?: string;
      startTime?: string;
      endTime?: string;
      note?: string;
    };
    const { roomId, examNumber, bookingDate, startTime, endTime, note } = body;

    if (!roomId || !examNumber || !bookingDate || !startTime || !endTime) {
      return NextResponse.json({ error: "필수 항목을 모두 입력하세요." }, { status: 400 });
    }

    // Validate time order
    if (toMinutes(startTime) >= toMinutes(endTime)) {
      return NextResponse.json(
        { error: "종료 시간은 시작 시간 이후여야 합니다." },
        { status: 400 },
      );
    }

    const bookingDateObj = new Date(bookingDate);

    // Overlap check: same room, same date, status CONFIRMED, time overlapping
    const existingBookings = await getPrisma().studyRoomBooking.findMany({
      where: {
        roomId,
        bookingDate: bookingDateObj,
        status: BookingStatus.CONFIRMED,
      },
      select: { startTime: true, endTime: true, student: { select: { name: true } } },
    });

    const conflict = existingBookings.find((b) =>
      timesOverlap(startTime, endTime, b.startTime, b.endTime),
    );

    if (conflict) {
      return NextResponse.json(
        {
          error: `해당 시간대에 이미 예약이 있습니다. (${conflict.startTime} ~ ${conflict.endTime} · ${conflict.student.name})`,
        },
        { status: 409 },
      );
    }

    const booking = await getPrisma().studyRoomBooking.create({
      data: {
        roomId,
        examNumber,
        bookingDate: bookingDateObj,
        startTime,
        endTime,
        note: note?.trim() || null,
        assignedBy: auth.context.adminUser.id,
      },
      include: {
        room: { select: { name: true } },
        student: { select: { name: true, generation: true } },
        assigner: { select: { name: true } },
      },
    });

    const serialized = {
      ...booking,
      bookingDate: booking.bookingDate.toISOString(),
    };

    return NextResponse.json({ booking: serialized }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "예약 실패" },
      { status: 400 },
    );
  }
}
