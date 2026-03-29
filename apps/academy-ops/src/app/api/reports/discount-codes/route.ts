import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { getDiscountCodeAnalyticsData } from "@/lib/discount-codes/reporting";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const month = request.nextUrl.searchParams.get("month");
    const period = month && /^\d{4}-\d{2}$/.test(month) ? month : request.nextUrl.searchParams.get("period");
    const data = await getDiscountCodeAnalyticsData({ academyId, period });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "할인 코드 보고서를 불러오지 못했습니다." },
      { status: 400 },
    );
  }
}