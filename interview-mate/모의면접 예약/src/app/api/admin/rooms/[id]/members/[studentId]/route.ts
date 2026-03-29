import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { removeJoinedMemberFromRoom } from "@/lib/room-admin-actions";
import { getRoomDetail } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";

type RoomMemberRouteProps = {
  params: {
    id: string;
    studentId: string;
  };
};

export async function DELETE(
  request: Request,
  { params }: RoomMemberRouteProps,
) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const detail = await getRoomDetail(params.id);

  if (!detail) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  const session = await getSessionById(detail.room.sessionId);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 세션이 아니어서 멤버를 퇴장시킬 수 없습니다.", 409);
  }

  const target = detail.members.find((member) => member.studentId === params.studentId);

  if (!target) {
    return errorResponse("퇴장시킬 멤버를 찾을 수 없습니다.", 404);
  }

  await removeJoinedMemberFromRoom({
    roomId: params.id,
    sessionId: detail.room.sessionId,
    membershipId: target.id,
    studentId: target.studentId,
    studentName: target.name,
    role: target.role,
    noticeMessage: `${target.name}님이 관리자에 의해 조에서 퇴장했습니다.`,
  });

  return jsonResponse({
    roomId: params.id,
    studentId: target.studentId,
    movedToWaitingPool: true,
  });
}
