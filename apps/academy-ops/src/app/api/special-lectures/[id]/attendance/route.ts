import { AdminRole, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "NONE";

// extraData shape stored on each CourseEnrollment:
// { attendance: { "YYYY-MM-DD": "PRESENT" | "LATE" | "ABSENT" | "NONE" } }

// ─── GET /api/special-lectures/[id]/attendance ────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const lecture = await getPrisma().specialLecture.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      enrollments: {
        where: { status: { in: ["ACTIVE", "COMPLETED", "WITHDRAWN"] } },
        include: {
          student: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!lecture) {
    return NextResponse.json({ error: "강좌를 찾을 수 없습니다." }, { status: 404 });
  }

  // Build per-enrollment row
  const enrollments = lecture.enrollments.map((e) => ({
    id: e.id,
    examNumber: e.examNumber,
    studentName: e.student.name,
    studentPhone: e.student.phone ?? null,
    status: e.status,
  }));

  // Aggregate attendance: { [date]: { [enrollmentId]: status } }
  const attendance: Record<string, Record<string, AttendanceStatus>> = {};

  for (const e of lecture.enrollments) {
    const extra = e.extraData as Record<string, unknown> | null;
    const attendMap = (extra?.attendance ?? {}) as Record<string, AttendanceStatus>;
    for (const [date, status] of Object.entries(attendMap)) {
      if (!attendance[date]) attendance[date] = {};
      attendance[date]![e.id] = status;
    }
  }

  return NextResponse.json({
    lecture: {
      id: lecture.id,
      name: lecture.name,
      startDate: lecture.startDate.toISOString(),
      endDate: lecture.endDate.toISOString(),
    },
    enrollments,
    attendance,
  });
}

// ─── POST /api/special-lectures/[id]/attendance ───────────────────────────────
// Body: { date: "YYYY-MM-DD", attendance: { [enrollmentId]: status } }

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as {
      date?: string;
      attendance?: Record<string, AttendanceStatus>;
    };

    const { date, attendance } = body;

    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    if (!attendance || typeof attendance !== "object") {
      return NextResponse.json({ error: "출결 데이터가 없습니다." }, { status: 400 });
    }

    const validStatuses = new Set<AttendanceStatus>(["PRESENT", "LATE", "ABSENT", "NONE"]);

    // Verify all enrollments belong to this lecture
    const enrollmentIds = Object.keys(attendance);
    if (enrollmentIds.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const enrollments = await getPrisma().courseEnrollment.findMany({
      where: {
        id: { in: enrollmentIds },
        specialLectureId: params.id,
      },
      select: { id: true, extraData: true },
    });

    const foundIds = new Set(enrollments.map((e) => e.id));
    const invalid = enrollmentIds.filter((eid) => !foundIds.has(eid));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `유효하지 않은 수강 ID: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }

    // Update each enrollment's extraData.attendance
    const updates = enrollments.map((enr) => {
      const extra = (enr.extraData as Record<string, unknown>) ?? {};
      const existingAttend = (extra.attendance ?? {}) as Record<string, AttendanceStatus>;
      const newStatus = attendance[enr.id];

      // Remove NONE entries to keep JSON clean
      if (newStatus && validStatuses.has(newStatus) && newStatus !== "NONE") {
        existingAttend[date] = newStatus;
      } else {
        delete existingAttend[date];
      }

      const updatedExtra: Prisma.InputJsonValue = { ...extra, attendance: existingAttend } as Prisma.InputJsonValue;

      return getPrisma().courseEnrollment.update({
        where: { id: enr.id },
        data: { extraData: updatedExtra },
        select: { id: true },
      });
    });

    await Promise.all(updates);

    return NextResponse.json({ ok: true, updated: updates.length, date });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}
