import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: { sessionId: string } };

// GET /api/attendance/sessions/[sessionId]
// 세션 상세 + 기수 수강생별 출결 현황
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { sessionId } = context.params;
    if (!sessionId) throw new Error("세션 ID가 필요합니다.");

    const session = await getPrisma().lectureSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        schedule: {
          include: {
            cohort: {
              select: {
                id: true,
                name: true,
                examCategory: true,
                startDate: true,
                endDate: true,
              },
            },
          },
        },
        attendances: {
          include: {
            student: {
              select: {
                examNumber: true,
                name: true,
                phone: true,
              },
            },
          },
          orderBy: [{ student: { examNumber: "asc" } }],
        },
      },
    });

    // 기수에 속한 수강생 목록 (ACTIVE 또는 PENDING 상태)
    const enrollments = await getPrisma().courseEnrollment.findMany({
      where: {
        cohortId: session.schedule.cohortId,
        status: { in: ["ACTIVE", "PENDING"] },
      },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: [{ student: { examNumber: "asc" } }],
    });

    // 출결 맵 생성 (studentId → attendance)
    const attendanceMap = new Map(
      session.attendances.map((a) => [a.studentId, a]),
    );

    // 수강생 목록에 출결 정보 병합
    const students = enrollments.map((e) => ({
      examNumber: e.student.examNumber,
      name: e.student.name,
      phone: e.student.phone,
      attendance: attendanceMap.get(e.student.examNumber) ?? null,
    }));

    return NextResponse.json({
      session: {
        id: session.id,
        scheduleId: session.scheduleId,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        isCancelled: session.isCancelled,
        note: session.note,
        schedule: session.schedule,
      },
      students,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

// PATCH /api/attendance/sessions/[sessionId]
// 세션 취소/복구 (isCancelled 토글) 또는 노트 수정
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { sessionId } = context.params;
    if (!sessionId) throw new Error("세션 ID가 필요합니다.");

    const body = await request.json();
    const { isCancelled, note } = body;

    const updated = await getPrisma().lectureSession.update({
      where: { id: sessionId },
      data: {
        ...(isCancelled !== undefined ? { isCancelled: Boolean(isCancelled) } : {}),
        ...(note !== undefined ? { note: note?.trim() || null } : {}),
      },
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
