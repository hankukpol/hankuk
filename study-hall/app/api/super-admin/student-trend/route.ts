import { NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { getStudentCountTrend } from "@/lib/services/super-admin-overview.service";

export async function GET(request: Request) {
  const auth = await requireApiSuperAdminAuth();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const weeks = Number(new URL(request.url).searchParams.get("weeks") ?? "8");
    const trend = await getStudentCountTrend(Math.min(Math.max(weeks, 2), 24));
    return NextResponse.json(
      { trend },
      {
        headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "학생 추이 데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
