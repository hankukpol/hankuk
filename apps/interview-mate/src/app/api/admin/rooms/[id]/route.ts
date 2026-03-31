import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, internalErrorResponse, jsonResponse } from "@/lib/http";
import { dissolveRoom } from "@/lib/room-admin-actions";
import { getRoomDetail } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RoomRouteProps = {
  params: {
    id: string;
  };
};

type RoomControlPayload = {
  status?: "recruiting" | "formed" | "closed";
  maxMembers?: number;
  leaderStudentId?: string | null;
  clearExtraRequest?: boolean;
  password?: string;
};

function isRoomStatus(
  value: string | undefined,
): value is "recruiting" | "formed" | "closed" {
  return value === "recruiting" || value === "formed" || value === "closed";
}

async function getRoomPassword(roomId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("group_rooms")
    .select("password")
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.password ?? "";
}

export async function GET(request: Request, { params }: RoomRouteProps) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const detail = await getRoomDetail(params.id);

  if (!detail) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  const session = await getSessionById(detail.room.sessionId);

  if (!session) {
    return errorResponse("세션 정보를 찾을 수 없습니다.", 404);
  }

  const [password, leader] = await Promise.all([
    getRoomPassword(params.id),
    Promise.resolve(
      detail.members.find((member) => member.role === "leader") ?? null,
    ),
  ]);

  return jsonResponse({
    room: {
      ...detail.room,
      track: session.track,
      minGroupSize: session.min_group_size,
      maxAllowedMembers: session.max_group_size,
      leaderStudentId: leader?.studentId ?? null,
      password,
    },
    members: detail.members,
  });
}

