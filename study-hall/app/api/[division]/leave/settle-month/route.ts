import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { leaveSettlementSchema } from "@/lib/leave-schemas";
import { previewLeaveSettlement, settleLeaveMonth } from "@/lib/services/leave.service";

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
    "leaveManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const month = request.nextUrl.searchParams.get("month") || "";
  const parsed = leaveSettlementSchema.safeParse({ month });

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "정산 대상 월을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const preview = await previewLeaveSettlement(params.division, parsed.data);
    return NextResponse.json({ preview }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } });
  } catch (error) {
    return toApiErrorResponse(error, "월말 정산 미리보기를 불러오지 못했습니다.");
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
    "leaveManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = leaveSettlementSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "정산 대상 월을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const result = await settleLeaveMonth(params.division, auth.session, parsed.data);
    return NextResponse.json({ result });
  } catch (error) {
    return toApiErrorResponse(error, "월말 미사용 휴가권 정산에 실패했습니다.");
  }
}
