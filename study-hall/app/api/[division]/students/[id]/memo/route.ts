import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { studentMemoSchema } from "@/lib/student-schemas";
import { updateStudentMemo } from "@/lib/services/student.service";

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
    "studentManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = studentMemoSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "메모 내용을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const student = await updateStudentMemo(params.division, params.id, parsed.data.memo);
    return NextResponse.json({ student });
  } catch (error) {
    return toApiErrorResponse(error, "메모 저장에 실패했습니다.");
  }
}
