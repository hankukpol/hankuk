import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, internalErrorResponse, jsonResponse } from "@/lib/http";
import { generateInviteCode, generateRoomPassword } from "@/lib/invite";
import { getSessionById } from "@/lib/session-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type BulkCreateRoomPayload = {
  sessionId?: string;
  studentIds?: string[];
  roomName?: string;
  password?: string;
  maxMembers?: number;
  status?: "recruiting" | "formed";
};

type WaitingRow = {
  id: string;
  student_id: string;
  created_at: string;
};

type StudentRow = {
  id: string;
  name: string;
};

type RoomInsertRow = {
  id: string;
  room_name: string | null;
  invite_code: string;
  password: string;
  status: "recruiting" | "formed" | "closed";
  max_members: number;
};

async function createAdminRoom(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  options: {
    sessionId: string;
    roomName: string;
    creatorStudentId: string;
    maxMembers: number;
    password: string;
    status: "recruiting" | "formed";
  },
) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("group_rooms")
      .insert({
        session_id: options.sessionId,
        room_name: options.roomName,
        invite_code: generateInviteCode(),
        password: options.password,
        status: options.status,
        creator_student_id: options.creatorStudentId,
        created_by_admin: true,
        max_members: options.maxMembers,
      })
      .select("id, room_name, invite_code, password, status, max_members")
      .single();

    if (!error && data) {
      return data as RoomInsertRow;
    }

    if (error?.code !== "23505") {
      throw error;
    }

    lastError = new Error(error.message);
  }

  throw lastError ?? new Error("조 방을 생성하지 못했습니다.");
}

