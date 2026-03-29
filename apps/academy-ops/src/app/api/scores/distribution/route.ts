import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getScoreDistributionSummary } from "@/lib/scores/distribution";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sessionId = Number(request.nextUrl.searchParams.get("sessionId"));

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return NextResponse.json({ error: "시험 회차를 선택해 주세요." }, { status: 400 });
  }

  try {
    const distribution = await getScoreDistributionSummary(sessionId);
    return NextResponse.json(distribution);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "성적 분포를 불러오지 못했습니다.",
      },
      { status: 400 },
    );
  }
}