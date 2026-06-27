import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { pointBatchSchema } from "@/lib/point-schemas";
import {
  createPointRecordsBatch,
  type PointBatchGrantResult,
} from "@/lib/services/point.service";

const POINT_BATCH_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const pointBatchIdempotencyCache = new Map<
  string,
  { createdAt: number; promise: Promise<PointBatchGrantResult> }
>();

function prunePointBatchIdempotencyCache() {
  const now = Date.now();

  pointBatchIdempotencyCache.forEach((entry, key) => {
    if (now - entry.createdAt > POINT_BATCH_IDEMPOTENCY_TTL_MS) {
      pointBatchIdempotencyCache.delete(key);
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

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "pointManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = pointBatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "일괄 상벌점 입력값을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const idempotencyKey = parsed.data.idempotencyKey
      ? [
          params.division,
          auth.session.id,
          parsed.data.date,
          parsed.data.idempotencyKey,
        ].join(":")
      : null;

    if (!idempotencyKey) {
      const result = await createPointRecordsBatch(params.division, auth.session, parsed.data);
      return NextResponse.json({ result }, { status: 201 });
    }

    prunePointBatchIdempotencyCache();
    const existing = pointBatchIdempotencyCache.get(idempotencyKey);
    if (existing) {
      const result = await existing.promise;
      return NextResponse.json({ result }, { status: 201 });
    }

    const promise = createPointRecordsBatch(params.division, auth.session, parsed.data);
    pointBatchIdempotencyCache.set(idempotencyKey, {
      createdAt: Date.now(),
      promise,
    });

    const result = await promise;
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    if (parsed.success && parsed.data.idempotencyKey) {
      pointBatchIdempotencyCache.delete(
        [
          params.division,
          auth.session.id,
          parsed.data.date,
          parsed.data.idempotencyKey,
        ].join(":"),
      );
    }
    return toApiErrorResponse(error, "일괄 상벌점 부여에 실패했습니다.");
  }
}
