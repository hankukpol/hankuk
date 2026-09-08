import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { getZodErrorMessage, toApiErrorResponse } from "@/lib/api-error-response";
import { chatMessageQuerySchema, chatMessageSchema } from "@/lib/chat-schemas";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { createChatMessage, listChatMessages } from "@/lib/services/chat.service";

const CHAT_ROLES = ["ASSISTANT", "ADMIN", "SUPER_ADMIN"] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, [...CHAT_ROLES]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(params.division, "staffChat");

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = chatMessageQuerySchema.safeParse({
    before: searchParams.get("before") ?? undefined,
    since: searchParams.get("since") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "조회 조건을 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const page = await listChatMessages(params.division, auth.session, parsed.data);
    // 채팅은 항상 최신 상태여야 하므로 캐시하지 않는다.
    return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toApiErrorResponse(error, "채팅을 불러오는 중 오류가 발생했습니다.");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, [...CHAT_ROLES]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(params.division, "staffChat");

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: getZodErrorMessage(parsed.error, "메시지를 다시 확인해주세요.") },
      { status: 400 },
    );
  }

  try {
    const chatMessage = await createChatMessage(params.division, auth.session, parsed.data);
    return NextResponse.json({ chatMessage }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "메시지를 보내는 중 오류가 발생했습니다.");
  }
}
