import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { rulesSettingsSchema } from "@/lib/settings-schemas";
import {
  getDivisionRuleSettings,
  updateDivisionRuleSettings,
} from "@/lib/services/settings.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const settings = await getDivisionRuleSettings(params.division);
    return NextResponse.json({ settings }, { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "설정 정보를 불러오지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = rulesSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const settings = await updateDivisionRuleSettings(params.division, parsed.data);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "운영 규칙 저장에 실패했습니다." },
      { status: 400 },
    );
  }
}
