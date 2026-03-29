import { randomUUID } from "node:crypto";

import { errorResponse, jsonResponse } from "@/lib/http";
import { getJoinedRoomMember } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import {
  normalizeStudyPollOptions,
  serializeStudyPolls,
  type StudyPollOption,
} from "@/lib/study-polls";
import { getAuthorizedStudent } from "@/lib/student-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PollRouteProps = {
  params: {
    roomId: string;
  };
};

type CreatePollPayload = {
  title?: string;
  options?: string[];
};

type PollRow = {
  id: string;
  room_id: string;
  created_by: string | null;
  title: string;
  options: unknown;
  is_closed: boolean;
  created_at: string;
};

type VoteRow = {
  poll_id: string;
  student_id: string;
  selected_options: unknown;
};

type StudentNameRow = {
  id: string;
  name: string;
};

function buildPollOptions(rawOptions: string[]) {
  return rawOptions.map((label) => ({
    id: randomUUID().slice(0, 8),
    label,
  })) satisfies StudyPollOption[];
}

async function loadPollPayload(
  roomId: string,
  viewerStudentId: string,
  canManage: boolean,
) {
  const supabase = createServerSupabaseClient();
  const { data: pollsData, error: pollsError } = await supabase
    .from("study_polls")
    .select("id, room_id, created_by, title, options, is_closed, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });

  if (pollsError) {
    throw pollsError;
  }

  const polls = (pollsData ?? []) as PollRow[];

  if (polls.length === 0) {
    return [];
  }

  const pollIds = polls.map((poll) => poll.id);
  const { data: votesData, error: votesError } = await supabase
    .from("poll_votes")
    .select("poll_id, student_id, selected_options")
    .in("poll_id", pollIds);

  if (votesError) {
    throw votesError;
  }

  const studentIds = Array.from(
    new Set([
      ...polls
        .map((poll) => poll.created_by)
        .filter((studentId): studentId is string => Boolean(studentId)),
      ...((votesData ?? []) as VoteRow[]).map((vote) => vote.student_id),
    ]),
  );

  const studentNameMap = new Map<string, string>();

  if (studentIds.length > 0) {
    const { data: studentsData, error: studentsError } = await supabase
      .from("students")
      .select("id, name")
      .in("id", studentIds);

    if (studentsError) {
      throw studentsError;
    }

    ((studentsData ?? []) as StudentNameRow[]).forEach((student) => {
      studentNameMap.set(student.id, student.name);
    });
  }

  return serializeStudyPolls({
    polls,
    votes: (votesData ?? []) as VoteRow[],
    studentNameMap,
    viewerStudentId,
    canManage,
  });
}

export async function GET(request: Request, { params }: PollRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("조 방 접근 권한이 없습니다.", 403);
  }

  const polls = await loadPollPayload(
    params.roomId,
    student.id,
    membership.role === "creator" || membership.role === "leader",
  );

  return jsonResponse({ polls });
}

export async function POST(request: Request, { params }: PollRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("조 방 접근 권한이 없습니다.", 403);
  }

  if (membership.role !== "creator" && membership.role !== "leader") {
    return errorResponse("방장 또는 조장만 투표를 만들 수 있습니다.", 403);
  }

  const session = await getSessionById(student.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("?댁쁺 以묒씤 硫댁젒諛섏쓣 李얠쓣 ???놁뒿?덈떎.", 404);
  }

  const applyWindowStatus = getApplyWindowStatus(session);

  if (applyWindowStatus === "before_open") {
    return errorResponse("吏???쒖옉 ?꾩엯?덈떎.", 409);
  }

  if (applyWindowStatus === "after_close") {
    return errorResponse("吏??留덇컧 ?댄썑?먮뒗 ?ы몴瑜?留뚮뱾 ???놁뒿?덈떎.", 409);
  }

  const body = (await request.json()) as CreatePollPayload;
  const title = body.title?.trim() ?? "";
  const rawOptions = (body.options ?? [])
    .map((option) => option.trim())
    .filter(Boolean);

  if (!title) {
    return errorResponse("투표 제목을 입력해 주세요.");
  }

  if (title.length > 80) {
    return errorResponse("투표 제목은 80자 이하여야 합니다.");
  }

  if (rawOptions.length < 2 || rawOptions.length > 8) {
    return errorResponse("투표 옵션은 2개 이상 8개 이하여야 합니다.");
  }

  const options = buildPollOptions(rawOptions);
  const normalizedOptions = normalizeStudyPollOptions(options);

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("study_polls")
    .insert({
      room_id: params.roomId,
      created_by: student.id,
      title,
      options: normalizedOptions,
      is_closed: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    return errorResponse("투표를 생성하지 못했습니다.", 500);
  }

  await supabase.from("chat_messages").insert({
    room_id: params.roomId,
    student_id: null,
    message: `${student.name}님이 새 스터디 일정 투표를 만들었습니다.`,
    is_system: true,
  });

  return jsonResponse(
    {
      pollId: data.id,
    },
    { status: 201 },
  );
}
