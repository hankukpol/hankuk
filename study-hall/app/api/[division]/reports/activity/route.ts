import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import {
  getActivityLogData,
  type ActivityActionType,
} from "@/lib/services/report.service";

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
    "reporting",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const activity = await getActivityLogData(params.division, {
      dateFrom: request.nextUrl.searchParams.get("dateFrom") ?? undefined,
      dateTo: request.nextUrl.searchParams.get("dateTo") ?? undefined,
      actorId: request.nextUrl.searchParams.get("actorId"),
      actionType:
        (request.nextUrl.searchParams.get("actionType") as ActivityActionType | null) ??
        null,
    });

    return NextResponse.json(
      { activity },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    return toApiErrorResponse(error, "활동 로그를 불러오지 못했습니다.");
  }
}
