import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { applyRecurringAttendance } from "@/lib/services/attendance.service";

const attendanceStatusSchema = z.enum([
  "PRESENT",
  "TARDY",
  "ABSENT",
  "EXCUSED",
  "HOLIDAY",
  "HALF_HOLIDAY",
  "NOT_APPLICABLE",
]);

const recurringAttendanceSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해 주세요."),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "시작일 형식이 올바르지 않습니다."),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "종료일 형식이 올바르지 않습니다."),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, "요일을 하나 이상 선택해 주세요."),
  startPeriodId: z.string().min(1, "시작 교시를 선택해 주세요."),
  endPeriodId: z.string().min(1, "종료 교시를 선택해 주세요."),
  status: attendanceStatusSchema,
  reason: z.string().nullable().optional(),
  overwriteExisting: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { division: string } },
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

  const body = await request.json().catch(() => null);
  const parsed = recurringAttendanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "잘못된 입력입니다.") },
      { status: 400 },
    );
  }

  try {
    const result = await applyRecurringAttendance(params.division, auth.session, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "반복 출석 적용에 실패했습니다.");
  }
}
