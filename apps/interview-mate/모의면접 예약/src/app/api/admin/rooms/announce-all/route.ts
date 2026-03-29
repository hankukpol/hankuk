import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AnnounceAllPayload = {
  sessionId?: string;
  message?: string;
};

export async function POST(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as AnnounceAllPayload;
  const sessionId = body.sessionId?.trim();
  const message = body.message?.trim();

  if (!sessionId) {
    return errorResponse("sessionId가 필요합니다.");
  }

  if (!message) {
    return errorResponse("공지 내용을 입력해 주세요.");
  }

  const notice = `[관리자 공지] ${message}`;

  if (notice.length > 500) {
    return errorResponse("공지 메시지는 500자 이하여야 합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: roomsData, error: roomsError } = await supabase
    .from("group_rooms")
    .select("id")
    .eq("session_id", sessionId)
    .neq("status", "closed");

  if (roomsError) {
    return errorResponse("조 방 목록을 불러오지 못했습니다.", 500);
  }

  if (!roomsData || roomsData.length === 0) {
    return errorResponse("공지할 조 방이 없습니다.", 404);
  }

  const { error: insertError } = await supabase.from("chat_messages").insert(
    roomsData.map((room) => ({
      room_id: room.id,
      student_id: null,
      message: notice,
      is_system: true,
    })),
  );

  if (insertError) {
    return errorResponse("전체 공지를 전송하지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      roomCount: roomsData.length,
    },
    { status: 201 },
  );
}
