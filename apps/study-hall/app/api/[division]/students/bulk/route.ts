import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { studentBulkCreateSchema } from "@/lib/student-schemas";
import { createStudentsBulk } from "@/lib/services/student.service";

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
    "studentManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = studentBulkCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "학생 목록을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const result = await createStudentsBulk(
      params.division,
      parsed.data.rows,
      parsed.data.studyTrack ?? null,
      { overwriteExisting: parsed.data.overwriteExisting ?? false },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "학생 일괄 등록 중 오류가 발생했습니다.");
  }
}
