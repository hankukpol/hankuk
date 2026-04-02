import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { normalizeYmdDate } from "@/lib/date-utils";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { PAYMENT_API_MESSAGES } from "@/lib/payment-meta";
import { getSettlementSummary } from "@/lib/services/payment.service";

function resolveSettlementRange(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom");
  const dateTo = request.nextUrl.searchParams.get("dateTo");

  if (date) {
    const normalized = normalizeYmdDate(date, PAYMENT_API_MESSAGES.settlementDate);
    return { dateFrom: normalized, dateTo: normalized };
  }
  if (!dateFrom || !dateTo) {
    throw new Error(PAYMENT_API_MESSAGES.settlementRangeRequired);
  }

  const normalizedFrom = normalizeYmdDate(dateFrom, PAYMENT_API_MESSAGES.settlementStartDate);
  const normalizedTo = normalizeYmdDate(dateTo, PAYMENT_API_MESSAGES.settlementEndDate);
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

  const featureDisabledError = await getDivisionFeatureDisabledError(params.division, "paymentManagement");
  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const range = resolveSettlementRange(request);
    const summary = await getSettlementSummary(params.division, range.dateFrom, range.dateTo);
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toApiErrorResponse(error, PAYMENT_API_MESSAGES.settlementError);
  }
}
