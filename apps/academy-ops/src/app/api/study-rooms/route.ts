import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// ─── GET /api/study-rooms ────────────────────────────────────────────────────
// Query params:
//   ?date=YYYY-MM-DD   → include bookings for that date in each room object
//   (no date)          → return plain room list (for settings / dropdowns)

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date"); // "YYYY-MM-DD" or null

  if (dateStr) {
    // Return rooms with bookings embedded for the given date
    const dateObj = new Date(dateStr);

    const rooms = await getPrisma().studyRoom.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        bookings: {
          where: { bookingDate: dateObj },
          include: {
            student: { select: { name: true, generation: true } },
            assigner: { select: { name: true } },
          },
          orderBy: { startTime: "asc" },
        },
      },
    });

    const serialized = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      description: r.description,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      bookings: r.bookings.map((b) => ({
        ...b,
        bookingDate: b.bookingDate.toISOString(),
      })),
    }));

    return NextResponse.json({ data: { rooms: serialized } });
  }

  // Plain list (no date filter)
  const rooms = await getPrisma().studyRoom.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ rooms });
}

// ─── POST /api/study-rooms ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as {
      name?: string;
      capacity?: number;
      description?: string;
    };
    const { name, capacity, description } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "스터디룸 이름을 입력하세요." }, { status: 400 });
    }

    const room = await getPrisma().studyRoom.create({
      data: {
        name: name.trim(),
        capacity: capacity ? Number(capacity) : 1,
        description: description?.trim() || null,
      },
    });

    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
