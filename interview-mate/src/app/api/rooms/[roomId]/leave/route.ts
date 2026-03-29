import { errorResponse, jsonResponse } from "@/lib/http";
import { removeJoinedMemberFromRoom } from "@/lib/room-admin-actions";
import { getJoinedRoomMember, getRoomById } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthorizedStudent } from "@/lib/student-access";

type LeaveRoomRouteProps = {
  params: {
    roomId: string;
  };
};

export async function POST(request: Request, { params }: LeaveRoomRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const room = await getRoomById(params.roomId);

  if (!room) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("현재 이 조 방에 소속되어 있지 않습니다.", 409);
  }

  const session = await getSessionById(student.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 면접반을 찾을 수 없습니다.", 404);
  }

  const applyWindowStatus = getApplyWindowStatus(session);

  if (applyWindowStatus === "after_close") {
    return errorResponse("지원 마감 이후에는 조 변경이 불가합니다.", 409);
  }

  const supabase = createServerSupabaseClient();
  const { data: joinedPeers, error: joinedPeersError } = await supabase
    .from("room_members")
    .select("student_id")
    .eq("room_id", params.roomId)
    .eq("status", "joined")
    .neq("student_id", student.id);

  if (joinedPeersError) {
    return errorResponse("같은 방 조원 정보를 확인하지 못했습니다.", 500);
  }

  if (membership.role === "leader" && (joinedPeers?.length ?? 0) > 0) {
    return errorResponse(
      "조장은 다른 조원에게 조장을 위임한 뒤에만 탈퇴할 수 있습니다.",
      409,
    );
  }

  await removeJoinedMemberFromRoom({
    roomId: params.roomId,
    sessionId: student.session_id,
    membershipId: membership.id,
    studentId: student.id,
    studentName: student.name,
    role: membership.role,
    noticeMessage: `${student.name}님이 조 방에서 탈퇴했습니다.`,
  });

  return jsonResponse({
    roomId: params.roomId,
    movedToWaitingPool: true,
  });
}
