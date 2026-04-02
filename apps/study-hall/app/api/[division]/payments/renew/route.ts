import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { PAYMENT_API_MESSAGES } from "@/lib/payment-meta";
import { renewPaymentSchema } from "@/lib/payment-schemas";
import { renewAndPay } from "@/lib/services/payment.service";

export async function POST(
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

  const body = await request.json().catch(() => null);
  const parsed = renewPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, PAYMENT_API_MESSAGES.renewSchemaError) },
      { status: 400 },
    );
  }

  try {
    const result = await renewAndPay(params.division, auth.session, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, PAYMENT_API_MESSAGES.renewError);
  }
}
