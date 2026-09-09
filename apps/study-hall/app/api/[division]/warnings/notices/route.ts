import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { warningNoticeSchema } from "@/lib/warning-notice-schemas";
import {
  createWarningNotice,
  listWarningNotices,
} from "@/lib/services/warning-notice.service";

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
    "warningManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const notices = await listWarningNotices(params.division, {
      studentId: request.nextUrl.searchParams.get("studentId") || undefined,
    });
    return NextResponse.json({ notices });
  } catch (error) {
    return toApiErrorResponse(error, "경고 안내 이력을 불러오지 못했습니다.");
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
    "warningManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = warningNoticeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "안내 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const notice = await createWarningNotice(params.division, auth.session, parsed.data);
    return NextResponse.json({ notice }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "경고 안내 기록에 실패했습니다.");
  }
}
