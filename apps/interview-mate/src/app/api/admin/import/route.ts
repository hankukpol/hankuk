import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, internalErrorResponse, jsonResponse } from "@/lib/http";
import { generateInviteCode, generateRoomPassword } from "@/lib/invite";
import { normalizePhone } from "@/lib/phone";
import { getSessionById } from "@/lib/session-queries";
import {
  parseStudyGroupFile,
  type StudyGroupImportRow,
} from "@/lib/study-group-sync";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getSpreadsheetUploadLimitMessage,
  MAX_SPREADSHEET_UPLOAD_BYTES,
} from "@/lib/uploads";

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

type GroupRoomSnapshotRow = {
  id: string;
  session_id: string;
  room_name: string | null;
  invite_code: string;
  password: string;
  status: "recruiting" | "formed" | "closed";
  creator_student_id: string | null;
  created_by_admin: boolean;
  max_members: number;
  request_extra_members: number;
  request_extra_reason: string | null;
  created_at: string;
};

type RoomMemberSnapshotRow = {
  id: string;
  room_id: string;
  student_id: string;
  role: "creator" | "leader" | "member";
  status: "joined" | "left";
  joined_at: string;
  left_at: string | null;
};

type ChatMessageSnapshotRow = {
  id: string;
  room_id: string;
  student_id: string | null;
  message: string;
  is_system: boolean;
  created_at: string;
};

type WaitingPoolSnapshotRow = {
  id: string;
  session_id: string;
  student_id: string;
  assigned_room_id: string | null;
  created_at: string;
};

type StudyPollSnapshotRow = {
  id: string;
  room_id: string;
  created_by: string | null;
  title: string;
  options: unknown;
  is_closed: boolean;
  created_at: string;
};

type PollVoteSnapshotRow = {
  id: string;
  poll_id: string;
  student_id: string;
  selected_options: unknown;
  created_at: string;
};

type RoomJoinAttemptSnapshotRow = {
  id: string;
  room_id: string;
  student_id: string;
  failed_attempts: number;
  last_failed_at: string | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
};

type SessionStateSnapshot = {
  waitingPool: WaitingPoolSnapshotRow[];
  rooms: GroupRoomSnapshotRow[];
  roomMembers: RoomMemberSnapshotRow[];
  chatMessages: ChatMessageSnapshotRow[];
  studyPolls: StudyPollSnapshotRow[];
  pollVotes: PollVoteSnapshotRow[];
  roomJoinAttempts: RoomJoinAttemptSnapshotRow[];
};

function buildRoomName(groupNumber: number) {
  return `${groupNumber}조`;
}

