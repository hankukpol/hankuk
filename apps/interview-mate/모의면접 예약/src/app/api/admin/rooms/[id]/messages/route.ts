import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { getRoomMessagesPage } from "@/lib/room-service";

type RoomMessagesRouteProps = {
  params: {
    id: string;
  };
};

export async function GET(
  request: Request,
  { params }: RoomMessagesRouteProps,
) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const before = searchParams.get("before");
    const limitParam = Number.parseInt(searchParams.get("limit") ?? "", 10);
    const payload = await getRoomMessagesPage(params.id, {
      before,
      limit: Number.isNaN(limitParam) ? 50 : limitParam,
    });

    return jsonResponse(payload);
  } catch {
    return errorResponse("방 채팅 내역을 불러오지 못했습니다.", 500);
  }
}
