import { errorResponse, jsonResponse } from "@/lib/http";
import { getRoomDetail, getJoinedRoomMember } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthorizedStudent } from "@/lib/student-access";

type LeaderRouteProps = {
  params: {
    roomId: string;
  };
};

type LeaderPayload = {
  leaderStudentId?: string;
};

export async function PATCH(request: Request, { params }: LeaderRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("조장 위임 권한이 없습니다.", 403);
  }

  if (membership.role !== "creator" && membership.role !== "leader") {
    return errorResponse("방장 또는 조장만 조장을 위임할 수 있습니다.", 403);
  }

  const detail = await getRoomDetail(params.roomId);

  if (!detail) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  const session = await getSessionById(detail.room.sessionId);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 세션을 찾을 수 없습니다.", 404);
  }

  if (getApplyWindowStatus(session) === "after_close") {
    return errorResponse("지원 마감 이후에는 조장 위임이 불가능합니다.", 409);
  }

  const body = (await request.json().catch(() => ({}))) as LeaderPayload;
  const nextLeaderStudentId = body.leaderStudentId?.trim();

  if (!nextLeaderStudentId) {
    return errorResponse("새 조장을 선택해 주세요.");
  }

  const currentLeader =
    detail.members.find((member) => member.role === "leader") ?? null;
  const nextLeader =
    detail.members.find((member) => member.studentId === nextLeaderStudentId) ?? null;

  if (!nextLeader) {
    return errorResponse("위임할 조원을 찾을 수 없습니다.", 404);
  }

  if (nextLeader.role === "creator") {
    return errorResponse("방장은 조장으로 지정할 수 없습니다.");
  }

  if (currentLeader && currentLeader.studentId === nextLeader.studentId) {
    return errorResponse("이미 조장으로 지정된 조원입니다.");
  }

  const supabase = createServerSupabaseClient();

  if (currentLeader) {
    const { error: resetLeaderError } = await supabase
      .from("room_members")
      .update({ role: "member" })
      .eq("id", currentLeader.id);

    if (resetLeaderError) {
      return errorResponse("기존 조장 정보를 해제하지 못했습니다.", 500);
    }
  }

  const { error: nextLeaderError } = await supabase
    .from("room_members")
    .update({ role: "leader" })
    .eq("id", nextLeader.id);

  if (nextLeaderError) {
    return errorResponse("새 조장을 지정하지 못했습니다.", 500);
  }

  const actorLabel = membership.role === "creator" ? "방장" : "조장";
  const { error: chatError } = await supabase.from("chat_messages").insert({
    room_id: params.roomId,
    student_id: null,
    message: `${actorLabel} ${student.name}님이 ${nextLeader.name}님에게 조장을 위임했습니다.`,
    is_system: true,
  });

  if (chatError) {
    return errorResponse("조장 위임 안내 메시지를 저장하지 못했습니다.", 500);
  }

  return jsonResponse({
    leaderStudentId: nextLeader.studentId,
    leaderName: nextLeader.name,
    viewerRole: membership.role === "leader" ? "member" : membership.role,
  });
}