async function createGroupRoom(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  options: {
    sessionId: string;
    roomName: string;
    creatorStudentId: string;
    maxMembers: number;
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

async function fetchSessionStateSnapshot(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  sessionId: string,
) {
  const [
    { data: waitingData, error: waitingError },
    { data: roomsData, error: roomsError },
  ] = await Promise.all([
    supabase
      .from("waiting_pool")
      .select("id, session_id, student_id, assigned_room_id, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("group_rooms")
      .select(
        "id, session_id, room_name, invite_code, password, status, creator_student_id, created_by_admin, max_members, request_extra_members, request_extra_reason, created_at",
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  if (waitingError) {
    throw waitingError;
  }

  if (roomsError) {
    throw roomsError;
  }

  const rooms = (roomsData ?? []) as GroupRoomSnapshotRow[];
  const roomIds = rooms.map((room) => room.id);

  if (roomIds.length === 0) {
    return {
      waitingPool: (waitingData ?? []) as WaitingPoolSnapshotRow[],
      rooms,
      roomMembers: [],
      chatMessages: [],
      studyPolls: [],
      pollVotes: [],
      roomJoinAttempts: [],
    } satisfies SessionStateSnapshot;
  }

  const [
    { data: roomMembersData, error: roomMembersError },
    { data: chatMessagesData, error: chatMessagesError },
    { data: studyPollsData, error: studyPollsError },
    { data: roomJoinAttemptsData, error: roomJoinAttemptsError },
  ] = await Promise.all([
    supabase
      .from("room_members")
      .select("id, room_id, student_id, role, status, joined_at, left_at")
      .in("room_id", roomIds)
      .order("joined_at", { ascending: true }),
    supabase
      .from("chat_messages")
      .select("id, room_id, student_id, message, is_system, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("study_polls")
      .select("id, room_id, created_by, title, options, is_closed, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("room_join_attempts")
      .select(
        "id, room_id, student_id, failed_attempts, last_failed_at, locked_until, created_at, updated_at",
      )
      .in("room_id", roomIds)
      .order("created_at", { ascending: true }),
  ]);

  if (roomMembersError) {
    throw roomMembersError;
  }

  if (chatMessagesError) {
    throw chatMessagesError;
  }

  if (studyPollsError) {
    throw studyPollsError;
  }

  if (roomJoinAttemptsError) {
    throw roomJoinAttemptsError;
  }

  const studyPolls = (studyPollsData ?? []) as StudyPollSnapshotRow[];
  const pollIds = studyPolls.map((poll) => poll.id);
  let pollVotes: PollVoteSnapshotRow[] = [];

  if (pollIds.length > 0) {
    const { data: pollVotesData, error: pollVotesError } = await supabase
      .from("poll_votes")
      .select("id, poll_id, student_id, selected_options, created_at")
      .in("poll_id", pollIds)
      .order("created_at", { ascending: true });

    if (pollVotesError) {
      throw pollVotesError;
    }

    pollVotes = (pollVotesData ?? []) as PollVoteSnapshotRow[];
  }

  return {
    waitingPool: (waitingData ?? []) as WaitingPoolSnapshotRow[],
    rooms,
    roomMembers: (roomMembersData ?? []) as RoomMemberSnapshotRow[],
    chatMessages: (chatMessagesData ?? []) as ChatMessageSnapshotRow[],
    studyPolls,
    pollVotes,
    roomJoinAttempts: (roomJoinAttemptsData ?? []) as RoomJoinAttemptSnapshotRow[],
  } satisfies SessionStateSnapshot;
}

async function restoreSessionStateSnapshot(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  sessionId: string,
  snapshot: SessionStateSnapshot,
) {
  const { error: clearWaitingError } = await supabase
    .from("waiting_pool")
    .delete()
    .eq("session_id", sessionId);

  if (clearWaitingError) {
    throw new Error(`대기열 복구 준비에 실패했습니다. ${clearWaitingError.message}`);
  }

  const { error: clearRoomsError } = await supabase
    .from("group_rooms")
    .delete()
    .eq("session_id", sessionId);

  if (clearRoomsError) {
    throw new Error(`조 방 복구 준비에 실패했습니다. ${clearRoomsError.message}`);
  }

  if (snapshot.rooms.length > 0) {
    const { error: roomsInsertError } = await supabase
      .from("group_rooms")
      .insert(snapshot.rooms);

    if (roomsInsertError) {
      throw new Error(`조 방 복구에 실패했습니다. ${roomsInsertError.message}`);
    }
  }

  if (snapshot.roomMembers.length > 0) {
    const { error: roomMembersInsertError } = await supabase
      .from("room_members")
      .insert(snapshot.roomMembers);

    if (roomMembersInsertError) {
      throw new Error(`조원 복구에 실패했습니다. ${roomMembersInsertError.message}`);
    }
  }

  if (snapshot.studyPolls.length > 0) {
    const { error: studyPollsInsertError } = await supabase
      .from("study_polls")
      .insert(snapshot.studyPolls);

    if (studyPollsInsertError) {
      throw new Error(`투표 복구에 실패했습니다. ${studyPollsInsertError.message}`);
    }
  }

  if (snapshot.pollVotes.length > 0) {
    const { error: pollVotesInsertError } = await supabase
      .from("poll_votes")
      .insert(snapshot.pollVotes);

    if (pollVotesInsertError) {
      throw new Error(`투표 응답 복구에 실패했습니다. ${pollVotesInsertError.message}`);
    }
  }

  if (snapshot.chatMessages.length > 0) {
    const { error: chatMessagesInsertError } = await supabase
      .from("chat_messages")
      .insert(snapshot.chatMessages);

    if (chatMessagesInsertError) {
      throw new Error(`채팅 복구에 실패했습니다. ${chatMessagesInsertError.message}`);
    }
  }

  if (snapshot.roomJoinAttempts.length > 0) {
    const { error: roomJoinAttemptsInsertError } = await supabase
      .from("room_join_attempts")
      .insert(snapshot.roomJoinAttempts);

    if (roomJoinAttemptsInsertError) {
      throw new Error(
        `참여 제한 기록 복구에 실패했습니다. ${roomJoinAttemptsInsertError.message}`,
      );
    }
  }

  if (snapshot.waitingPool.length > 0) {
    const { error: waitingPoolInsertError } = await supabase
      .from("waiting_pool")
      .insert(snapshot.waitingPool);

    if (waitingPoolInsertError) {
      throw new Error(`대기열 복구에 실패했습니다. ${waitingPoolInsertError.message}`);
    }
  }
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

  if (file.size > MAX_SPREADSHEET_UPLOAD_BYTES) {
    return errorResponse(getSpreadsheetUploadLimitMessage(), 413);
  }

  const session = await getSessionById(sessionId);

  if (!session) {
    return errorResponse("세션을 찾을 수 없습니다.", 404);
  }

  if (session.status !== "active") {
    return errorResponse(
      "운영 중인 세션에서만 조 편성 결과를 가져올 수 있습니다.",
      409,
    );
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
    return errorResponse(
      "지원 완료한 학생이 없어 조 편성 결과를 반영할 수 없습니다.",
    );
  }

  const studentByPhone = new Map(
    students.map((student) => [normalizePhone(student.phone), student]),
  );
  const studentById = new Map(students.map((student) => [student.id, student]));
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

  const assignedGroupsByStudent = new Map<string, number[]>();

  for (const entry of matchedRows) {
    if (entry.row.groupNumber === null) {
      continue;
    }

    const currentGroups = assignedGroupsByStudent.get(entry.student.id) ?? [];
    currentGroups.push(entry.row.groupNumber);
    assignedGroupsByStudent.set(entry.student.id, currentGroups);
  }

  const duplicatedAssignments = Array.from(assignedGroupsByStudent.entries()).filter(
    ([, groupNumbers]) => groupNumbers.length > 1,
  );

  if (duplicatedAssignments.length > 0) {
    const preview = duplicatedAssignments
      .slice(0, 3)
      .map(([studentId, groupNumbers]) => {
        const student = studentById.get(studentId);
        return `${student?.name ?? "학생"}(${groupNumbers.join(", ")})`;
      })
      .join(", ");

    return errorResponse(
      `한 학생이 여러 조에 중복 배정되어 있습니다. ${preview}`,
    );
  }

  const oversizedGroup = Array.from(groupedRows.entries()).find(
    ([, members]) => members.length > session.max_group_size,
  );

  if (oversizedGroup) {
    return errorResponse(
      `${buildRoomName(oversizedGroup[0])} 인원이 세션 최대 인원 ${session.max_group_size}명을 초과합니다.`,
    );
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

  let snapshot: SessionStateSnapshot;

  try {
    snapshot = await fetchSessionStateSnapshot(supabase, sessionId);
  } catch (error) {
    return internalErrorResponse("기존 조 편성 상태를 읽지 못했습니다.", {
      error,
      scope: "admin/import:read-snapshot",
      details: { sessionId },
    });
  }

  let mutationStarted = false;

  try {
    const { error: clearWaitingError } = await supabase
      .from("waiting_pool")
      .delete()
      .eq("session_id", sessionId);

    if (clearWaitingError) {
      throw clearWaitingError;
    }

    mutationStarted = true;

    const { error: deleteRoomsError } = await supabase
      .from("group_rooms")
      .delete()
      .eq("session_id", sessionId);

    if (deleteRoomsError) {
      throw deleteRoomsError;
    }

    for (const groupNumber of orderedGroupNumbers) {
      const members = groupedRows.get(groupNumber) ?? [];

      if (members.length === 0) {
        continue;
      }

      const room = await createGroupRoom(supabase, {
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
        throw membersInsertError;
      }
    }

    if (waitingRowsToUpsert.length > 0) {
      const { error: waitingUpsertError } = await supabase
        .from("waiting_pool")
        .upsert(waitingRowsToUpsert, {
          onConflict: "session_id,student_id",
        });

      if (waitingUpsertError) {
        throw waitingUpsertError;
      }
    }
  } catch (error) {
    if (mutationStarted) {
      try {
        await restoreSessionStateSnapshot(supabase, sessionId, snapshot);
      } catch (restoreError) {
        return internalErrorResponse(
          "조 편성 결과 반영에 실패했고 기존 상태 복구도 실패했습니다.",
          {
            error: restoreError,
            scope: "admin/import:restore-snapshot",
            details: { sessionId },
          },
        );
      }
    }

    return internalErrorResponse(
      "조 편성 결과를 반영하지 못해 기존 상태로 되돌렸습니다.",
      {
        error,
        scope: "admin/import:apply-results",
        details: { sessionId },
      },
    );
  }

  let warning: string | undefined;

  if (roomMessagesToInsert.length > 0) {
    const { error: messagesInsertError } = await supabase
      .from("chat_messages")
      .insert(roomMessagesToInsert);

    if (messagesInsertError) {
      warning = "조 편성은 반영되었지만 방 안내 시스템 메시지를 남기지 못했습니다.";
    }
  }

  return jsonResponse({
    roomCount: createdRooms.length,
    assignedCount: assignedStudentIds.size,
    waitingCount: students.length - assignedStudentIds.size,
    unmatchedCount: unmatchedRows.length,
    rooms: createdRooms,
    unmatchedRows: unmatchedRows.slice(0, 10),
    warning,
  });
}
