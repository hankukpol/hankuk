import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { buildMessagePreview } from "@/lib/chat-meta";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getChatUnreadSummary } from "@/lib/services/chat.service";

/**
 * 레이아웃에 상주하는 감시자의 폴링 대상.
 * 알림 문구까지 한 번에 만들 수 있도록 최신 메시지 미리보기를 함께 내려준다.
 */
export async function GET(
  _request: NextRequest,
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

  try {
    const summary = await getChatUnreadSummary(params.division, auth.session);
    const latest = summary.latestMessage;

    return NextResponse.json(
      {
        unreadCount: summary.unreadCount,
        latestMessage: latest
          ? {
              id: latest.id,
              authorId: latest.authorId,
              authorName: latest.authorName,
              preview: buildMessagePreview(latest.body),
              createdAt: latest.createdAt,
            }
          : null,
        syncedAt: latest?.updatedAt ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return toApiErrorResponse(error, "채팅 알림을 확인하는 중 오류가 발생했습니다.");
  }
}
