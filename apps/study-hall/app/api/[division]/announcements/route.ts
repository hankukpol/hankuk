import { NextRequest, NextResponse } from "next/server";

import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { announcementSchema } from "@/lib/announcement-schemas";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import {
  createAnnouncement,
  listAnnouncements,
} from "@/lib/services/announcement.service";

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
    "announcements",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const announcements = await listAnnouncements(params.division, { includeScheduled: true });
    return NextResponse.json({ announcements }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
  } catch (error) {
    return toApiErrorResponse(error, "공지사항 처리 중 오류가 발생했습니다.");
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
    "announcements",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = announcementSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "공지사항 정보를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const announcement = await createAnnouncement(params.division, auth.session, parsed.data);
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "공지사항 처리 중 오류가 발생했습니다.");
  }
}
