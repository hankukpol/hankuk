import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { examScheduleSchema } from "@/lib/exam-schedule-schemas";
import {
  createExamSchedule,
  listExamSchedules,
} from "@/lib/services/exam-schedule.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN", "ASSISTANT"]);

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
    const schedules = await listExamSchedules(params.division);
    return NextResponse.json({ schedules }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
  } catch (error) {
    return toApiErrorResponse(error, "시험 일정 처리 중 오류가 발생했습니다.");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { division: string } },
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
  const parsed = examScheduleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "시험 일정 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const schedule = await createExamSchedule(params.division, auth.session, parsed.data);
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "시험 일정 처리 중 오류가 발생했습니다.");
  }
}
