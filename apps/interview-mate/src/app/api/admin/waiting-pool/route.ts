import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, internalErrorResponse, jsonResponse } from "@/lib/http";
import { getRoomById } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type WaitingRow = {
  id: string;
  session_id: string;
  student_id: string;
  assigned_room_id: string | null;
  created_at: string;
};

type StudentRow = {
  id: string;
  name: string;
  phone: string;
  gender: string;
  series: string;
  region: string;
  score: number | null;
  interview_experience: boolean | null;
};

type AssignWaitingPayload = {
  waitingId?: string;
  roomId?: string;
};

type ExistingMembershipRow = {
  id: string;
  role: "creator" | "leader" | "member";
  status: "joined" | "left";
  left_at: string | null;
};

type MembershipMutation =
  | {
      type: "none";
    }
  | {
      type: "restore";
      membershipId: string;
      previousRole: ExistingMembershipRow["role"];
      previousStatus: ExistingMembershipRow["status"];
      previousLeftAt: string | null;
    }
  | {
      type: "insert";
      membershipId: string;
    };

async function rollbackMembershipMutation(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  mutation: MembershipMutation,
) {
  if (mutation.type === "none") {
    return;
  }

  if (mutation.type === "restore") {
    const { error } = await supabase
      .from("room_members")
      .update({
        role: mutation.previousRole,
        status: mutation.previousStatus,
        left_at: mutation.previousLeftAt,
      })
      .eq("id", mutation.membershipId);

    if (error) {
      throw new Error(`멤버 상태 롤백에 실패했습니다. ${error.message}`);
    }

    return;
  }

  const { error } = await supabase
    .from("room_members")
    .delete()
    .eq("id", mutation.membershipId);

  if (error) {
    throw new Error(`생성된 멤버 롤백에 실패했습니다. ${error.message}`);
  }
}

