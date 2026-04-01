import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { normalizeYmdDate } from "@/lib/date-utils";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getSettlementSummary } from "@/lib/services/payment.service";

function resolveSettlementRange(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");

  if (date) {
    const normalized = normalizeYmdDate(date, "정산 날짜");
    return {
      dateFrom: normalized,
      dateTo: normalized,
    };
  }

  if (!dateFrom || !dateTo) {
    throw new Error("date 또는 dateFrom/dateTo 쿼리가 필요합니다.");
  }

  const normalizedFrom = normalizeYmdDate(dateFrom, "정산 시작일");
  const normalizedTo = normalizeYmdDate(dateTo, "정산 종료일");

  return normalizedFrom <= normalizedTo
    ? { dateFrom: normalizedFrom, dateTo: normalizedTo }
    : { dateFrom: normalizedTo, dateTo: normalizedFrom };
}

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
    "paymentManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const range = resolveSettlementRange(request);
    const summary = await getSettlementSummary(params.division, range.dateFrom, range.dateTo);
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toApiErrorResponse(error, "정산 정보를 불러오는 중 오류가 발생했습니다.");
  }
}
