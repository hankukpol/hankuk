import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { generateInviteCode, generateRoomPassword } from "@/lib/invite";
import { normalizePhone } from "@/lib/phone";
import { getSessionById } from "@/lib/session-queries";
import {
  parseStudyGroupFile,
  type StudyGroupImportRow,
} from "@/lib/study-group-sync";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
};

type RoomInsertRow = {
  id: string;
  room_name: string | null;
  invite_code: string;
  password: string;
};

type MatchedImportRow = {
  row: StudyGroupImportRow;
  student: StudentRow;
};

function buildRoomName(groupNumber: number) {
  return `${groupNumber}조`;
}

async function createGroupRoom(options: {
  sessionId: string;
  roomName: string;
  creatorStudentId: string;
  maxMembers: number;
  status: "recruiting" | "formed";
}) {
  const supabase = createServerSupabaseClient();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("group_rooms")
      .insert({
        session_id: options.sessionId,
        room_name: options.roomName,
        invite_code: generateInviteCode(),
        password: generateRoomPassword(),
        status: options.status,
        creator_student_id: options.creatorStudentId,
        created_by_admin: true,
        max_members: options.maxMembers,
      })
      .select("id, room_name, invite_code, password")
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

export async function POST(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const formData = await request.formData();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const file = formData.get("file");

  if (!sessionId) {
    return errorResponse("sessionId가 필요합니다.");
  }

  if (!(file instanceof File)) {
    return errorResponse("업로드할 조 편성 결과 파일이 필요합니다.");
  }

  const session = await getSessionById(sessionId);

  if (!session) {
    return errorResponse("세션을 찾을 수 없습니다.", 404);
  }

  if (session.status !== "active") {
    return errorResponse("운영 중인 세션에서만 조 편성 결과를 가져올 수 있습니다.", 409);
  }

  let rows: StudyGroupImportRow[];

  try {
    rows = await parseStudyGroupFile(
      file.name,
      Buffer.from(await file.arrayBuffer()),
    );
  } catch (error) {
    return errorResponse(
      error instanceof Error
        ? error.message
        : "조 편성 결과 파일을 해석하지 못했습니다.",
    );
  }

  if (rows.length === 0) {
    return errorResponse("가져올 조 편성 결과가 없습니다.");
  }

  if (!rows.some((row) => row.groupNumber !== null)) {
    return errorResponse("조 편성 결과 파일에 조 번호가 없습니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: studentsData, error: studentsError } = await supabase
    .from("students")
    .select("id, name, phone, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (studentsError) {
    return errorResponse("학생 목록을 불러오지 못했습니다.", 500);
  }

  const students = (studentsData ?? []) as StudentRow[];

  if (students.length === 0) {
    return errorResponse("지원 완료된 학생이 없어 조 편성 결과를 반영할 수 없습니다.");
  }

  const studentByPhone = new Map(
    students.map((student) => [normalizePhone(student.phone), student]),
  );
  const matchedRows: MatchedImportRow[] = [];
  const unmatchedRows: Array<{
    name: string;
    phone: string;
    groupNumber: number | null;
  }> = [];

  for (const row of rows) {
    const student = studentByPhone.get(normalizePhone(row.phone));

    if (!student) {
      unmatchedRows.push({
        name: row.name,
        phone: row.phone,
        groupNumber: row.groupNumber,
      });
      continue;
    }

    matchedRows.push({ row, student });
  }

  if (!matchedRows.some((entry) => entry.row.groupNumber !== null)) {
    return errorResponse("현재 세션 학생과 매칭되는 조 편성 결과가 없습니다.");
  }

  const groupedRows = new Map<number, MatchedImportRow[]>();

  for (const entry of matchedRows) {
    if (entry.row.groupNumber === null) {
      continue;
    }

    const current = groupedRows.get(entry.row.groupNumber) ?? [];
    current.push(entry);
    groupedRows.set(entry.row.groupNumber, current);
  }

  const orderedGroupNumbers = Array.from(groupedRows.keys()).sort((a, b) => a - b);
  const assignedStudentIds = new Set<string>();
  const createdRooms: Array<{
    roomId: string;
    roomName: string;
    inviteCode: string;
    password: string;
    memberCount: number;
  }> = [];

  const { error: clearWaitingError } = await supabase
    .from("waiting_pool")
    .delete()
    .eq("session_id", sessionId);

  if (clearWaitingError) {
    return errorResponse("기존 대기자 데이터를 초기화하지 못했습니다.", 500);
  }

  const { error: deleteRoomsError } = await supabase
    .from("group_rooms")
    .delete()
    .eq("session_id", sessionId);

  if (deleteRoomsError) {
    return errorResponse("기존 조 방 데이터를 초기화하지 못했습니다.", 500);
  }

  const roomMembersToInsert: Array<{
    room_id: string;
    student_id: string;
    role: "creator" | "member";
    status: "joined";
  }> = [];
  const waitingRowsToUpsert: Array<{
    session_id: string;
    student_id: string;
    assigned_room_id: string | null;
  }> = [];
  const roomMessagesToInsert: Array<{
    room_id: string;
    student_id: null;
    message: string;
    is_system: true;
  }> = [];

  for (const groupNumber of orderedGroupNumbers) {
    const members = groupedRows.get(groupNumber) ?? [];

    if (members.length === 0) {
      continue;
    }

    const room = await createGroupRoom({
      sessionId,
      roomName: buildRoomName(groupNumber),
      creatorStudentId: members[0].student.id,
      maxMembers: session.max_group_size,
      status:
        members.length >= session.min_group_size ? "formed" : "recruiting",
    });

    createdRooms.push({
      roomId: room.id,
      roomName: room.room_name ?? buildRoomName(groupNumber),
      inviteCode: room.invite_code,
      password: room.password,
      memberCount: members.length,
    });

    roomMessagesToInsert.push({
      room_id: room.id,
      student_id: null,
      message: `관리자가 조 편성 결과를 반영했습니다. ${buildRoomName(groupNumber)} 배정이 완료되었습니다.`,
      is_system: true,
    });

    members.forEach((entry, index) => {
      assignedStudentIds.add(entry.student.id);
      roomMembersToInsert.push({
        room_id: room.id,
        student_id: entry.student.id,
        role: index === 0 ? "creator" : "member",
        status: "joined",
      });
      waitingRowsToUpsert.push({
        session_id: sessionId,
        student_id: entry.student.id,
        assigned_room_id: room.id,
      });
    });
  }

  for (const student of students) {
    if (assignedStudentIds.has(student.id)) {
      continue;
    }

    waitingRowsToUpsert.push({
      session_id: sessionId,
      student_id: student.id,
      assigned_room_id: null,
    });
  }

  if (roomMembersToInsert.length > 0) {
    const { error: membersInsertError } = await supabase
      .from("room_members")
      .insert(roomMembersToInsert);

    if (membersInsertError) {
      return errorResponse("조 방 멤버를 생성하지 못했습니다.", 500);
    }
  }

  if (waitingRowsToUpsert.length > 0) {
    const { error: waitingUpsertError } = await supabase
      .from("waiting_pool")
      .upsert(waitingRowsToUpsert, {
        onConflict: "session_id,student_id",
      });

    if (waitingUpsertError) {
      return errorResponse("대기자/배정 상태를 저장하지 못했습니다.", 500);
    }
  }

  if (roomMessagesToInsert.length > 0) {
    const { error: messagesInsertError } = await supabase
      .from("chat_messages")
      .insert(roomMessagesToInsert);

    if (messagesInsertError) {
      return errorResponse("조 방 시스템 메시지를 저장하지 못했습니다.", 500);
    }
  }

  return jsonResponse({
    roomCount: createdRooms.length,
    assignedCount: assignedStudentIds.size,
    waitingCount: students.length - assignedStudentIds.size,
    unmatchedCount: unmatchedRows.length,
    rooms: createdRooms,
    unmatchedRows: unmatchedRows.slice(0, 10),
  });
}
