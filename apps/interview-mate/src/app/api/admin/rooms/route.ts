import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RoomRow = {
  id: string;
  session_id: string;
  room_name: string | null;
  invite_code: string;
  status: "recruiting" | "formed" | "closed";
  creator_student_id: string | null;
  created_by_admin: boolean;
  max_members: number;
  request_extra_members: number;
  request_extra_reason: string | null;
  created_at: string;
};

type RoomMemberRow = {
  room_id: string;
  role: "creator" | "leader" | "member";
  student_id: string;
};

type StudentRow = {
  id: string;
  name: string;
};

type ChatMessageRow = {
  room_id: string;
  message: string;
  created_at: string;
  is_system: boolean;
};

export async function GET(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return errorResponse("session_id가 필요합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: roomsData, error: roomsError } = await supabase
    .from("group_rooms")
    .select(
      "id, session_id, room_name, invite_code, status, creator_student_id, created_by_admin, max_members, request_extra_members, request_extra_reason, created_at",
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (roomsError) {
    return errorResponse("조 방 목록을 불러오지 못했습니다.", 500);
  }

  const rooms = (roomsData ?? []) as RoomRow[];
  const roomIds = rooms.map((room) => room.id);

  if (roomIds.length === 0) {
    return jsonResponse({ rooms: [] });
  }

  const [{ data: membersData, error: membersError }, { data: messagesData, error: messagesError }] =
    await Promise.all([
      supabase
        .from("room_members")
        .select("room_id, role, student_id")
        .in("room_id", roomIds)
        .eq("status", "joined"),
      supabase
        .from("chat_messages")
        .select("room_id, message, created_at, is_system")
        .in("room_id", roomIds)
        .order("created_at", { ascending: false }),
    ]);

  if (membersError || messagesError) {
    return errorResponse("조 방 상세 정보를 불러오지 못했습니다.", 500);
  }

  const members = (membersData ?? []) as RoomMemberRow[];
  const creatorIds = Array.from(
    new Set(
      members
        .filter((member) => member.role === "creator" || member.role === "leader")
        .map((member) => member.student_id),
    ),
  );

  const { data: studentsData, error: studentsError } = await supabase
    .from("students")
    .select("id, name")
    .in("id", creatorIds);

  if (studentsError) {
    return errorResponse("조장 정보를 불러오지 못했습니다.", 500);
  }

  const studentMap = new Map(
    ((studentsData ?? []) as StudentRow[]).map((student) => [student.id, student]),
  );
  const roomMembersMap = new Map<string, RoomMemberRow[]>();

  for (const member of members) {
    const current = roomMembersMap.get(member.room_id) ?? [];
    current.push(member);
    roomMembersMap.set(member.room_id, current);
  }

  const latestMessageMap = new Map<string, ChatMessageRow>();

  for (const message of (messagesData ?? []) as ChatMessageRow[]) {
    if (!latestMessageMap.has(message.room_id)) {
      latestMessageMap.set(message.room_id, message);
    }
  }

  return jsonResponse({
    rooms: rooms.map((room) => {
      const currentMembers = roomMembersMap.get(room.id) ?? [];
      const leader =
        currentMembers.find((member) => member.role === "leader") ??
        currentMembers.find((member) => member.role === "creator");
      const latestMessage = latestMessageMap.get(room.id);

      return {
        id: room.id,
        sessionId: room.session_id,
        roomName: room.room_name,
        inviteCode: room.invite_code,
        status: room.status,
        createdByAdmin: room.created_by_admin,
        maxMembers: room.max_members,
        memberCount: currentMembers.length,
        leaderName: leader ? studentMap.get(leader.student_id)?.name ?? null : null,
        requestExtraMembers: room.request_extra_members,
        requestExtraReason: room.request_extra_reason,
        createdAt: room.created_at,
        latestMessage: latestMessage
          ? {
              message: latestMessage.message,
              createdAt: latestMessage.created_at,
              isSystem: latestMessage.is_system,
            }
          : null,
      };
    }),
  });
}
