import { errorResponse, jsonResponse } from "@/lib/http";
import { getRoomByInviteCode, getRoomMembers } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";

type InviteRoomRouteProps = {
  params: {
    inviteCode: string;
  };
};

export async function GET(
  _request: Request,
  { params }: InviteRoomRouteProps,
) {
  const room = await getRoomByInviteCode(params.inviteCode);

  if (!room) {
    return errorResponse("초대 링크를 찾을 수 없습니다.", 404);
  }

  const session = await getSessionById(room.sessionId);
  const members = await getRoomMembers(room.id);

  return jsonResponse({
    room: {
      ...room,
      sessionName: session?.name ?? "면접반",
      track: session?.track ?? null,
      memberCount: members.length,
    },
  });
}
