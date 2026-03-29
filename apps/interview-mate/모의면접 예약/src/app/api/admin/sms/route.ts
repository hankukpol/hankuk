import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { buildCsv, createCsvResponse } from "@/lib/csv";
import { errorResponse } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SessionRow = {
  id: string;
  name: string;
  track: string;
};

type RoomRow = {
  id: string;
  room_name: string | null;
  invite_code: string;
  password: string;
  created_at: string;
};

type RoomMemberRow = {
  room_id: string;
  student_id: string;
  joined_at: string;
};

type StudentRow = {
  id: string;
  name: string;
  phone: string;
};

function sanitizeFileNamePart(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9-_]+/g, "-").replaceAll(/-+/g, "-");
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
  const { data: sessionData, error: sessionError } = await supabase
    .from("sessions")
    .select("id, name, track")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !sessionData) {
    return errorResponse("세션 정보를 찾을 수 없습니다.", 404);
  }

  const { data: roomsData, error: roomsError } = await supabase
    .from("group_rooms")
    .select("id, room_name, invite_code, password, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (roomsError) {
    return errorResponse("조 방 목록을 불러오지 못했습니다.", 500);
  }

  const rooms = (roomsData ?? []) as RoomRow[];

  if (rooms.length === 0) {
    return errorResponse("생성된 조 방이 없어 SMS CSV를 만들 수 없습니다.", 409);
  }

  const roomIds = rooms.map((room) => room.id);
  const { data: membersData, error: membersError } = await supabase
    .from("room_members")
    .select("room_id, student_id, joined_at")
    .in("room_id", roomIds)
    .eq("status", "joined")
    .order("joined_at", { ascending: true });

  if (membersError) {
    return errorResponse("조 방 멤버를 불러오지 못했습니다.", 500);
  }

  const members = (membersData ?? []) as RoomMemberRow[];
  const studentIds = Array.from(new Set(members.map((member) => member.student_id)));

  if (studentIds.length === 0) {
    return errorResponse("배정된 조원이 없어 SMS CSV를 만들 수 없습니다.", 409);
  }

  const { data: studentsData, error: studentsError } = await supabase
    .from("students")
    .select("id, name, phone")
    .in("id", studentIds);

  if (studentsError) {
    return errorResponse("학생 정보를 불러오지 못했습니다.", 500);
  }

  const studentMap = new Map(
    ((studentsData ?? []) as StudentRow[]).map((student) => [student.id, student]),
  );
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const origin = new URL(request.url).origin;
  const rows = members
    .map((member) => {
      const room = roomMap.get(member.room_id);
      const student = studentMap.get(member.student_id);

      if (!room || !student) {
        return null;
      }

      return [
        student.name,
        normalizePhone(student.phone),
        room.room_name ?? "조 방",
        `${origin}/join/${room.invite_code}`,
        room.password,
      ];
    })
    .filter((row): row is string[] => Boolean(row));

  const session = sessionData as SessionRow;
  const csv = buildCsv([
    ["이름", "연락처", "조", "초대링크", "비밀번호"],
    ...rows,
  ]);

  return createCsvResponse(
    `sms-${sanitizeFileNamePart(session.track)}-${sessionId}.csv`,
    csv,
  );
}
