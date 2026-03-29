import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { parseKakaoAttendanceText } from "@/lib/attendance/kakao-parser";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { rawText } = body as { rawText: string };

    if (!rawText?.trim()) {
      return NextResponse.json({ error: "카카오톡 채팅 내용을 입력하세요." }, { status: 400 });
    }

    // Load current students in this classroom
    const classroomStudents = await getPrisma().classroomStudent.findMany({
      where: { classroomId: params.id, leftAt: null },
      include: { student: { select: { examNumber: true, name: true, generation: true } } },
    });

    const students = classroomStudents.map((cs) => ({
      examNumber: cs.student.examNumber,
      name: cs.student.name,
      generation: cs.student.generation,
    }));

    const result = parseKakaoAttendanceText(rawText, students);

    // Save parse session to DB
    const parseRecord = await getPrisma().classroomAttendanceParse.create({
      data: {
        classroomId: params.id,
        rawText,
        parsedDate: result.parsedDate,
        parsedCount: result.entries.length,
        results: {
          create: result.entries.map((e) => ({
            examNumber: e.examNumber,
            rawName: e.rawName,
            matchStatus: e.matchStatus,
            attendType: e.attendType,
            checkInTime: e.checkInTime,
          })),
        },
      },
      include: {
        results: true,
      },
    });

    return NextResponse.json({
      parseId: parseRecord.id,
      parsedDate: result.parsedDate,
      entries: result.entries,
      results: parseRecord.results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "파싱 실패" },
      { status: 400 },
    );
  }
}
