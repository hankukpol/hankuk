import { errorResponse, jsonResponse } from "@/lib/http";
import { getJoinedRoomMember } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { normalizeStudyPollOptions } from "@/lib/study-polls";
import { getAuthorizedStudent } from "@/lib/student-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type VoteRouteProps = {
  params: {
    roomId: string;
    pollId: string;
  };
};

type VotePayload = {
  selectedOptionIds?: string[];
};

type PollRow = {
  id: string;
  room_id: string;
  options: unknown;
  is_closed: boolean;
};

export async function POST(request: Request, { params }: VoteRouteProps) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const membership = await getJoinedRoomMember(params.roomId, student.id);

  if (!membership) {
    return errorResponse("조 방 접근 권한이 없습니다.", 403);
  }

  const session = await getSessionById(student.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("?댁쁺 以묒씤 硫댁젒諛섏쓣 李얠쓣 ???놁뒿?덈떎.", 404);
  }

  if (getApplyWindowStatus(session) === "after_close") {
    return errorResponse("吏??留덇컧 ?댄썑?먮뒗 ?ы몴瑜??섏젙?????놁뒿?덈떎.", 409);
  }

  const supabase = createServerSupabaseClient();
  const { data: pollData, error: pollError } = await supabase
    .from("study_polls")
    .select("id, room_id, options, is_closed")
    .eq("id", params.pollId)
    .eq("room_id", params.roomId)
    .maybeSingle();

  if (pollError || !pollData) {
    return errorResponse("투표를 찾을 수 없습니다.", 404);
  }

  const poll = pollData as PollRow;

  if (poll.is_closed) {
    return errorResponse("마감된 투표는 수정할 수 없습니다.", 409);
  }

  const options = normalizeStudyPollOptions(poll.options);
  const allowedOptionIds = new Set(options.map((option) => option.id));
  const body = (await request.json()) as VotePayload;
  const selectedOptionIds = Array.from(
    new Set((body.selectedOptionIds ?? []).map((optionId) => optionId.trim())),
  ).filter(Boolean);

  if (selectedOptionIds.length === 0) {
    return errorResponse("한 개 이상의 시간대를 선택해 주세요.");
  }

  if (selectedOptionIds.some((optionId) => !allowedOptionIds.has(optionId))) {
    return errorResponse("유효하지 않은 투표 옵션이 포함되어 있습니다.");
  }

  const { error } = await supabase.from("poll_votes").upsert(
    {
      poll_id: params.pollId,
      student_id: student.id,
      selected_options: selectedOptionIds,
    },
    {
      onConflict: "poll_id,student_id",
    },
  );

  if (error) {
    return errorResponse("투표를 저장하지 못했습니다.", 500);
  }

  return jsonResponse({
    pollId: params.pollId,
    selectedOptionIds,
  });
}
