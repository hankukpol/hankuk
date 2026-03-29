import { errorResponse, jsonResponse } from "@/lib/http";
import { getJoinedRoomMember } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { getAuthorizedStudent } from "@/lib/student-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PollControlRouteProps = {
  params: {
    roomId: string;
    pollId: string;
  };
};

export async function PATCH(
  request: Request,
  { params }: PollControlRouteProps,
) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("조 방 접근 권한이 없습니다.", 403);
  }

  if (membership.role !== "creator" && membership.role !== "leader") {
    return errorResponse("방장 또는 조장만 투표를 마감할 수 있습니다.", 403);
  }

  const session = await getSessionById(student.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("?댁쁺 以묒씤 硫댁젒諛섏쓣 李얠쓣 ???놁뒿?덈떎.", 404);
  }

  if (getApplyWindowStatus(session) === "after_close") {
    return errorResponse("吏??留덇컧 ?댄썑?먮뒗 ?ы몴瑜?留덇컧?????놁뒿?덈떎.", 409);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("study_polls")
    .update({
      is_closed: true,
    })
    .eq("id", params.pollId)
    .eq("room_id", params.roomId)
    .eq("is_closed", false)
    .select("id")
    .maybeSingle();

  if (error) {
    return errorResponse("투표를 마감하지 못했습니다.", 500);
  }

  if (!data) {
    return errorResponse("마감 가능한 투표를 찾을 수 없습니다.", 404);
  }

  await supabase.from("chat_messages").insert({
    room_id: params.roomId,
    student_id: null,
    message: `${student.name}님이 스터디 일정 투표를 마감했습니다.`,
    is_system: true,
  });

  return jsonResponse({
    pollId: params.pollId,
    isClosed: true,
  });
}
