import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { deleteChatMessage } from "@/lib/services/chat.service";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { division: string; id: string } },
) {
  const auth = await requireApiAuth(params.division, ["ASSISTANT", "ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(params.division, "staffChat");

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    // 소프트 삭제. 호출자가 목록에서 제자리 교체할 수 있도록 자리표시를 돌려준다.
    const chatMessage = await deleteChatMessage(params.division, auth.session, params.id);
    return NextResponse.json({ chatMessage });
  } catch (error) {
    return toApiErrorResponse(error, "메시지를 삭제하는 중 오류가 발생했습니다.");
  }
}
