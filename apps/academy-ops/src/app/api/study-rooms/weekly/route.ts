import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// ─── GET /api/study-rooms/weekly ─────────────────────────────────────────────
// Query params:
//   ?date=YYYY-MM-DD   → week (Mon-Sun) containing this date (default: today)
//   ?roomId=xxx        → filter by room (optional)
//
// Returns bookings grouped by day-of-week (0=Mon .. 6=Sun)

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const roomId = searchParams.get("roomId") ?? null;

  // ── Derive Mon-Sun of the week containing dateStr ─────────────────────────
  const anchor = new Date(dateStr);
  anchor.setHours(0, 0, 0, 0);

  // getDay(): 0=Sun, 1=Mon ... 6=Sat → convert to Mon=0 base
  const rawDay = anchor.getDay(); // 0=Sun
  const dayFromMon = rawDay === 0 ? 6 : rawDay - 1; // Mon=0 .. Sun=6

  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - dayFromMon);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // ── Fetch rooms ───────────────────────────────────────────────────────────
  const rooms = await getPrisma().studyRoom.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, capacity: true },
  });

  // ── Fetch bookings for the week ───────────────────────────────────────────
  const whereClause: Record<string, unknown> = {
    bookingDate: { gte: monday, lte: sunday },
  };
  if (roomId) whereClause.roomId = roomId;

  const bookings = await getPrisma().studyRoomBooking.findMany({
    where: whereClause,
    include: {
      room: { select: { name: true } },
      student: { select: { name: true, examNumber: true } },
      assigner: { select: { name: true } },
    },
    orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
  });

  // ── Build day-of-week groups (0=Mon .. 6=Sun) ─────────────────────────────
  type BookingEntry = {
    id: string;
    roomId: string;
    roomName: string;
    examNumber: string;
    studentName: string;
    startTime: string;
    endTime: string;
    date: string; // "YYYY-MM-DD"
    status: string;
    note: string | null;
  };

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

  // ── Build week date labels ─────────────────────────────────────────────────
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  return NextResponse.json({
    data: {
      weekStart: monday.toISOString().slice(0, 10),
      weekEnd: sunday.toISOString().slice(0, 10),
      weekDates,
      rooms,
      days, // index 0=Mon, 6=Sun
    },
  });
}
