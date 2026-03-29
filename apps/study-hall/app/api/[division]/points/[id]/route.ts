import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { deletePointRecord, listPointRecords } from "@/lib/services/point.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { division: string; id: string } },
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

  try {
    const records = await listPointRecords(params.division, {
      studentId: params.id,
    });
    return NextResponse.json({ records }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } });
  } catch (error) {
    return toApiErrorResponse(error, "상벌점 기록을 불러오지 못했습니다.");
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

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "pointManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    await deletePointRecord(params.division, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, "상벌점 기록 삭제에 실패했습니다.");
  }
}
