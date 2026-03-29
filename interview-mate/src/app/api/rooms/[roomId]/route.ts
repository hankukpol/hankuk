import { errorResponse, jsonResponse } from "@/lib/http";
import { getRoomDetail, getJoinedRoomMember } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { getAuthorizedStudent } from "@/lib/student-access";

type RoomRouteProps = {
  params: {
    roomId: string;
  };
};

export async function GET(request: Request, { params }: RoomRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("조 방 접근 권한이 없습니다.", 403);
  }

  const detail = await getRoomDetail(params.roomId);

  if (!detail) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  const session = await getSessionById(detail.room.sessionId);

  if (!session) {
    return errorResponse("議?諛? ?몄뀡 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.", 404);
  }

  return jsonResponse({
    ...detail,
    room: {
      ...detail.room,
      track: session.track,
      applyWindowStatus: getApplyWindowStatus(session),
      viewerStudentId: student.id,
    },
    viewerRole: membership.role,
  });
}
