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

type StudentRow = {
  id: string;
  name: string;
  phone: string;
  gender: string;
  series: string;
  region: string;
  age: number | null;
  score: number | null;
  created_at: string;
};

type RoomRow = {
  id: string;
  created_at: string;
};

type RoomMemberRow = {
  room_id: string;
  student_id: string;
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

  const [{ data: studentsData, error: studentsError }, { data: roomsData, error: roomsError }] =
    await Promise.all([
      supabase
        .from("students")
        .select(
          "id, name, phone, gender, series, region, age, score, created_at",
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("group_rooms")
        .select("id, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);

  if (studentsError || roomsError) {
    return errorResponse("조 편성 CSV 데이터를 불러오지 못했습니다.", 500);
  }

  const students = (studentsData ?? []) as StudentRow[];
  const rooms = (roomsData ?? []) as RoomRow[];
  const roomIds = rooms.map((room) => room.id);
  const roomGroupMap = new Map<string, number>();

  rooms.forEach((room, index) => {
    roomGroupMap.set(room.id, index + 1);
  });

  let groupByStudentId = new Map<string, number>();

  if (roomIds.length > 0) {
    const { data: membersData, error: membersError } = await supabase
      .from("room_members")
      .select("room_id, student_id")
      .in("room_id", roomIds)
      .eq("status", "joined");

    if (membersError) {
      return errorResponse("조 편성 멤버 정보를 불러오지 못했습니다.", 500);
    }

    groupByStudentId = new Map(
      ((membersData ?? []) as RoomMemberRow[]).map((member) => [
        member.student_id,
        roomGroupMap.get(member.room_id) ?? 0,
      ]),
    );
  }

  const session = sessionData as SessionRow;
  const rows = students.map((student) => [
    student.name,
    normalizePhone(student.phone),
    student.gender,
    student.series,
    student.region,
    student.age ?? "",
    student.score ?? "",
    groupByStudentId.get(student.id) || "",
  ]);

  const csv = buildCsv([
    ["이름", "연락처", "성별", "직렬", "지역", "나이", "필기성적", "조"],
    ...rows,
  ]);

  return createCsvResponse(
    `study-groups-${sanitizeFileNamePart(session.track)}-${sessionId}.csv`,
    csv,
  );
}
