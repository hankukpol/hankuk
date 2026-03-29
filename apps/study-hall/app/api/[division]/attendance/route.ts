import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getAttendanceSnapshot, upsertAttendanceBatch } from "@/lib/services/attendance.service";

const attendanceBatchSchema = z.object({
  periodId: z.string().min(1, "교시를 선택해주세요."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다."),
  records: z.array(
    z.object({
      studentId: z.string().min(1),
      status: z.enum([
        "PRESENT",
        "TARDY",
        "ABSENT",
        "EXCUSED",
        "HOLIDAY",
        "HALF_HOLIDAY",
        "NOT_APPLICABLE",
      ]),
      reason: z.string().nullable().optional(),
    }),
  ),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "ASSISTANT", "SUPER_ADMIN"]);

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

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const periodId = searchParams.get("periodId") ?? undefined;

  if (!date) {
    return NextResponse.json({ error: "date 파라미터가 필요합니다." }, { status: 400 });
  }

  try {
    const snapshot = await getAttendanceSnapshot(params.division, date, periodId);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "max-age=10, stale-while-revalidate=5" },
    });
  } catch (error) {
    return toApiErrorResponse(error, "출석 데이터를 불러오지 못했습니다.");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "ASSISTANT", "SUPER_ADMIN"]);

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

  const body = await request.json().catch(() => null);
  const parsed = attendanceBatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "잘못된 입력입니다.") },
      { status: 400 },
    );
  }

  try {
    const snapshot = await upsertAttendanceBatch(params.division, auth.session, parsed.data);
    return NextResponse.json(snapshot);
  } catch (error) {
    return toApiErrorResponse(error, "출석 저장에 실패했습니다.");
  }
}
