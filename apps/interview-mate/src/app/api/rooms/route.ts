import { errorResponse, jsonResponse } from "@/lib/http";
import { generateInviteCode } from "@/lib/invite";
import { getJoinedMembershipByStudent } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthorizedStudent } from "@/lib/student-access";

type CreateRoomPayload = {
  roomName?: string;
  password?: string;
  maxMembers?: number;
};

export async function POST(request: Request) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const body = (await request.json()) as CreateRoomPayload;

  if (!body.password?.trim()) {
    return errorResponse("방 비밀번호를 입력해 주세요.");
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
    return errorResponse("지원이 마감되었습니다.", 409);
  }

  const existingMembership = await getJoinedMembershipByStudent(student.id);

  if (existingMembership) {
    return errorResponse("이미 다른 조에 속해 있습니다.", 409);
  }

  const maxMembers =
    typeof body.maxMembers === "number" &&
    body.maxMembers >= 2 &&
    body.maxMembers <= session.max_group_size
      ? body.maxMembers
      : session.max_group_size;

  const supabase = createServerSupabaseClient();
  const roomName = body.roomName?.trim() || `${student.name}의 조`;
  const { data, error } = await supabase.rpc("create_group_room", {
    p_session_id: student.session_id,
    p_student_id: student.id,
    p_room_name: roomName,
    p_invite_code: generateInviteCode(),
    p_password: body.password.trim(),
    p_max_members: maxMembers,
  });

  if (error) {
    return errorResponse("조 방을 생성하지 못했습니다. 입력값과 현재 상태를 확인해 주세요.", 400);
  }

  const room = data as { id: string; invite_code: string; room_name: string | null };

  await Promise.all([
    supabase
      .from("waiting_pool")
      .delete()
      .eq("session_id", student.session_id)
      .eq("student_id", student.id),
    supabase.from("chat_messages").insert({
      room_id: room.id,
      student_id: null,
      message: `${student.name}님이 조 방을 만들었습니다.`,
      is_system: true,
    }),
  ]);

  return jsonResponse(
    {
      room: {
        id: room.id,
        roomName: room.room_name,
        inviteCode: room.invite_code,
      },
    },
    { status: 201 },
  );
}
