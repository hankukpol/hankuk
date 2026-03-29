import { AdminRole, AttendSource, AttendType, ParseMatchStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

interface ConfirmEntry {
  resultId: string;
  examNumber: string;
  attendType: AttendType;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { parseId, attendDate, entries } = body as {
      parseId: string;
      attendDate: string; // "YYYY-MM-DD"
      entries: ConfirmEntry[];
    };

    if (!parseId || !attendDate || !Array.isArray(entries)) {
      return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
    }

    const date = new Date(attendDate);

    await getPrisma().$transaction(async (tx) => {
      // Upsert attendance logs
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
            parseId,
            updatedBy: auth.context.adminUser.id,
          },
          update: {
            attendType: entry.attendType,
            source: AttendSource.KAKAO_PARSE,
            parseId,
            updatedBy: auth.context.adminUser.id,
          },
        });

        // Mark result as confirmed
        await tx.classroomAttendanceResult.update({
          where: { id: entry.resultId },
          data: { isConfirmed: true },
        });
      }

      // Mark parse as confirmed
      await tx.classroomAttendanceParse.update({
        where: { id: parseId },
        data: { confirmedAt: new Date(), confirmedBy: auth.context.adminUser.id },
      });
    });

    return NextResponse.json({ ok: true, saved: entries.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}
