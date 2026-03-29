import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: { scheduleId: string } };

// PATCH /api/attendance/schedules/[scheduleId]
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { scheduleId } = context.params;
    if (!scheduleId) throw new Error("스케줄 ID가 필요합니다.");

    const body = await request.json();
    const { subjectName, instructorName, dayOfWeek, startTime, endTime, isActive } = body;

    const updated = await getPrisma().lectureSchedule.update({
      where: { id: scheduleId },
      data: {
        ...(subjectName !== undefined ? { subjectName: subjectName.trim() } : {}),
        ...(instructorName !== undefined
          ? { instructorName: instructorName?.trim() || null }
          : {}),
        ...(dayOfWeek !== undefined ? { dayOfWeek: Number(dayOfWeek) } : {}),
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
      include: {
        cohort: { select: { id: true, name: true, examCategory: true } },
      },
    });

    return NextResponse.json({ schedule: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

// DELETE /api/attendance/schedules/[scheduleId]
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { scheduleId } = context.params;
    if (!scheduleId) throw new Error("스케줄 ID가 필요합니다.");

    await getPrisma().lectureSchedule.delete({ where: { id: scheduleId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
