import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/attendance/sessions/generate
// 날짜 범위 내 스케줄 요일과 일치하는 세션 자동 생성
// body: { cohortId?, startDate, endDate }
export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { cohortId, startDate, endDate } = body;

    if (!startDate || !endDate) throw new Error("시작일과 종료일을 입력하세요.");

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) throw new Error("시작일이 종료일보다 늦을 수 없습니다.");

    // 대상 스케줄 조회
    const schedules = await getPrisma().lectureSchedule.findMany({
      where: {
        ...(cohortId ? { cohortId } : {}),
        isActive: true,
      },
    });

    if (schedules.length === 0) {
      return NextResponse.json({ created: 0, message: "해당하는 활성 스케줄이 없습니다." });
    }

    // 날짜 범위 내 요일이 맞는 날짜 + 스케줄 조합 생성
    const toCreate: Array<{
      id: string;
      scheduleId: string;
      sessionDate: Date;
      startTime: string;
      endTime: string;
    }> = [];

    for (const schedule of schedules) {
      const current = new Date(start);
      while (current <= end) {
        // 0=일, 1=월 ... 6=토 (JS getDay와 동일)
        if (current.getDay() === schedule.dayOfWeek) {
          const dateOnly = new Date(
            current.getFullYear(),
            current.getMonth(),
            current.getDate(),
          );
          toCreate.push({
            id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            scheduleId: schedule.id,
            sessionDate: dateOnly,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
          });
        }
        current.setDate(current.getDate() + 1);
      }
    }

    // upsert (이미 있는 세션은 건너뜀)
    let created = 0;
    for (const item of toCreate) {
      const existing = await getPrisma().lectureSession.findUnique({
        where: {
          scheduleId_sessionDate: {
            scheduleId: item.scheduleId,
            sessionDate: item.sessionDate,
          },
        },
      });
      if (!existing) {
        await getPrisma().lectureSession.create({
          data: {
            id: item.id,
            scheduleId: item.scheduleId,
            sessionDate: item.sessionDate,
            startTime: item.startTime,
            endTime: item.endTime,
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      created,
      total: toCreate.length,
      message: `${toCreate.length}개 대상 중 ${created}개 세션 생성 완료`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