async function rollbackCreatedRoom(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  options: {
    roomId: string;
    sessionId: string;
    studentIds: string[];
  },
) {
  const rollbackIssues: string[] = [];

  const { error: waitingResetError } = await supabase
    .from("waiting_pool")
    .update({
      assigned_room_id: null,
    })
    .eq("session_id", options.sessionId)
    .in("student_id", options.studentIds);

  if (waitingResetError) {
    rollbackIssues.push(`대기열 롤백 실패: ${waitingResetError.message}`);
  }

  const { error: roomDeleteError } = await supabase
    .from("group_rooms")
    .delete()
    .eq("id", options.roomId);

  if (roomDeleteError) {
    rollbackIssues.push(`생성된 조 삭제 실패: ${roomDeleteError.message}`);
  }

  if (rollbackIssues.length > 0) {
    throw new Error(
      `조 생성 중 오류가 발생했고 자동 롤백도 완료되지 않았습니다. ${rollbackIssues.join(" / ")}`,
    );
  }
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as BulkCreateRoomPayload;
  const sessionId = body.sessionId?.trim();
  const roomName = body.roomName?.trim();
  const password = body.password?.trim() || generateRoomPassword();
  const requestedStatus = body.status === "formed" ? "formed" : "recruiting";
  const selectedStudentIds = Array.from(
    new Set((body.studentIds ?? []).map((studentId) => studentId.trim()).filter(Boolean)),
  );

  if (!sessionId) {
    return errorResponse("sessionId가 필요합니다.");
  }

  if (selectedStudentIds.length === 0) {
    return errorResponse("조 방에 넣을 대기자를 먼저 선택해 주세요.");
  }

  if (password.length > 30) {
    return errorResponse("방 비밀번호는 30자 이하여야 합니다.");
  }

  const session = await getSessionById(sessionId);

  if (!session) {
    return errorResponse("세션을 찾을 수 없습니다.", 404);
  }

  if (session.status !== "active") {
    return errorResponse("운영 중인 세션에서만 조 방을 생성할 수 있습니다.", 409);
  }

  const maxMembers =
    typeof body.maxMembers === "number" && Number.isFinite(body.maxMembers)
      ? Math.trunc(body.maxMembers)
      : Math.max(session.min_group_size, selectedStudentIds.length);

  if (maxMembers < selectedStudentIds.length) {
    return errorResponse("현재 선택한 인원보다 적은 정원으로는 조 방을 만들 수 없습니다.");
  }

  if (maxMembers > session.max_group_size) {
    return errorResponse(`이 세션의 최대 허용 인원은 ${session.max_group_size}명입니다.`);
  }

  const supabase = createServerSupabaseClient();
  const [
    { data: waitingData, error: waitingError },
    { data: joinedData, error: joinedError },
    { data: studentsData, error: studentsError },
  ] = await Promise.all([
    supabase
      .from("waiting_pool")
      .select("id, student_id, created_at")
      .eq("session_id", sessionId)
      .is("assigned_room_id", null)
      .in("student_id", selectedStudentIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("room_members")
      .select("student_id")
      .eq("status", "joined")
      .in("student_id", selectedStudentIds),
    supabase.from("students").select("id, name").in("id", selectedStudentIds),
  ]);

  if (waitingError || joinedError || studentsError) {
    return errorResponse("조 방 생성에 필요한 학생 정보를 확인하지 못했습니다.", 500);
  }

  const waitingRows = (waitingData ?? []) as WaitingRow[];
  const joinedRows = (joinedData ?? []) as Array<{ student_id: string }>;
  const students = (studentsData ?? []) as StudentRow[];

  if (waitingRows.length !== selectedStudentIds.length) {
    return errorResponse("선택한 대기자 중 배정할 수 없는 학생이 포함되어 있습니다.");
  }

  if (joinedRows.length > 0) {
    return errorResponse("선택한 학생 중 이미 다른 조에 속한 학생이 있습니다.");
  }

  const studentMap = new Map(students.map((student) => [student.id, student]));
  const orderedStudents = waitingRows
    .map((row) => studentMap.get(row.student_id))
    .filter((student): student is StudentRow => Boolean(student));

  if (orderedStudents.length !== selectedStudentIds.length) {
    return errorResponse("선택한 학생 정보를 모두 찾지 못했습니다.");
  }

  const resolvedRoomName =
    roomName || `${orderedStudents[0].name} 외 ${Math.max(orderedStudents.length - 1, 0)}명`;
  const room = await createAdminRoom(supabase, {
    sessionId,
    roomName: resolvedRoomName,
    creatorStudentId: orderedStudents[0].id,
    maxMembers,
    password,
    status:
      requestedStatus === "formed" || orderedStudents.length >= session.min_group_size
        ? "formed"
        : "recruiting",
  });

  try {
    const roomMembers = orderedStudents.map((student, index) => ({
      room_id: room.id,
      student_id: student.id,
      role: index === 0 ? "creator" : "member",
      status: "joined" as const,
    }));

    const { error: membersError } = await supabase
      .from("room_members")
      .insert(roomMembers);

    if (membersError) {
      throw membersError;
    }

    const { error: waitingUpdateError } = await supabase
      .from("waiting_pool")
      .update({
        assigned_room_id: room.id,
      })
      .eq("session_id", sessionId)
      .in("student_id", selectedStudentIds);

    if (waitingUpdateError) {
      throw waitingUpdateError;
    }
  } catch (error) {
    try {
      await rollbackCreatedRoom(supabase, {
        roomId: room.id,
        sessionId,
        studentIds: selectedStudentIds,
      });
    } catch (rollbackError) {
      return internalErrorResponse(
        "조 생성 중 오류가 발생했고 자동 롤백도 실패했습니다.",
        {
          error: rollbackError,
          scope: "admin/rooms/bulk:rollback-created-room",
          details: {
            sessionId,
            roomId: room.id,
            studentIds: selectedStudentIds,
          },
        },
      );
    }

    return internalErrorResponse("조 방을 생성하지 못했습니다.", {
      error,
      scope: "admin/rooms/bulk:create-room",
      details: {
        sessionId,
        studentIds: selectedStudentIds,
      },
    });
  }

  const memberNames = orderedStudents.map((student) => student.name).join(", ");
  const { error: messageError } = await supabase.from("chat_messages").insert({
    room_id: room.id,
    student_id: null,
    message: `관리자가 새 조 방을 생성했습니다. 참여 조원: ${memberNames}`,
    is_system: true,
  });

  return jsonResponse(
    {
      room: {
        id: room.id,
        roomName: room.room_name,
        inviteCode: room.invite_code,
        password: room.password,
        status: room.status,
        maxMembers: room.max_members,
        memberCount: orderedStudents.length,
      },
      warning: messageError
        ? "조 방은 생성되었지만 안내 시스템 메시지를 남기지 못했습니다."
        : undefined,
    },
    { status: 201 },
  );
}
