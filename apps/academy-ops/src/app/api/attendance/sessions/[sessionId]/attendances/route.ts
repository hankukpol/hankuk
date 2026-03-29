import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

type AttendStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";

export const dynamic = "force-dynamic";

type RouteContext = { params: { sessionId: string } };

// GET /api/attendance/sessions/[sessionId]/attendances
// 세션별 출결 목록 조회
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { sessionId } = context.params;
    if (!sessionId) throw new Error("세션 ID가 필요합니다.");

    const academyId = resolveVisibleAcademyId(auth.context);
    if (academyId !== null) {
      const session = await getPrisma().lectureSession.findFirst({
        where: {
          id: sessionId,
          schedule: {
            cohort: {
              enrollments: {
                some: { academyId },
              },
            },
          },
        },
        select: { id: true },
      });

      if (!session) {
        throw new Error("해당 지점의 세션을 찾을 수 없습니다.");
      }
    }

    const attendances = await getPrisma().lectureAttendance.findMany({
      where: {
        sessionId,
        ...(academyId === null ? {} : { student: { academyId } }),
      },
      include: {
        student: {
          select: { examNumber: true, name: true, phone: true },
        },
      },
      orderBy: [{ student: { examNumber: "asc" } }],
    });

    return NextResponse.json({ attendances });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "출결 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}

// POST /api/attendance/sessions/[sessionId]/attendances
// 세션 출결 저장
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const { sessionId } = context.params;
    if (!sessionId) throw new Error("세션 ID가 필요합니다.");

    const body = await request.json();
    const { attendances } = body as {
      attendances: Array<{ studentId: string; status: string; note?: string }>;
    };

    if (!Array.isArray(attendances) || attendances.length === 0) {
      throw new Error("출결 데이터가 없습니다.");
    }

    const session = await getPrisma().lectureSession.findFirst({
      where: {
        id: sessionId,
        schedule: {
          cohort: {
            enrollments: {
              some: { academyId },
            },
          },
        },
      },
      select: { id: true, isCancelled: true },
    });

    if (!session) throw new Error("해당 지점의 세션을 찾을 수 없습니다.");
    if (session.isCancelled) throw new Error("취소된 강의 세션입니다.");

    const validStatuses: AttendStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];
    for (const item of attendances) {
      if (!item.studentId) throw new Error("studentId가 비어 있는 항목이 있습니다.");
      if (!validStatuses.includes(item.status as AttendStatus)) {
        throw new Error(`유효하지 않은 출결 상태입니다: ${item.status}`);
      }
    }

    const studentIds = [...new Set(attendances.map((item) => item.studentId))];
    const visibleStudents = await getPrisma().student.findMany({
      where: {
        examNumber: { in: studentIds },
        academyId,
      },
      select: { examNumber: true },
    });
    const visibleStudentSet = new Set(visibleStudents.map((student) => student.examNumber));
    const missingStudentId = studentIds.find((studentId) => !visibleStudentSet.has(studentId));
    if (missingStudentId) {
      throw new Error("해당 지점 학생만 출결을 저장할 수 있습니다.");
    }

    const results = await getPrisma().$transaction(
      attendances.map((item) =>
        getPrisma().lectureAttendance.upsert({
          where: {
            sessionId_studentId: { sessionId, studentId: item.studentId },
          },
          create: {
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${item.studentId}`,
            sessionId,
            studentId: item.studentId,
            status: item.status as AttendStatus,
            note: item.note?.trim() || null,
            checkedBy: auth.context.adminUser.id,
          },
          update: {
            status: item.status as AttendStatus,
            note: item.note?.trim() || null,
            checkedAt: new Date(),
            checkedBy: auth.context.adminUser.id,
          },
        }),
      ),
    );

    return NextResponse.json({
      saved: results.length,
      attendances: results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "출결 저장에 실패했습니다." },
      { status: 400 },
    );
  }
}
