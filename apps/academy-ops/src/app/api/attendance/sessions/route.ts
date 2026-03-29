import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/attendance/sessions?date=2026-03-17
// 강의 세션 목록 조회
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const searchParams = request.nextUrl.searchParams;
  const dateParam = searchParams.get("date");
  const targetDate = dateParam ? new Date(dateParam) : new Date();
  const dateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const academyId = resolveVisibleAcademyId(auth.context);

  try {
    const sessions = await getPrisma().lectureSession.findMany({
      where: {
        sessionDate: dateOnly,
        ...(academyId === null
          ? {}
          : {
              schedule: {
                cohort: {
                  enrollments: {
                    some: { academyId },
                  },
                },
              },
            }),
      },
      include: {
        schedule: {
          include: {
            cohort: {
              select: { id: true, name: true, examCategory: true },
            },
          },
        },
        attendances: {
          select: { status: true },
        },
      },
      orderBy: [{ startTime: "asc" }],
    });

    const sessionsWithStats = sessions.map((session) => {
      const total = session.attendances.length;
      const present = session.attendances.filter((attendance) => attendance.status === "PRESENT").length;
      const late = session.attendances.filter((attendance) => attendance.status === "LATE").length;
      const absent = session.attendances.filter((attendance) => attendance.status === "ABSENT").length;
      const excused = session.attendances.filter((attendance) => attendance.status === "EXCUSED").length;

      return {
        id: session.id,
        scheduleId: session.scheduleId,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        isCancelled: session.isCancelled,
        note: session.note,
        schedule: session.schedule,
        stats: { total, present, late, absent, excused },
        hasAttendance: total > 0,
      };
    });

    return NextResponse.json({ sessions: sessionsWithStats });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "세션 목록 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}

// POST /api/attendance/sessions
// 강의 세션 생성 또는 업데이트
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const body = await request.json();
    const { scheduleId, sessionDate, startTime, endTime, note } = body;

    if (!scheduleId) throw new Error("강의 일정 ID가 필요합니다.");
    if (!sessionDate) throw new Error("강의 날짜가 필요합니다.");
    if (!startTime || !endTime) throw new Error("시작 시간과 종료 시간이 필요합니다.");

    const dateOnly = new Date(sessionDate);

    const schedule = await getPrisma().lectureSchedule.findFirst({
      where: {
        id: scheduleId,
        cohort: {
          enrollments: {
            some: { academyId },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!schedule) {
      throw new Error("해당 지점의 강의 일정을 찾을 수 없습니다.");
    }

    const session = await getPrisma().lectureSession.upsert({
      where: {
        scheduleId_sessionDate: { scheduleId, sessionDate: dateOnly },
      },
      create: {
        id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        scheduleId,
        sessionDate: dateOnly,
        startTime,
        endTime,
        note: note?.trim() || null,
      },
      update: {
        startTime,
        endTime,
        note: note?.trim() || null,
      },
      include: {
        schedule: {
          include: { cohort: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "세션 저장에 실패했습니다." },
      { status: 400 },
    );
  }
}
