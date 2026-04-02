import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { PAYMENT_API_MESSAGES } from "@/lib/payment-meta";
import { paymentSchema } from "@/lib/payment-schemas";
import { deletePayment, updatePayment } from "@/lib/services/payment.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { division: string; id: string } },
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
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, PAYMENT_API_MESSAGES.paymentSchemaError) },
      { status: 400 },
    );
  }

  try {
    const payment = await updatePayment(params.division, params.id, parsed.data);
    return NextResponse.json({ payment });
  } catch (error) {
    return toApiErrorResponse(error, PAYMENT_API_MESSAGES.updateError);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { division: string; id: string } },
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
    await deletePayment(params.division, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, PAYMENT_API_MESSAGES.deleteError);
  }
}
