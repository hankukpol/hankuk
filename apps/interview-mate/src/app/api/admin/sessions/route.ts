import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { isTrack } from "@/lib/constants";
import { errorResponse, jsonResponse } from "@/lib/http";
import { serializeSession, type SessionRecord } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SessionPayload = {
  name?: string;
  track?: string;
  reservationOpenAt?: string | null;
  reservationCloseAt?: string | null;
  applyOpenAt?: string | null;
  applyCloseAt?: string | null;
  interviewDate?: string | null;
  maxGroupSize?: number;
  minGroupSize?: number;
};

type NormalizedSessionPayload = {
  name?: string;
  track?: string;
  reservation_open_at: string | null;
  reservation_close_at: string | null;
  apply_open_at: string | null;
  apply_close_at: string | null;
  interview_date: string | null;
  max_group_size: number;
  min_group_size: number;
};

function normalizeSessionPayload(payload: SessionPayload): NormalizedSessionPayload {
  return {
    name: payload.name?.trim(),
    track: payload.track,
    reservation_open_at: payload.reservationOpenAt ?? null,
    reservation_close_at: payload.reservationCloseAt ?? null,
    apply_open_at: payload.applyOpenAt ?? null,
    apply_close_at: payload.applyCloseAt ?? null,
    interview_date: payload.interviewDate ?? null,
    max_group_size: payload.maxGroupSize ?? 10,
    min_group_size: payload.minGroupSize ?? 6,
  };
}

function validateGroupSizeRange(payload: Pick<NormalizedSessionPayload, "max_group_size" | "min_group_size">) {
  if (!Number.isInteger(payload.max_group_size) || payload.max_group_size < 1) {
    return "최대 조 인원은 1명 이상 정수여야 합니다.";
  }

  if (!Number.isInteger(payload.min_group_size) || payload.min_group_size < 1) {
    return "최소 조 인원은 1명 이상 정수여야 합니다.";
  }

  if (payload.min_group_size > payload.max_group_size) {
    return "최소 조 인원은 최대 조 인원보다 클 수 없습니다.";
  }

  return null;
}

function validateSessionWindows(payload: Pick<
  NormalizedSessionPayload,
  "reservation_open_at" | "reservation_close_at" | "apply_open_at" | "apply_close_at"
>) {
  const reservationOpenAt =
    payload.reservation_open_at ? Date.parse(payload.reservation_open_at) : null;
  const reservationCloseAt =
    payload.reservation_close_at ? Date.parse(payload.reservation_close_at) : null;
  const applyOpenAt = payload.apply_open_at ? Date.parse(payload.apply_open_at) : null;
  const applyCloseAt = payload.apply_close_at ? Date.parse(payload.apply_close_at) : null;

  if (
    (payload.reservation_open_at && Number.isNaN(reservationOpenAt)) ||
    (payload.reservation_close_at && Number.isNaN(reservationCloseAt))
  ) {
    return "예약 시간 형식이 올바르지 않습니다.";
  }

  if ((payload.apply_open_at && Number.isNaN(applyOpenAt)) || (payload.apply_close_at && Number.isNaN(applyCloseAt))) {
    return "지원 시간 형식이 올바르지 않습니다.";
  }

  if (
    reservationOpenAt !== null &&
    reservationCloseAt !== null &&
    reservationOpenAt > reservationCloseAt
  ) {
    return "예약 시작 시간은 종료 시간보다 늦을 수 없습니다.";
  }

  if (applyOpenAt !== null && applyCloseAt !== null && applyOpenAt > applyCloseAt) {
    return "지원 시작 시간은 종료 시간보다 늦을 수 없습니다.";
  }

  return null;
}

async function findActiveSessionByTrack(track: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("track", track)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function GET(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, name, track, status, reservation_open_at, reservation_close_at, apply_open_at, apply_close_at, interview_date, max_group_size, min_group_size, created_at, archived_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return errorResponse("세션 목록을 불러오지 못했습니다.", 500);
  }

  return jsonResponse({
    sessions: (data as SessionRecord[]).map(serializeSession),
  });
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const payload = normalizeSessionPayload((await request.json()) as SessionPayload);

  if (!payload.name) {
    return errorResponse("면접반 이름을 입력해 주세요.");
  }

  if (!isTrack(payload.track)) {
    return errorResponse("직렬 값이 올바르지 않습니다.");
  }

  const groupSizeError = validateGroupSizeRange(payload);

  if (groupSizeError) {
    return errorResponse(groupSizeError);
  }

  const sessionWindowError = validateSessionWindows(payload);

  if (sessionWindowError) {
    return errorResponse(sessionWindowError);
  }

  let existingActiveSession;

  try {
    existingActiveSession = await findActiveSessionByTrack(payload.track);
  } catch {
    return errorResponse("현재 운영 중인 세션을 확인하지 못했습니다.", 500);
  }

  if (existingActiveSession) {
    return errorResponse("해당 직렬에는 이미 운영 중인 세션이 있습니다.", 409);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      ...payload,
      status: "active",
    })
    .select(
      "id, name, track, status, reservation_open_at, reservation_close_at, apply_open_at, apply_close_at, interview_date, max_group_size, min_group_size, created_at, archived_at",
    )
    .single();

  if (error) {
    return errorResponse("세션을 생성하지 못했습니다.", 500);
  }

  return jsonResponse(
    { session: serializeSession(data as SessionRecord) },
    { status: 201 },
  );
}
