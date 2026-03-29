import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPointStatsSummary } from "@/lib/points/stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/points/stats
 * 포인트 전체 통계 요약.
 * 권한: COUNSELOR+
 */
export async function GET() {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const data = await getPointStatsSummary();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "포인트 통계를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
