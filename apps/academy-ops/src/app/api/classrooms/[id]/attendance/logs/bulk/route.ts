import { AdminRole, AttendSource, AttendType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

interface BulkEntry {
  examNumber: string;
  attendType: AttendType;
  checkInTime?: string;
}

// POST /api/classrooms/[id]/attendance/logs/bulk
// Bulk upsert attendance logs from client-side KakaoTalk parse
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { attendDate, entries } = body as {
      attendDate: string; // "YYYY-MM-DD"
      entries: BulkEntry[];
    };

    if (!attendDate || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
    }

    // Validate all attendType values
    const validTypes = Object.values(AttendType);
    for (const entry of entries) {
      if (!entry.examNumber) {
        return NextResponse.json({ error: "학번이 누락된 항목이 있습니다." }, { status: 400 });
      }
      if (!validTypes.includes(entry.attendType)) {
        return NextResponse.json(
          { error: `잘못된 출결 유형: ${entry.attendType}` },
          { status: 400 },
        );
      }
    }

    const date = new Date(attendDate);
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    // Verify classroom exists
    const classroom = await getPrisma().classroom.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!classroom) {
      return NextResponse.json({ error: "담임반을 찾을 수 없습니다." }, { status: 404 });
    }

    // Upsert all in transaction
    let saved = 0;
    await getPrisma().$transaction(async (tx) => {
      for (const entry of entries) {
        await tx.classroomAttendanceLog.upsert({
          where: {
            classroomId_examNumber_attendDate: {
              classroomId: params.id,
              examNumber: entry.examNumber,
              attendDate: date,
            },
          },
          create: {
            classroomId: params.id,
            examNumber: entry.examNumber,
            attendDate: date,
            attendType: entry.attendType,
            source: AttendSource.KAKAO_PARSE,
            updatedBy: auth.context.adminUser.id,
          },
          update: {
            attendType: entry.attendType,
            source: AttendSource.KAKAO_PARSE,
            updatedBy: auth.context.adminUser.id,
          },
        });
        saved++;
      }
    });

    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}
