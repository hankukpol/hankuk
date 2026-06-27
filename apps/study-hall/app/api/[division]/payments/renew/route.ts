import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { PAYMENT_API_MESSAGES } from "@/lib/payment-meta";
import { renewPaymentSchema } from "@/lib/payment-schemas";
import { renewAndPay, type RenewPaymentResult } from "@/lib/services/payment.service";

const RENEW_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const renewIdempotencyCache = new Map<
  string,
  { createdAt: number; promise: Promise<RenewPaymentResult> }
>();

function pruneRenewIdempotencyCache() {
  const now = Date.now();

  renewIdempotencyCache.forEach((entry, key) => {
    if (now - entry.createdAt > RENEW_IDEMPOTENCY_TTL_MS) {
      renewIdempotencyCache.delete(key);
    }
  });
}

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
    const idempotencyKey = parsed.data.idempotencyKey
      ? [
          params.division,
          auth.session.id,
          parsed.data.studentId,
          parsed.data.idempotencyKey,
        ].join(":")
      : null;

    if (!idempotencyKey) {
      const result = await renewAndPay(params.division, auth.session, parsed.data);
      return NextResponse.json(result, { status: 201 });
    }

    pruneRenewIdempotencyCache();
    const existing = renewIdempotencyCache.get(idempotencyKey);
    if (existing) {
      const result = await existing.promise;
      return NextResponse.json(result, { status: 201 });
    }

    const promise = renewAndPay(params.division, auth.session, parsed.data);
    renewIdempotencyCache.set(idempotencyKey, {
      createdAt: Date.now(),
      promise,
    });

    const result = await promise;
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (parsed.success && parsed.data.idempotencyKey) {
      renewIdempotencyCache.delete(
        [
          params.division,
          auth.session.id,
          parsed.data.studentId,
          parsed.data.idempotencyKey,
        ].join(":"),
      );
    }
    return toApiErrorResponse(error, PAYMENT_API_MESSAGES.renewError);
  }
}
