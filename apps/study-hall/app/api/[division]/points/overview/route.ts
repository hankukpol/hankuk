import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { listPointRecords } from "@/lib/services/point.service";
import { listStudents } from "@/lib/services/student.service";

const RECENT_POINT_RECORD_LIMIT = 50;

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "pointManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const dateFrom = request.nextUrl.searchParams.get("dateFrom")?.trim() || undefined;
  const dateTo = request.nextUrl.searchParams.get("dateTo")?.trim() || undefined;

  try {
    const [students, records] = await Promise.all([
      listStudents(params.division, {
        pointDateFrom: dateFrom,
        pointDateTo: dateTo,
      }),
      listPointRecords(params.division, {
        dateFrom,
        dateTo,
        limit: RECENT_POINT_RECORD_LIMIT,
      }),
    ]);

    return NextResponse.json(
      { students, records },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } },
    );
  } catch (error) {
    return toApiErrorResponse(error, "상벌점 조회 데이터를 불러오지 못했습니다.");
  }
}
