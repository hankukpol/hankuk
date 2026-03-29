import { createServerSupabaseClient } from "@/lib/supabase/server";
import { serializeRoom, type RoomRecord, type RoomSummary } from "@/lib/rooms";
import type { StudentRecord } from "@/lib/students";

const ROOM_SELECT_COLUMNS =
  "id, session_id, room_name, invite_code, status, creator_student_id, created_by_admin, max_members, request_extra_members, request_extra_reason, created_at";
const DEFAULT_ROOM_MESSAGE_LIMIT = 50;

type RoomMemberRecord = {
  id: string;
  room_id: string;
  student_id: string;
  role: "creator" | "leader" | "member";
  status: "joined" | "left";
  joined_at: string;
  left_at: string | null;
};

type ChatMessageRecord = {
  id: string;
  room_id: string;
  student_id: string | null;
  message: string;
  is_system: boolean;
  created_at: string;
};

type StudentProfileRecord = {
  student_id: string;
  intro: string | null;
  show_phone: boolean;
  updated_at: string;
};

export type RoomMemberSummary = {
  id: string;
  studentId: string;
  role: "creator" | "leader" | "member";
  status: "joined" | "left";
  joinedAt: string;
  leftAt: string | null;
  name: string;
  phone: string;
  gender: StudentRecord["gender"];
  series: string;
  region: string;
  score: number | null;
  intro: string | null;
  showPhone: boolean;
};

export type RoomMessageSummary = {
  id: string;
  studentId: string | null;
  message: string;
  isSystem: boolean;
  createdAt: string;
  senderName: string;
};

export type RoomMessagePageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};

export type RoomDetail = {
  room: RoomSummary;
  members: RoomMemberSummary[];
  messages: RoomMessageSummary[];
  messagePageInfo: RoomMessagePageInfo;
};

export async function getRoomById(roomId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("group_rooms")
    .select(ROOM_SELECT_COLUMNS)
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as RoomRecord | null) ? serializeRoom(data as RoomRecord) : null;
}

export async function getRoomByInviteCode(inviteCode: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("group_rooms")
    .select(ROOM_SELECT_COLUMNS)
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as RoomRecord | null) ? serializeRoom(data as RoomRecord) : null;
}

async function getStudentsByIds(studentIds: string[]) {
  if (studentIds.length === 0) {
    return new Map<string, StudentRecord>();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, session_id, phone, name, gender, series, region, age, score, access_token, created_at",
    )
    .in("id", studentIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as StudentRecord[]).map((student) => [student.id, student]),
  );
}

async function getStudentProfiles(studentIds: string[]) {
  if (studentIds.length === 0) {
    return new Map<string, StudentProfileRecord>();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("student_profiles")
    .select("student_id, intro, show_phone, updated_at")
    .in("student_id", studentIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as StudentProfileRecord[]).map((profile) => [
      profile.student_id,
      profile,
    ]),
  );
}

export async function getRoomMembers(roomId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("room_members")
    .select("id, room_id, student_id, role, status, joined_at, left_at")
    .eq("room_id", roomId)
    .eq("status", "joined")
    .order("joined_at", { ascending: true });

  if (error) {
    throw error;
  }

  const members = (data ?? []) as RoomMemberRecord[];
  const studentIds = members.map((member) => member.student_id);
  const [studentMap, profileMap] = await Promise.all([
    getStudentsByIds(studentIds),
    getStudentProfiles(studentIds),
  ]);

  return members
    .map((member) => {
      const student = studentMap.get(member.student_id);
      const profile = profileMap.get(member.student_id);

      if (!student) {
        return null;
      }

      return {
        id: member.id,
        studentId: member.student_id,
        role: member.role,
        status: member.status,
        joinedAt: member.joined_at,
        leftAt: member.left_at,
        name: student.name,
        phone: student.phone,
        gender: student.gender,
        series: student.series,
        region: student.region,
        score: student.score,
        intro: profile?.intro ?? null,
        showPhone: profile?.show_phone ?? false,
      } satisfies RoomMemberSummary;
    })
    .filter((member): member is RoomMemberSummary => Boolean(member));
}

async function mapRoomMessages(messages: ChatMessageRecord[]) {
  const studentIds = messages
    .map((message) => message.student_id)
    .filter((studentId): studentId is string => Boolean(studentId));
  const studentMap = await getStudentsByIds(studentIds);

  return messages.map((message) => ({
    id: message.id,
    studentId: message.student_id,
    message: message.message,
    isSystem: message.is_system,
    createdAt: message.created_at,
    senderName: message.student_id
      ? studentMap.get(message.student_id)?.name ?? "알 수 없음"
      : "시스템",
  }));
}

export async function getRoomMessagesPage(
  roomId: string,
  options?: {
    limit?: number;
    before?: string | null;
  },
) {
  const limit = Math.min(
    Math.max(options?.limit ?? DEFAULT_ROOM_MESSAGE_LIMIT, 1),
    100,
  );
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("chat_messages")
    .select("id, room_id, student_id, message, is_system, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (options?.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ChatMessageRecord[];
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const messages = await mapRoomMessages([...pageRows].reverse());

  return {
    messages,
    pageInfo: {
      hasMore,
      nextCursor: hasMore
        ? pageRows[pageRows.length - 1]?.created_at ?? null
        : null,
    } satisfies RoomMessagePageInfo,
  };
}

export async function getRoomMessages(
  roomId: string,
  limit = DEFAULT_ROOM_MESSAGE_LIMIT,
) {
  const payload = await getRoomMessagesPage(roomId, { limit });
  return payload.messages;
}

export async function getJoinedRoomMember(roomId: string, studentId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("room_members")
    .select("id, room_id, student_id, role, status, joined_at, left_at")
    .eq("room_id", roomId)
    .eq("student_id", studentId)
    .eq("status", "joined")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as RoomMemberRecord | null;
}

export async function getJoinedMembershipByStudent(studentId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("room_members")
    .select("id, room_id, student_id, role, status, joined_at, left_at")
    .eq("student_id", studentId)
    .eq("status", "joined")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as RoomMemberRecord | null;
}

export async function getRoomDetail(roomId: string): Promise<RoomDetail | null> {
  const room = await getRoomById(roomId);

  if (!room) {
    return null;
  }

  const [members, messagesPayload] = await Promise.all([
    getRoomMembers(roomId),
    getRoomMessagesPage(roomId),
  ]);

  return {
    room,
    members,
    messages: messagesPayload.messages,
    messagePageInfo: messagesPayload.pageInfo,
  };
}
