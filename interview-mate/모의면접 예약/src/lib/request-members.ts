import { errorResponse, jsonResponse } from "@/lib/http";
import { getJoinedRoomMember, getRoomById } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthorizedStudent } from "@/lib/student-access";

type HandleRequestMembersOptions = {
  headers: Headers;
  roomId: string;
  requestedMembers: number;
  reason?: string;
};

export async function handleRequestMembers({
  headers,
  roomId,
  requestedMembers,
  reason = "",
}: HandleRequestMembersOptions) {
  const student = await getAuthorizedStudent(headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(roomId, student.id);

  if (!membership) {
    return errorResponse("현재 이 조 방에 소속되어 있지 않습니다.", 403);
  }

  if (membership.role !== "creator" && membership.role !== "leader") {
    return errorResponse("방장 또는 조장만 추가 인원을 요청할 수 있습니다.", 403);
  }

  const room = await getRoomById(roomId);

  if (!room) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  const session = await getSessionById(student.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 면접반을 찾을 수 없습니다.", 404);
  }

  const applyWindowStatus = getApplyWindowStatus(session);

  if (applyWindowStatus === "before_open") {
    return errorResponse("지원 시작 전입니다.", 409);
  }

  if (applyWindowStatus === "after_close") {
    return errorResponse("지원 마감 이후에는 추가 인원 요청이 불가합니다.", 409);
  }

  const normalizedRequestedMembers = Math.trunc(requestedMembers);
  const normalizedReason = reason.trim();

  if (
    Number.isNaN(normalizedRequestedMembers) ||
    normalizedRequestedMembers < 0 ||
    normalizedRequestedMembers > 5
  ) {
    return errorResponse("추가 인원 수는 0명 이상 5명 이하로 입력해 주세요.");
  }

  if (normalizedRequestedMembers > 0 && !normalizedReason) {
    return errorResponse("추가 인원 요청 사유를 입력해 주세요.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("group_rooms")
    .update({
      request_extra_members: normalizedRequestedMembers,
      request_extra_reason:
        normalizedRequestedMembers > 0 ? normalizedReason : null,
    })
    .eq("id", roomId)
    .select("id, request_extra_members, request_extra_reason")
    .single();

  if (error) {
    return errorResponse("추가 인원 요청을 저장하지 못했습니다.", 500);
  }

  await supabase.from("chat_messages").insert({
    room_id: roomId,
    student_id: null,
    message:
      normalizedRequestedMembers > 0
        ? `${student.name}님이 추가 인원 ${normalizedRequestedMembers}명을 요청했습니다. (${normalizedReason})`
        : `${student.name}님이 추가 인원 요청을 취소했습니다.`,
    is_system: true,
  });

  return jsonResponse({
    requestExtraMembers: data.request_extra_members,
    requestExtraReason: data.request_extra_reason,
  });
}
