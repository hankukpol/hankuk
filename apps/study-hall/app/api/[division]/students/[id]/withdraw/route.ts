import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { studentWithdrawSchema } from "@/lib/student-schemas";
import { withdrawStudent } from "@/lib/services/student.service";

export async function POST(
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
  const parsed = studentWithdrawSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "퇴실 사유를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const student = await withdrawStudent(params.division, params.id, parsed.data);
    return NextResponse.json({ student });
  } catch (error) {
    return toApiErrorResponse(error, "퇴실 처리 중 오류가 발생했습니다.");
  }
}
