import { REGIONS, POLICE_REGIONS, FIRE_REGIONS } from "@/lib/constants";
import { errorResponse, jsonResponse } from "@/lib/http";
import { parseInterviewExperience } from "@/lib/interview-experience";
import { generateAccessToken } from "@/lib/invite";
import { normalizePhone } from "@/lib/phone";
import { removeJoinedMemberFromRoom } from "@/lib/room-admin-actions";
import { getJoinedMembershipByStudent, getRoomById } from "@/lib/room-service";
import { getSessionById } from "@/lib/session-queries";
import { getApplyWindowStatus } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAuthorizedStudent,
  getStudentBySessionAndPhone,
} from "@/lib/student-access";
import { serializeStudent, type StudentRecord } from "@/lib/students";

type StudentPayload = {
  sessionId?: string;
  phone?: string;
  name?: string;
  gender?: string;
  series?: string;
  region?: string;
  age?: number;
  score?: number | null;
  interviewExperience?: boolean | null;
};

function parseAge(value: number | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value;
}

function parseScore(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseInterviewExperienceValue(value: boolean | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  return parseInterviewExperience(value);
}

function isValidGender(value: string | undefined): value is "남" | "여" {
  return value === "남" || value === "여";
}

const ALL_REGIONS = Array.from(new Set([...REGIONS, ...POLICE_REGIONS, ...FIRE_REGIONS]));

function isValidRegion(value: string | undefined): boolean {
  return Boolean(value && (ALL_REGIONS as readonly string[]).includes(value));
}

async function getWaitingEntry(studentId: string, sessionId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("waiting_pool")
    .select("id, session_id, student_id, assigned_room_id, created_at")
    .eq("session_id", sessionId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getJoinedRoomSummary(studentId: string) {
  const membership = await getJoinedMembershipByStudent(studentId);

  if (!membership) {
    return null;
  }

  const room = await getRoomById(membership.room_id);

  if (!room) {
    return null;
  }

  return {
    id: room.id,
    roomName: room.roomName,
    inviteCode: room.inviteCode,
    status: room.status,
  };
}

function validatePayload(payload: StudentPayload) {
  if (!payload.sessionId) {
    return "면접반 정보가 없습니다.";
  }

  if (!payload.phone?.trim()) {
    return "연락처를 입력해 주세요.";
  }

  if (!payload.name?.trim()) {
    return "이름을 입력해 주세요.";
  }

  if (!isValidGender(payload.gender)) {
    return "성별을 선택해 주세요.";
  }

  if (!payload.series?.trim()) {
    return "직렬 정보를 입력해 주세요.";
  }

  if (!isValidRegion(payload.region)) {
    return "지역을 선택해 주세요.";
  }

  const age = parseAge(payload.age);

  if (age === null || age < 18 || age > 60) {
    return "나이는 18세 이상 60세 이하로 입력해 주세요.";
  }

  if (parseScore(payload.score) === null) {
    return "필기 성적을 입력해 주세요.";
  }

  return null;
}

export async function GET(request: Request) {
  const student = await getAuthorizedStudent(request.headers);

  if (!student) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const [waiting, joinedRoom] = await Promise.all([
    getWaitingEntry(student.id, student.session_id),
    getJoinedRoomSummary(student.id),
  ]);

  return jsonResponse({
    student: serializeStudent(student),
    waiting: waiting
      ? {
          id: waiting.id,
          assignedRoomId: waiting.assigned_room_id,
          createdAt: waiting.created_at,
        }
      : null,
    joinedRoom,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as StudentPayload;
  const validationMessage = validatePayload(body);

  if (validationMessage) {
    return errorResponse(validationMessage);
  }

  const session = await getSessionById(body.sessionId!);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 면접반을 찾을 수 없습니다.", 404);
  }

  const applyWindowStatus = getApplyWindowStatus(session);

  if (applyWindowStatus === "before_open") {
    return errorResponse("지원 시작 전입니다.", 409);
  }

  if (applyWindowStatus === "after_close") {
    return errorResponse("지원이 마감되었습니다.", 409);
  }

  const normalizedPhone = normalizePhone(body.phone!);
  const supabase = createServerSupabaseClient();
  const { data: registeredStudent, error: registeredStudentError } = await supabase
    .from("registered_students")
    .select("id")
    .eq("session_id", session.id)
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (registeredStudentError) {
    return errorResponse("등록 명단을 확인하지 못했습니다.", 500);
  }

  if (!registeredStudent) {
    return errorResponse("등록 명단에 없는 연락처입니다.", 403);
  }

  const existingStudent = await getStudentBySessionAndPhone(session.id, normalizedPhone);

  const payload = {
    session_id: session.id,
    phone: normalizedPhone,
    name: body.name!.trim(),
    gender: body.gender as "남" | "여",
    series: body.series!.trim(),
    region: body.region!,
    age: parseAge(body.age),
    score: parseScore(body.score),
    interview_experience: parseInterviewExperienceValue(body.interviewExperience),
  };

  if (existingStudent) {
    const { data, error } = await supabase
      .from("students")
      .update(payload)
      .eq("id", existingStudent.id)
      .select(
        "id, session_id, phone, name, gender, series, region, age, score, interview_experience, access_token, created_at",
      )
      .single();

    if (error) {
      return errorResponse("지원 정보를 저장하지 못했습니다.", 500);
    }

    return jsonResponse({
      created: false,
      student: serializeStudent(data as StudentRecord),
    });
  }

  const { data, error } = await supabase
    .from("students")
    .insert({
      ...payload,
      access_token: generateAccessToken(),
    })
    .select(
      "id, session_id, phone, name, gender, series, region, age, score, interview_experience, access_token, created_at",
    )
    .single();

  if (error) {
    return errorResponse("지원 정보를 저장하지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      created: true,
      student: serializeStudent(data as StudentRecord),
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const currentStudent = await getAuthorizedStudent(request.headers);

  if (!currentStudent) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const body = (await request.json()) as Omit<StudentPayload, "sessionId" | "phone">;

  if (!body.name?.trim()) {
    return errorResponse("이름을 입력해 주세요.");
  }

  if (!isValidGender(body.gender)) {
    return errorResponse("성별을 선택해 주세요.");
  }

  if (!body.series?.trim()) {
    return errorResponse("직렬 정보를 입력해 주세요.");
  }

  if (!isValidRegion(body.region)) {
    return errorResponse("지역을 선택해 주세요.");
  }

  const age = parseAge(body.age);

  if (age === null || age < 18 || age > 60) {
    return errorResponse("나이는 18세 이상 60세 이하로 입력해 주세요.");
  }

  const score = parseScore(body.score);
  const interviewExperience = parseInterviewExperienceValue(body.interviewExperience);

  if (score === null) {
    return errorResponse("필기 성적을 입력해 주세요.");
  }

  const session = await getSessionById(currentStudent.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 면접반을 찾을 수 없습니다.", 404);
  }

  const applyWindowStatus = getApplyWindowStatus(session);

  if (applyWindowStatus === "before_open") {
    return errorResponse("지원 시작 전입니다.", 409);
  }

  if (applyWindowStatus === "after_close") {
    return errorResponse("지원이 마감되었습니다.", 409);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("students")
    .update({
      name: body.name.trim(),
      gender: body.gender,
      series: body.series.trim(),
      region: body.region,
      age,
      score,
      interview_experience: interviewExperience,
    })
    .eq("id", currentStudent.id)
    .select(
      "id, session_id, phone, name, gender, series, region, age, score, interview_experience, access_token, created_at",
    )
    .single();

  if (error) {
    return errorResponse("지원 정보를 수정하지 못했습니다.", 500);
  }

  return jsonResponse({
    student: serializeStudent(data as StudentRecord),
  });
}

export async function DELETE(request: Request) {
  const currentStudent = await getAuthorizedStudent(request.headers);

  if (!currentStudent) {
    return errorResponse("학생 인증이 필요합니다.", 401);
  }

  const session = await getSessionById(currentStudent.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 면접반을 찾을 수 없습니다.", 404);
  }

  const applyWindowStatus = getApplyWindowStatus(session);

  if (applyWindowStatus === "before_open") {
    return errorResponse("지원 시작 전입니다.", 409);
  }

  if (applyWindowStatus === "after_close") {
    return errorResponse("지원 마감 후에는 지원 취소가 불가합니다.", 409);
  }

  const joinedMembership = await getJoinedMembershipByStudent(currentStudent.id);

  if (joinedMembership) {
    await removeJoinedMemberFromRoom({
      roomId: joinedMembership.room_id,
      sessionId: currentStudent.session_id,
      membershipId: joinedMembership.id,
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      role: joinedMembership.role,
      noticeMessage: `${currentStudent.name}님이 지원을 취소해 조에서 자동으로 탈퇴했습니다.`,
      moveToWaitingPool: false,
    });
  }

  const supabase = createServerSupabaseClient();

  const { error: pollError } = await supabase
    .from("study_polls")
    .delete()
    .eq("created_by", currentStudent.id);

  if (pollError) {
    return errorResponse("생성한 투표 정보를 정리하지 못했습니다.", 500);
  }

  const { error: chatError } = await supabase
    .from("chat_messages")
    .delete()
    .eq("student_id", currentStudent.id);

  if (chatError) {
    return errorResponse("채팅 기록을 정리하지 못했습니다.", 500);
  }

  const { error: roomCleanupError } = await supabase
    .from("group_rooms")
    .update({ creator_student_id: null })
    .eq("creator_student_id", currentStudent.id);

  if (roomCleanupError) {
    return errorResponse("조 방 정보를 정리하지 못했습니다.", 500);
  }

  const { error: deleteError } = await supabase
    .from("students")
    .delete()
    .eq("id", currentStudent.id);

  if (deleteError) {
    return errorResponse("지원 정보를 삭제하지 못했습니다.", 500);
  }

  return jsonResponse({
    deleted: true,
    deletedRoomId: joinedMembership?.room_id ?? null,
    redirectPath: `/apply?track=${session.track}`,
  });
}
