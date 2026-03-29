import { errorResponse, jsonResponse } from "@/lib/http";
import { getJoinedRoomMember } from "@/lib/room-service";
import { getAuthorizedStudent } from "@/lib/student-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RoomInviteRouteProps = {
  params: {
    roomId: string;
  };
};

export async function GET(request: Request, { params }: RoomInviteRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("조 방 접근 권한이 없습니다.", 403);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("group_rooms")
    .select("id, room_name, invite_code, password")
    .eq("id", params.roomId)
    .maybeSingle();

  if (error || !data) {
    return errorResponse("초대 정보를 불러오지 못했습니다.", 404);
  }

  return jsonResponse({
    invite: {
      roomId: data.id,
      roomName: data.room_name,
      inviteCode: data.invite_code,
      password: data.password,
    },
  });
}
