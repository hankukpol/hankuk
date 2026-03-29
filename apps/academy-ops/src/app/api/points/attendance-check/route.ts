import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { listAttendancePointCandidates } from "@/lib/points/service";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const periodId = Number(request.nextUrl.searchParams.get("periodId"));
  const year = Number(request.nextUrl.searchParams.get("year"));
  const month = Number(request.nextUrl.searchParams.get("month"));
  const examTypeParam = request.nextUrl.searchParams.get("examType");
  const examType =
    examTypeParam === ExamType.GYEONGCHAE ? ExamType.GYEONGCHAE : ExamType.GONGCHAE;

  if (!Number.isFinite(periodId) || !Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json(
      { error: "periodId, year, month를 모두 입력하세요." },
      { status: 400 },
    );
  }

  try {
    const candidates = await listAttendancePointCandidates({
      periodId,
      examType,
      year,
      month,
    });

    return NextResponse.json({ candidates });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "개근 대상자 조회에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
