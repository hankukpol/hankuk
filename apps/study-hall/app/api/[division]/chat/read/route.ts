import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { chatReadSchema } from "@/lib/chat-schemas";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { markChatRead } from "@/lib/services/chat.service";

export async function POST(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ASSISTANT", "ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(params.division, "staffChat");

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = chatReadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "읽음 처리 요청을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const summary = await markChatRead(params.division, auth.session, parsed.data);
    return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toApiErrorResponse(error, "읽음 처리 중 오류가 발생했습니다.");
  }
}