export async function PATCH(request: Request, { params }: RoomRouteProps) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const detail = await getRoomDetail(params.id);

  if (!detail) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  const session = await getSessionById(detail.room.sessionId);

  if (!session) {
    return errorResponse("세션 정보를 찾을 수 없습니다.", 404);
  }

  const currentPassword = await getRoomPassword(params.id);
  const body = (await request.json()) as RoomControlPayload;
  const updates: Record<string, unknown> = {};
  const notices: string[] = [];
  const supabase = createServerSupabaseClient();
  const memberCount = detail.members.length;

  if (body.status !== undefined) {
    if (!isRoomStatus(body.status)) {
      return errorResponse("조 방 상태 값이 올바르지 않습니다.");
    }

    if (body.status !== detail.room.status) {
      updates.status = body.status;
      notices.push(`관리자가 방 상태를 ${body.status}(으)로 변경했습니다.`);
    }
  }

  if (body.maxMembers !== undefined) {
    const maxMembers = Math.trunc(body.maxMembers);

    if (maxMembers < 2) {
      return errorResponse("최대 정원은 2명 이상이어야 합니다.");
    }

    if (maxMembers < memberCount) {
      return errorResponse("현재 조원 수보다 적은 정원으로는 변경할 수 없습니다.");
    }

    if (maxMembers > session.max_group_size) {
      return errorResponse(
        `이 세션의 최대 허용 정원은 ${session.max_group_size}명입니다.`,
      );
    }

    if (maxMembers !== detail.room.maxMembers) {
      updates.max_members = maxMembers;
      notices.push(`관리자가 방 정원을 ${maxMembers}명으로 변경했습니다.`);
    }
  }

  if (body.password !== undefined) {
    const nextPassword = body.password.trim();

    if (!nextPassword) {
      return errorResponse("방 비밀번호를 입력해 주세요.");
    }

    if (nextPassword.length > 30) {
      return errorResponse("방 비밀번호는 30자 이하여야 합니다.");
    }

    if (nextPassword !== currentPassword) {
      updates.password = nextPassword;
      notices.push("관리자가 방 비밀번호를 변경했습니다.");
    }
  }

  if (body.clearExtraRequest) {
    updates.request_extra_members = 0;
    updates.request_extra_reason = null;
    notices.push("추가 인원 요청이 관리자에 의해 처리 완료되었습니다.");
  }

  const currentLeader =
    detail.members.find((member) => member.role === "leader") ?? null;
  const nextLeader =
    body.leaderStudentId === undefined
      ? currentLeader
      : body.leaderStudentId === null || body.leaderStudentId === ""
        ? null
        : detail.members.find((member) => member.studentId === body.leaderStudentId) ??
          null;

  if (body.leaderStudentId && !nextLeader) {
    return errorResponse("조장으로 지정할 멤버를 찾을 수 없습니다.");
  }

  if (nextLeader?.role === "creator") {
    return errorResponse(
      "방장은 creator 역할로 유지됩니다. 조장은 다른 멤버로 지정해 주세요.",
    );
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateRoomError } = await supabase
      .from("group_rooms")
      .update(updates)
      .eq("id", params.id);

    if (updateRoomError) {
      return errorResponse("조 방 정보를 업데이트하지 못했습니다.", 500);
    }
  }

  let warning: string | undefined;

  if (body.leaderStudentId !== undefined) {
    const leaderChanged =
      (currentLeader?.id ?? null) !== (nextLeader?.id ?? null);

    if (leaderChanged) {
      let promotedNextLeader = false;

      if (nextLeader && nextLeader.role !== "leader") {
        const { error: nextLeaderError } = await supabase
          .from("room_members")
          .update({ role: "leader" })
          .eq("id", nextLeader.id);

        if (nextLeaderError) {
          return errorResponse("새 조장을 지정하지 못했습니다.", 500);
        }

        promotedNextLeader = true;
      }

      if (currentLeader) {
        const { error: resetLeaderError } = await supabase
          .from("room_members")
          .update({ role: "member" })
          .eq("id", currentLeader.id);

        if (resetLeaderError) {
          if (promotedNextLeader && nextLeader) {
            const { error: rollbackLeaderError } = await supabase
              .from("room_members")
              .update({ role: "member" })
              .eq("id", nextLeader.id);

            if (rollbackLeaderError) {
              return errorResponse(
                `조장 변경에 실패했고 역할 롤백도 실패했습니다. ${rollbackLeaderError.message}`,
                500,
              );
            }
          }

          return errorResponse("기존 조장 정보를 해제하지 못했습니다.", 500);
        }
      }

      if (nextLeader) {
        notices.push(`${nextLeader.name}님을 새 조장으로 지정했습니다.`);
      } else if (currentLeader) {
        notices.push("조장 지정을 해제했습니다.");
      }
    }
  }

  if (notices.length > 0) {
    const { error: noticeError } = await supabase.from("chat_messages").insert(
      notices.map((message) => ({
        room_id: params.id,
        student_id: null,
        message,
        is_system: true,
      })),
    );

    if (noticeError) {
      warning = "방 설정은 저장되었지만 운영 변경 공지를 남기지 못했습니다.";
    }
  }

  const updatedDetail = await getRoomDetail(params.id);

  if (!updatedDetail) {
    return errorResponse("수정된 조 방을 다시 불러오지 못했습니다.", 500);
  }

  const updatedPassword = await getRoomPassword(params.id);
  const leader =
    updatedDetail.members.find((member) => member.role === "leader") ?? null;

  return jsonResponse({
    room: {
      ...updatedDetail.room,
      track: session.track,
      minGroupSize: session.min_group_size,
      maxAllowedMembers: session.max_group_size,
      leaderStudentId: leader?.studentId ?? null,
      password: updatedPassword,
    },
    members: updatedDetail.members,
    warning,
  });
}

export async function DELETE(request: Request, { params }: RoomRouteProps) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const detail = await getRoomDetail(params.id);

  if (!detail) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  const session = await getSessionById(detail.room.sessionId);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 세션이 아니어서 방을 해산할 수 없습니다.", 409);
  }

  try {
    const result = await dissolveRoom({
      roomId: params.id,
      sessionId: detail.room.sessionId,
      members: detail.members.map((member) => ({
        id: member.id,
        studentId: member.studentId,
        name: member.name,
      })),
      noticeMessage: "관리자에 의해 조 방이 해산되었습니다.",
    });

    return jsonResponse({
      dissolved: true,
      ...result,
    });
  } catch (error) {
    return internalErrorResponse("조 방을 해산하지 못했습니다.", {
      error,
      scope: "admin/rooms:delete",
      details: {
        roomId: params.id,
        sessionId: detail.room.sessionId,
      },
    });
  }
}
