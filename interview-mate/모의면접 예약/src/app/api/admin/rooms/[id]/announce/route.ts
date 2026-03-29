import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { getRoomById } from "@/lib/room-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RoomAnnouncePayload = {
  message?: string;
};

type RoomAnnounceRouteProps = {
  params: {
    id: string;
  };
};

export async function POST(
  request: Request,
  { params }: RoomAnnounceRouteProps,
) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const room = await getRoomById(params.id);

  if (!room) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  const body = (await request.json()) as RoomAnnouncePayload;
  const message = body.message?.trim();

  if (!message) {
    return errorResponse("공지 내용을 입력해 주세요.");
  }

  const notice = `[관리자 공지] ${message}`;

  if (notice.length > 500) {
    return errorResponse("공지 메시지는 500자 이하여야 합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      room_id: params.id,
      student_id: null,
      message: notice,
      is_system: true,
    })
    .select("id")
    .single();

  if (error) {
    return errorResponse("방 공지를 전송하지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      roomId: params.id,
      messageId: data.id,
    },
    { status: 201 },
  );
}
