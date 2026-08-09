import { NextRequest, NextResponse } from "next/server";
import { ExamType } from "@prisma/client";
import { getDifficultyStats } from "@/lib/difficulty";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";

function parseExamId(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = parseExamId(searchParams.get("examId"));
    const tenantType = await getServerTenantType();
    const allowedExamTypes =
      tenantType === "police"
        ? [ExamType.PUBLIC, ExamType.CAREER]
        : [ExamType.PUBLIC, ExamType.CAREER_RESCUE, ExamType.CAREER_ACADEMIC, ExamType.CAREER_EMT];
    const stats = await getDifficultyStats(examId, allowedExamTypes);

    if (!stats) {
      return NextResponse.json({ error: "시험 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json(stats, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("체감 난이도 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "체감 난이도 조회에 실패했습니다." }, { status: 500 });
  }
}
