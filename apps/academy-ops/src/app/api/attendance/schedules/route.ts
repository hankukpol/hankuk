import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/attendance/schedules?cohortId=xxx
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const cohortId = sp.get("cohortId");
  const activeOnly = sp.get("activeOnly") !== "false";

  const schedules = await getPrisma().lectureSchedule.findMany({
    where: {
      ...(cohortId ? { cohortId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    include: {
      cohort: { select: { id: true, name: true, examCategory: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json({ schedules });
}

// POST /api/attendance/schedules
export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { cohortId, subjectName, instructorName, dayOfWeek, startTime, endTime } = body;

    if (!cohortId) throw new Error("기수를 선택하세요.");
    if (!subjectName?.trim()) throw new Error("과목명을 입력하세요.");
    if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6)
      throw new Error("요일을 올바르게 선택하세요.");
    if (!startTime || !endTime) throw new Error("시작/종료 시간을 입력하세요.");

    const cohort = await getPrisma().cohort.findUnique({ where: { id: cohortId } });
    if (!cohort) throw new Error("기수를 찾을 수 없습니다.");

    const schedule = await getPrisma().lectureSchedule.create({
      data: {
        id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        cohortId,
        subjectName: subjectName.trim(),
        instructorName: instructorName?.trim() || null,
        dayOfWeek: Number(dayOfWeek),
        startTime,
        endTime,
      },
      include: {
        cohort: { select: { id: true, name: true, examCategory: true } },
      },
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 400 },
    );
  }
}
