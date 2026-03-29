import { NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { listStudentAttendanceHistory } from "@/lib/services/attendance.service";

export async function GET(
  _request: Request,
  { params }: { params: { division: string; studentId: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureError = await getDivisionFeatureDisabledError(
    params.division,
    "attendanceManagement",
  );

  if (featureError) {
    return NextResponse.json({ error: featureError }, { status: 403 });
  }

  try {
    const records = await listStudentAttendanceHistory(params.division, params.studentId);
    return NextResponse.json({ records }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } });
  } catch (error) {
    return toApiErrorResponse(error, "출석 이력을 불러오는 중 오류가 발생했습니다.");
  }
}
