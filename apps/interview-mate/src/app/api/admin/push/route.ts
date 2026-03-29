import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { sendPushToAll, sendPushToSession } from "@/lib/push";

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  sessionId?: string;
};

export async function POST(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const payload = (await request.json().catch(() => ({}))) as PushPayload;
  const title = payload.title?.trim();
  const body = payload.body?.trim();

  if (!title || !body) {
    return errorResponse("제목과 내용을 입력해주세요.");
  }

  const message = { title, body, url: payload.url?.trim() || "/" };

  try {
    const result = payload.sessionId
      ? await sendPushToSession(payload.sessionId, message)
      : await sendPushToAll(message);

    return jsonResponse({
      ...result,
      message: `${result.sent}건 발송, ${result.failed}건 실패`,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "푸시 알림 발송에 실패했습니다.",
      500,
    );
  }
}
