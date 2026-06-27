import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { phoneBulkRentalSchema } from "@/lib/phone-submission-schemas";
import { applyPhoneBulkRental } from "@/lib/services/phone-submission.service";

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
    "phoneSubmissions",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = phoneBulkRentalSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "일괄 대여 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const result = await applyPhoneBulkRental(params.division, auth.session, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "휴대폰 일괄 대여 처리 중 오류가 발생했습니다.");
  }
}
