import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { paymentSchema } from "@/lib/payment-schemas";
import { createPayment, listPayments } from "@/lib/services/payment.service";

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
    const payments = await listPayments(params.division, {
      studentId: request.nextUrl.searchParams.get("studentId") || undefined,
      paymentTypeId: request.nextUrl.searchParams.get("paymentTypeId") || undefined,
      dateFrom: request.nextUrl.searchParams.get("dateFrom") || undefined,
      dateTo: request.nextUrl.searchParams.get("dateTo") || undefined,
    });

    return NextResponse.json(
      { payments },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } },
    );
  } catch (error) {
    return toApiErrorResponse(error, "수납 내역을 불러오는 중 오류가 발생했습니다.");
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
    "paymentManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = paymentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "수납 정보를 다시 확인해 주세요.") },
      { status: 400 },
    );
  }

  try {
    const payment = await createPayment(params.division, auth.session, parsed.data);
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "수납 처리 중 오류가 발생했습니다.");
  }
}
