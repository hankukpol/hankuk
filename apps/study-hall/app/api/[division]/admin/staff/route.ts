import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { staffCreateSchema } from "@/lib/division-staff-schemas";
import { getDivisionBySlug } from "@/lib/services/division.service";
import {
  createDivisionStaff,
  listDivisionStaff,
} from "@/lib/services/division-staff.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "staffManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const division = await getDivisionBySlug(params.division);
    if (!division) {
      return NextResponse.json({ error: "지점을 찾을 수 없습니다." }, { status: 404 });
    }

    const staff = await listDivisionStaff(division.id, params.division);
    return NextResponse.json({ staff }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
  } catch (error) {
    return toApiErrorResponse(error, "직원 목록을 불러오지 못했습니다.");
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
    "staffManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = staffCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "입력값을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const division = await getDivisionBySlug(params.division);
    if (!division) {
      return NextResponse.json({ error: "지점을 찾을 수 없습니다." }, { status: 404 });
    }

    const staff = await createDivisionStaff(division.id, params.division, parsed.data);
    return NextResponse.json({ staff }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "직원 추가에 실패했습니다.");
  }
}
