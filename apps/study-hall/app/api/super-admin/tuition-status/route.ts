import { NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { getTuitionStatus } from "@/lib/services/super-admin-overview.service";

export async function GET(request: Request) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const month = new URL(request.url).searchParams.get("month") ?? undefined;
    const status = await getTuitionStatus(month);
    return NextResponse.json(
      { status },
      {
        headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=30" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수납 현황을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
