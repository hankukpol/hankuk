import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { leavePermissionSchema } from "@/lib/leave-schemas";
import { createLeavePermission, listLeavePermissions } from "@/lib/services/leave.service";

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

  try {
    const permissions = await listLeavePermissions(params.division, {
      studentId: request.nextUrl.searchParams.get("studentId") || undefined,
      month: request.nextUrl.searchParams.get("month") || undefined,
    });
    return NextResponse.json({ permissions }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } });
  } catch (error) {
    return toApiErrorResponse(error, "외출/휴가 내역을 불러오지 못했습니다.");
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
  const parsed = leavePermissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "휴가 입력값을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const permission = await createLeavePermission(params.division, auth.session, parsed.data);
    return NextResponse.json({ permission }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "외출/휴가 등록에 실패했습니다.");
  }
}
