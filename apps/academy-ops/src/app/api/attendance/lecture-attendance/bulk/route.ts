import { AdminRole, AttendStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/attendance/lecture-attendance/bulk
// 강의 출결 일괄 upsert
// body: { sessionId: string, entries: [{ studentId, status, note? }] }
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { sessionId, entries } = body as {
      sessionId: string;
      entries: Array<{ studentId: string; status: string; note?: string }>;
    };

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId가 필요합니다." }, { status: 400 });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "출결 데이터가 없습니다." }, { status: 400 });
    }

    // 세션 존재 확인
    const session = await getPrisma().lectureSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }
    if (session.isCancelled) {
      return NextResponse.json({ error: "취소된 강의 세션입니다." }, { status: 400 });
    }

    // 유효한 AttendStatus 값 확인
    const validStatuses: AttendStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];
    for (const item of entries) {
      if (!item.studentId) {
        return NextResponse.json({ error: "studentId가 누락된 항목이 있습니다." }, { status: 400 });
      }
      if (!validStatuses.includes(item.status as AttendStatus)) {
        return NextResponse.json(
          { error: `유효하지 않은 출결 상태: ${item.status}` },
          { status: 400 },
        );
      }
    }

    // 기존 출결 목록 조회 (created/updated 카운트를 위해)
    const existing = await getPrisma().lectureAttendance.findMany({
      where: { sessionId },
      select: { studentId: true },
    });
    const existingSet = new Set(existing.map((a) => a.studentId));

    // upsert 일괄 처리
    const results = await getPrisma().$transaction(
      entries.map((item) =>
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

    const created = results.filter((r) => !existingSet.has(r.studentId)).length;
    const updated = results.length - created;

    return NextResponse.json({ data: { created, updated } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}
