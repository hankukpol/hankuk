import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date"); // "YYYY-MM-DD"

  const where: Record<string, unknown> = { classroomId: params.id };
  if (dateStr) {
    const date = new Date(dateStr);
    where.attendDate = date;
  }

  const logs = await getPrisma().classroomAttendanceLog.findMany({
    where,
    include: {
      student: { select: { name: true, generation: true } },
    },
    orderBy: [{ attendDate: "desc" }, { student: { name: "asc" } }],
  });

  return NextResponse.json({ logs });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { examNumber, attendDate, attendType } = body;

    if (!examNumber || !attendDate || !attendType) {
      return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
    }

    const date = new Date(attendDate);

    const log = await getPrisma().classroomAttendanceLog.upsert({
      where: {
        classroomId_examNumber_attendDate: {
          classroomId: params.id,
          examNumber,
          attendDate: date,
        },
      },
      create: {
        classroomId: params.id,
        examNumber,
        attendDate: date,
        attendType,
        source: "MANUAL",
        updatedBy: auth.context.adminUser.id,
      },
      update: {
        attendType,
        source: "MANUAL",
        updatedBy: auth.context.adminUser.id,
      },
      include: {
        student: { select: { name: true, generation: true } },
      },
    });

    return NextResponse.json({ log });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
