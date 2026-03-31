import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { buildCsv, createCsvResponse } from "@/lib/csv";
import { errorResponse } from "@/lib/http";
import { formatInterviewExperience } from "@/lib/interview-experience";
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
  status: "recruiting" | "formed" | "closed";
  created_by_admin: boolean;
  max_members: number;
  request_extra_members: number;
  request_extra_reason: string | null;
  created_at: string;
};

type RoomMemberRow = {
  room_id: string;
  student_id: string;
  role: "creator" | "leader" | "member";
  joined_at: string;
};

type StudentRow = {
  id: string;
  name: string;
  phone: string;
  gender: string | null;
  series: string | null;
  region: string | null;
  score: number | null;
  interview_experience: boolean | null;
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
    .select(
      "id, room_name, invite_code, password, status, created_by_admin, max_members, request_extra_members, request_extra_reason, created_at",
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (roomsError) {
    return errorResponse("조 편성 데이터를 내보내지 못했습니다.", 500);
  }

  const rooms = (roomsData ?? []) as RoomRow[];
  const roomIds = rooms.map((room) => room.id);
  const membersByRoom = new Map<string, RoomMemberRow[]>();
  const studentMap = new Map<string, StudentRow>();

  if (roomIds.length > 0) {
    const { data: membersData, error: membersError } = await supabase
      .from("room_members")
      .select("room_id, student_id, role, joined_at")
      .in("room_id", roomIds)
      .eq("status", "joined")
      .order("joined_at", { ascending: true });

    if (membersError) {
      return errorResponse("조원 정보를 불러오지 못했습니다.", 500);
    }

    const members = (membersData ?? []) as RoomMemberRow[];
    const studentIds = Array.from(
      new Set(members.map((member) => member.student_id)),
    );

    if (studentIds.length > 0) {
      const { data: studentsData, error: studentsError } = await supabase
        .from("students")
        .select("id, name, phone, gender, series, region, score, interview_experience")
        .in("id", studentIds);

      if (studentsError) {
        return errorResponse("학생 정보를 불러오지 못했습니다.", 500);
      }

      for (const student of (studentsData ?? []) as StudentRow[]) {
        studentMap.set(student.id, student);
      }
    }

    for (const member of members) {
      const current = membersByRoom.get(member.room_id) ?? [];
      current.push(member);
      membersByRoom.set(member.room_id, current);
    }
  }

  const session = sessionData as SessionRow;
  const rows = rooms.flatMap((room) => {
    const members = membersByRoom.get(room.id) ?? [];

    if (members.length === 0) {
      return [
        [
          session.name,
          session.track,
          room.id,
          room.room_name ?? "",
          room.invite_code,
          room.password,
          room.status,
          room.created_by_admin ? "관리자 생성" : "학생 생성",
          room.max_members,
          room.request_extra_members,
          room.request_extra_reason ?? "",
          room.created_at,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
      ];
    }

    return members.map((member) => {
      const student = studentMap.get(member.student_id);
      return [
        session.name,
        session.track,
        room.id,
        room.room_name ?? "",
        room.invite_code,
        room.password,
        room.status,
        room.created_by_admin ? "관리자 생성" : "학생 생성",
        room.max_members,
        room.request_extra_members,
        room.request_extra_reason ?? "",
        room.created_at,
        member.role,
        student?.name ?? "",
        student?.phone ?? "",
        student?.gender ?? "",
        student?.series ?? "",
        student?.region ?? "",
        student?.score ?? "",
        formatInterviewExperience(student?.interview_experience),
        member.joined_at,
      ];
    });
  });

  const csv = buildCsv([
    [
      "세션명",
      "직렬",
      "방ID",
      "방이름",
      "초대코드",
      "비밀번호",
      "방상태",
      "생성주체",
      "최대인원",
      "추가요청인원",
      "추가요청사유",
      "방생성일시",
      "멤버역할",
      "멤버이름",
      "멤버연락처",
      "성별",
      "직렬표기",
      "지역",
      "점수",
      "면접 경험 여부",
      "입장일시",
    ],
    ...rows,
  ]);

  return createCsvResponse(
    `rooms-${sanitizeFileNamePart(session.track)}-${sessionId}.csv`,
    csv,
  );
}
