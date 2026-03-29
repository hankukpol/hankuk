import { getAccessToken } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStudentByAccessToken } from "@/lib/student-access";

async function getAuthorizedStudent(headers: Headers) {
  const accessToken = getAccessToken(headers);

  if (!accessToken) {
    return null;
  }

  return getStudentByAccessToken(accessToken);
}

async function getWaitingEntry(studentId: string, sessionId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("waiting_pool")
    .select("id, session_id, student_id, assigned_room_id, created_at")
    .eq("session_id", sessionId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function GET(request: Request) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const waiting = await getWaitingEntry(student.id, student.session_id);

  if (!waiting) {
    return jsonResponse({ waiting: null });
  }

  let assignedRoom = null;

  if (waiting.assigned_room_id) {
    const supabase = createServerSupabaseClient();
    const { data: room } = await supabase
      .from("group_rooms")
      .select("id, room_name, invite_code, status")
      .eq("id", waiting.assigned_room_id)
      .maybeSingle();

    assignedRoom = room
      ? {
          id: room.id,
          roomName: room.room_name,
          inviteCode: room.invite_code,
          status: room.status,
        }
      : null;
  }

  return jsonResponse({
    waiting: {
      id: waiting.id,
      createdAt: waiting.created_at,
      assignedRoomId: waiting.assigned_room_id,
      assignedRoom,
    },
  });
}

export async function POST(request: Request) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
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
    return errorResponse("지원이 마감되었습니다.", 409);
  }

  const supabase = createServerSupabaseClient();
  const { data: roomMembership, error: roomMembershipError } = await supabase
    .from("room_members")
    .select("id")
    .eq("student_id", student.id)
    .eq("status", "joined")
    .limit(1)
    .maybeSingle();

  if (roomMembershipError) {
    return errorResponse("조 소속 여부를 확인하지 못했습니다.", 500);
  }

  if (roomMembership) {
    return errorResponse("이미 조에 소속되어 있습니다.", 409);
  }

  const { data, error } = await supabase
    .from("waiting_pool")
    .upsert(
      {
        session_id: student.session_id,
        student_id: student.id,
        assigned_room_id: null,
      },
      {
        onConflict: "session_id,student_id",
      },
    )
    .select("id, session_id, student_id, assigned_room_id, created_at")
    .single();

  if (error) {
    return errorResponse("대기자 명단에 등록하지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      waiting: {
        id: data.id,
        createdAt: data.created_at,
        assignedRoomId: data.assigned_room_id,
      },
    },
    { status: 201 },
  );
}
