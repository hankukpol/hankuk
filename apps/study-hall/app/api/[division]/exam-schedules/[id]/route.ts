import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { examScheduleUpdateSchema } from "@/lib/exam-schedule-schemas";
import {
  deleteExamSchedule,
  updateExamSchedule,
} from "@/lib/services/exam-schedule.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { division: string; id: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "examScheduleManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = examScheduleUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "시험 일정 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const schedule = await updateExamSchedule(params.division, params.id, parsed.data);
    return NextResponse.json({ schedule });
  } catch (error) {
    return toApiErrorResponse(error, "시험 일정 처리 중 오류가 발생했습니다.");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { division: string; id: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "examScheduleManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    await deleteExamSchedule(params.division, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, "시험 일정 처리 중 오류가 발생했습니다.");
  }
}
