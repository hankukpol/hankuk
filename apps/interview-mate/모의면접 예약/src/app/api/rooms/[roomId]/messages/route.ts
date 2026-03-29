import { errorResponse, jsonResponse } from "@/lib/http";
import { getJoinedRoomMember, getRoomMessagesPage } from "@/lib/room-service";
import { getAuthorizedStudent } from "@/lib/student-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type MessagePayload = {
  message?: string;
};

type RoomMessageRouteProps = {
  params: {
    roomId: string;
  };
};

export async function GET(request: Request, { params }: RoomMessageRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("조 방 접근 권한이 없습니다.", 403);
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const payload = await getRoomMessagesPage(params.roomId, {
    before,
    limit: Number.isNaN(limitParam) ? undefined : limitParam,
  });

  return jsonResponse(payload);
}

export async function POST(request: Request, { params }: RoomMessageRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("조 방 접근 권한이 없습니다.", 403);
  }

  const body = (await request.json()) as MessagePayload;
  const message = body.message?.trim();

  if (!message) {
    return errorResponse("메시지를 입력해주세요.");
  }

  if (message.length > 500) {
    return errorResponse("메시지는 500자 이하여야 합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      room_id: params.roomId,
      student_id: student.id,
      message,
      is_system: false,
    })
    .select("id, room_id, student_id, message, is_system, created_at")
    .single();

  if (error) {
    return errorResponse("메시지를 전송하지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      message: {
        id: data.id,
        studentId: data.student_id,
        message: data.message,
        isSystem: data.is_system,
        createdAt: data.created_at,
        senderName: student.name,
      },
    },
    { status: 201 },
  );
}