export async function GET(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return errorResponse("session_id가 필요합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("waiting_pool")
    .select("id, session_id, student_id, assigned_room_id, created_at")
    .eq("session_id", sessionId)
    .is("assigned_room_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    return errorResponse("대기자 목록을 불러오지 못했습니다.", 500);
  }

  const waitingEntries = (data ?? []) as WaitingRow[];
  const studentIds = waitingEntries.map((entry) => entry.student_id);

  if (studentIds.length === 0) {
    return jsonResponse({ waitingStudents: [] });
  }

  const { data: studentsData, error: studentsError } = await supabase
    .from("students")
    .select("id, name, phone, gender, series, region, score, interview_experience")
    .in("id", studentIds);

  if (studentsError) {
    return errorResponse("대기자 상세 정보를 불러오지 못했습니다.", 500);
  }

  const studentMap = new Map(
    ((studentsData ?? []) as StudentRow[]).map((student) => [student.id, student]),
  );

  return jsonResponse({
    waitingStudents: waitingEntries
      .map((entry) => {
        const student = studentMap.get(entry.student_id);

        if (!student) {
          return null;
        }

        return {
          id: entry.id,
          sessionId: entry.session_id,
          studentId: entry.student_id,
          assignedRoomId: entry.assigned_room_id,
          createdAt: entry.created_at,
          name: student.name,
          phone: student.phone,
          gender: student.gender,
          series: student.series,
          region: student.region,
          score: student.score,
          interviewExperience: student.interview_experience,
        };
      })
      .filter(Boolean),
  });
}

export async function PATCH(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as AssignWaitingPayload;

  if (!body.waitingId || !body.roomId) {
    return errorResponse("waitingId와 roomId가 필요합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: waitingEntry, error: waitingError } = await supabase
    .from("waiting_pool")
    .select("id, session_id, student_id, assigned_room_id, created_at")
    .eq("id", body.waitingId)
    .maybeSingle();

  if (waitingError) {
    return errorResponse("대기자 정보를 확인하지 못했습니다.", 500);
  }

  if (!waitingEntry) {
    return errorResponse("대기자 정보를 찾을 수 없습니다.", 404);
  }

  if (waitingEntry.assigned_room_id && waitingEntry.assigned_room_id !== body.roomId) {
    return errorResponse("이미 다른 조에 배정된 학생입니다.", 409);
  }

  const room = await getRoomById(body.roomId);

  if (!room) {
    return errorResponse("조 방을 찾을 수 없습니다.", 404);
  }

  if (room.sessionId !== waitingEntry.session_id) {
    return errorResponse("같은 세션의 조 방에만 배정할 수 있습니다.");
  }

  if (room.status === "closed") {
    return errorResponse("닫힌 조 방에는 배정할 수 없습니다.", 409);
  }

  const session = await getSessionById(room.sessionId);

  if (!session) {
    return errorResponse("세션 정보를 찾을 수 없습니다.", 404);
  }

  const [
    { data: joinedMembership, error: joinedMembershipError },
    { data: roomMembers, error: roomMembersError },
    { data: existingMembership, error: existingMembershipError },
  ] = await Promise.all([
    supabase
      .from("room_members")
      .select("id, room_id, role, status")
      .eq("student_id", waitingEntry.student_id)
      .eq("status", "joined")
      .maybeSingle(),
    supabase
      .from("room_members")
      .select("id")
      .eq("room_id", body.roomId)
      .eq("status", "joined"),
    supabase
      .from("room_members")
      .select("id, role, status, left_at")
      .eq("room_id", body.roomId)
      .eq("student_id", waitingEntry.student_id)
      .maybeSingle(),
  ]);

  if (joinedMembershipError || roomMembersError || existingMembershipError) {
    return errorResponse("배정 전 검증을 처리하지 못했습니다.", 500);
  }

  if (joinedMembership && joinedMembership.room_id !== body.roomId) {
    return errorResponse("이미 다른 조에 소속된 학생입니다.", 409);
  }

  if ((roomMembers ?? []).length >= room.maxMembers && !joinedMembership) {
    return errorResponse("선택한 조 방의 정원이 가득 찼습니다.", 409);
  }

  let membershipMutation: MembershipMutation = { type: "none" };

  if (existingMembership && existingMembership.status !== "joined") {
    const { error: restoreMembershipError } = await supabase
      .from("room_members")
      .update({
        status: "joined",
        left_at: null,
        role: existingMembership.role === "creator" ? "creator" : "member",
      })
      .eq("id", existingMembership.id);

    if (restoreMembershipError) {
      return errorResponse("기존 멤버 상태를 복구하지 못했습니다.", 500);
    }

    membershipMutation = {
      type: "restore",
      membershipId: existingMembership.id,
      previousRole: existingMembership.role,
      previousStatus: existingMembership.status,
      previousLeftAt: existingMembership.left_at,
    };
  } else if (!joinedMembership && !existingMembership) {
    const { data: insertedMembership, error: insertMembershipError } = await supabase
      .from("room_members")
      .insert({
        room_id: body.roomId,
        student_id: waitingEntry.student_id,
        role: "member",
        status: "joined",
      })
      .select("id")
      .single();

    if (insertMembershipError || !insertedMembership) {
      return errorResponse("대기자를 조 방에 배정하지 못했습니다.", 500);
    }

    membershipMutation = {
      type: "insert",
      membershipId: insertedMembership.id,
    };
  }

  const { error: assignWaitingError } = await supabase
    .from("waiting_pool")
    .update({
      assigned_room_id: body.roomId,
    })
    .eq("id", body.waitingId);

  if (assignWaitingError) {
    try {
      await rollbackMembershipMutation(supabase, membershipMutation);
    } catch (rollbackError) {
      return internalErrorResponse(
        "대기자 배정에 실패했고 멤버 상태 롤백도 실패했습니다.",
        {
          error: rollbackError,
          scope: "admin/waiting-pool:rollback-membership",
          details: {
            waitingId: body.waitingId,
            roomId: body.roomId,
          },
        },
      );
    }

    return internalErrorResponse("대기자 배정 정보를 업데이트하지 못했습니다.", {
      error: assignWaitingError,
      scope: "admin/waiting-pool:update-assignment",
      details: {
        waitingId: body.waitingId,
        roomId: body.roomId,
      },
    });
  }

  const warnings: string[] = [];
  const notices: Array<{
    room_id: string;
    student_id: null;
    message: string;
    is_system: true;
  }> = [];
  const { data: studentData, error: studentError } = await supabase
    .from("students")
    .select("name")
    .eq("id", waitingEntry.student_id)
    .maybeSingle();

  if (studentError) {
    warnings.push("배정 학생 이름을 불러오지 못해 안내 메시지 일부가 기본값으로 기록되었습니다.");
  }

  notices.push({
    room_id: body.roomId,
    student_id: null,
    message: `${studentData?.name ?? "대기자"}님이 관리자에 의해 조 방에 배정되었습니다.`,
    is_system: true,
  });

  if (room.requestExtraMembers > 0) {
    const nextRequestExtraMembers = Math.max(room.requestExtraMembers - 1, 0);
    const { error: roomUpdateError } = await supabase
      .from("group_rooms")
      .update({
        request_extra_members: nextRequestExtraMembers,
        request_extra_reason:
          nextRequestExtraMembers > 0 ? room.requestExtraReason : null,
      })
      .eq("id", body.roomId);

    if (roomUpdateError) {
      warnings.push("추가 인원 요청 카운트를 갱신하지 못했습니다.");
    } else {
      notices.push({
        room_id: body.roomId,
        student_id: null,
        message:
          nextRequestExtraMembers > 0
            ? `추가 인원 요청이 1명 반영되어 현재 ${nextRequestExtraMembers}명 남아 있습니다.`
            : "추가 인원 요청이 모두 충족되었습니다.",
        is_system: true,
      });
    }
  }

  const { error: noticeError } = await supabase
    .from("chat_messages")
    .insert(notices);

  if (noticeError) {
    warnings.push("배정 안내 시스템 메시지를 남기지 못했습니다.");
  }

  return jsonResponse({
    waitingId: waitingEntry.id,
    roomId: body.roomId,
    sessionId: session.id,
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
  });
}
