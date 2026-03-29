import { errorResponse, jsonResponse } from "@/lib/http";
import { getJoinedMembershipByStudent, getRoomById } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthorizedStudent } from "@/lib/student-access";

type JoinRoomPayload = {
  password?: string;
};

type JoinRoomRouteProps = {
  params: {
    roomId: string;
  };
};

type RpcJoinError = {
  code?: string;
  details?: string | null;
  message?: string;
};

function createJoinErrorResponse(error: RpcJoinError) {
  if (error.code === "RJ429") {
    return jsonResponse(
      {
        message:
          "비밀번호를 5회 잘못 입력해 5분 동안 잠겼습니다. 잠시 후 다시 시도해주세요.",
        lockedUntil: error.details ?? null,
      },
      { status: 429 },
    );
  }

  if (error.code === "RJ401") {
    const remainingAttempts = Number.parseInt(error.details ?? "", 10);

    return jsonResponse(
      {
        message:
          Number.isFinite(remainingAttempts) && remainingAttempts > 0
            ? `비밀번호가 올바르지 않습니다. ${remainingAttempts}회 더 틀리면 5분 동안 잠깁니다.`
            : "비밀번호가 올바르지 않습니다.",
        remainingAttempts:
          Number.isFinite(remainingAttempts) && remainingAttempts >= 0
            ? remainingAttempts
            : null,
      },
      { status: 400 },
    );
  }

  if (error.code === "RJ410") {
    return errorResponse("닫힌 조 방에는 입장할 수 없습니다.", 409);
  }

  if (error.code === "RJ409") {
    return errorResponse("이미 다른 조에 소속되어 있습니다.", 409);
  }

  if (error.code === "RJ420") {
    return errorResponse("선택한 조 방의 정원이 가득 찼습니다.", 409);
  }

  if (error.code === "RJ404") {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  return errorResponse(error.message || "조 방 입장에 실패했습니다.", 400);
}

export async function POST(request: Request, { params }: JoinRoomRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const body = (await request.json()) as JoinRoomPayload;

  if (!body.password?.trim()) {
    return errorResponse("방 비밀번호를 입력해주세요.");
  }

  const room = await getRoomById(params.roomId);

  if (!room) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  if (room.sessionId !== student.session_id) {
    return errorResponse("같은 면접반의 조 방만 입장할 수 있습니다.", 409);
  }

  const session = await getSessionById(student.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 면접반을 찾을 수 없습니다.", 404);
  }

  const applyWindowStatus = getApplyWindowStatus(session);

  if (applyWindowStatus === "before_open") {
    return errorResponse("지원 오픈 전입니다.", 409);
  }

  if (applyWindowStatus === "after_close") {
    return errorResponse("지원이 마감되어 더는 입장할 수 없습니다.", 409);
  }

  const existingMembership = await getJoinedMembershipByStudent(student.id);

  if (existingMembership && existingMembership.room_id !== params.roomId) {
    return errorResponse("이미 다른 조에 소속되어 있습니다.", 409);
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("join_group_room", {
    p_room_id: params.roomId,
    p_student_id: student.id,
    p_password: body.password.trim(),
  });

  if (error) {
    return createJoinErrorResponse(error as RpcJoinError);
  }

  await Promise.all([
    supabase
      .from("waiting_pool")
      .delete()
      .eq("session_id", student.session_id)
      .eq("student_id", student.id),
    supabase.from("chat_messages").insert({
      room_id: params.roomId,
      student_id: null,
      message: `${student.name}님이 조 방에 입장했습니다.`,
      is_system: true,
    }),
  ]);

  return jsonResponse({
    roomId: params.roomId,
  });
}
