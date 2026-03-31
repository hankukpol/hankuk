import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { isTrack } from "@/lib/constants";
import { errorResponse, jsonResponse } from "@/lib/http";
import { serializeSession, type SessionRecord } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SessionPayload = {
  name?: string;
  track?: string;
  status?: "active" | "archived";
  reservationOpenAt?: string | null;
  reservationCloseAt?: string | null;
  applyOpenAt?: string | null;
  applyCloseAt?: string | null;
  interviewDate?: string | null;
  maxGroupSize?: number;
  minGroupSize?: number;
};

type SessionRouteProps = {
  params: {
    id: string;
  };
};

function validateGroupSizeRange(maxGroupSize: number, minGroupSize: number) {
  if (!Number.isInteger(maxGroupSize) || maxGroupSize < 1) {
    return "최대 조 인원은 1명 이상 정수여야 합니다.";
  }

  if (!Number.isInteger(minGroupSize) || minGroupSize < 1) {
    return "최소 조 인원은 1명 이상 정수여야 합니다.";
  }

  if (minGroupSize > maxGroupSize) {
    return "최소 조 인원은 최대 조 인원보다 클 수 없습니다.";
  }

  return null;
}

function validateSessionWindows(options: {
  reservationOpenAt: string | null;
  reservationCloseAt: string | null;
  applyOpenAt: string | null;
  applyCloseAt: string | null;
}) {
  const reservationOpenAt = options.reservationOpenAt
    ? Date.parse(options.reservationOpenAt)
    : null;
  const reservationCloseAt = options.reservationCloseAt
    ? Date.parse(options.reservationCloseAt)
    : null;
  const applyOpenAt = options.applyOpenAt ? Date.parse(options.applyOpenAt) : null;
  const applyCloseAt = options.applyCloseAt ? Date.parse(options.applyCloseAt) : null;

  if (
    (options.reservationOpenAt && Number.isNaN(reservationOpenAt)) ||
    (options.reservationCloseAt && Number.isNaN(reservationCloseAt))
  ) {
    return "예약 시간 형식이 올바르지 않습니다.";
  }

  if (
    (options.applyOpenAt && Number.isNaN(applyOpenAt)) ||
    (options.applyCloseAt && Number.isNaN(applyCloseAt))
  ) {
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

export async function PATCH(request: Request, { params }: SessionRouteProps) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as SessionPayload;

  if (body.track && !isTrack(body.track)) {
    return errorResponse("직렬 값이 올바르지 않습니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: existingSession, error: existingSessionError } = await supabase
    .from("sessions")
    .select(
      "id, track, status, reservation_open_at, reservation_close_at, apply_open_at, apply_close_at, max_group_size, min_group_size",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (existingSessionError) {
    return errorResponse("세션 정보를 불러오지 못했습니다.", 500);
  }

  if (!existingSession) {
    return errorResponse("세션을 찾을 수 없습니다.", 404);
  }

  if (body.name !== undefined && !body.name.trim()) {
    return errorResponse("면접반 이름을 입력해 주세요.");
  }

  if (body.track !== undefined && body.track !== existingSession.track) {
    return errorResponse("이미 생성된 세션의 직렬은 변경할 수 없습니다.", 409);
  }

  const nextMaxGroupSize = body.maxGroupSize ?? existingSession.max_group_size;
  const nextMinGroupSize = body.minGroupSize ?? existingSession.min_group_size;
  const groupSizeError = validateGroupSizeRange(
    nextMaxGroupSize,
    nextMinGroupSize,
  );

  if (groupSizeError) {
    return errorResponse(groupSizeError);
  }

  const sessionWindowError = validateSessionWindows({
    reservationOpenAt:
      body.reservationOpenAt !== undefined
        ? body.reservationOpenAt
        : existingSession.reservation_open_at,
    reservationCloseAt:
      body.reservationCloseAt !== undefined
        ? body.reservationCloseAt
        : existingSession.reservation_close_at,
    applyOpenAt:
      body.applyOpenAt !== undefined
        ? body.applyOpenAt
        : existingSession.apply_open_at,
    applyCloseAt:
      body.applyCloseAt !== undefined
        ? body.applyCloseAt
        : existingSession.apply_close_at,
  });

  if (sessionWindowError) {
    return errorResponse(sessionWindowError);
  }

  const nextStatus = body.status ?? existingSession.status;

  if (nextStatus === "active") {
    const { data: conflictingSession, error: conflictingSessionError } =
      await supabase
        .from("sessions")
        .select("id")
        .eq("track", existingSession.track)
        .eq("status", "active")
        .neq("id", params.id)
        .limit(1)
        .maybeSingle();

    if (conflictingSessionError) {
      return errorResponse("세션 변경 가능 여부를 확인하지 못했습니다.", 500);
    }

    if (conflictingSession) {
      return errorResponse("해당 직렬에는 이미 운영 중인 세션이 있습니다.", 409);
    }
  }

  const updates = {
    ...(body.name !== undefined ? { name: body.name.trim() } : {}),
    ...(body.status ? { status: body.status } : {}),
    ...(body.reservationOpenAt !== undefined
      ? { reservation_open_at: body.reservationOpenAt }
      : {}),
    ...(body.reservationCloseAt !== undefined
      ? { reservation_close_at: body.reservationCloseAt }
      : {}),
    ...(body.applyOpenAt !== undefined ? { apply_open_at: body.applyOpenAt } : {}),
    ...(body.applyCloseAt !== undefined
      ? { apply_close_at: body.applyCloseAt }
      : {}),
    ...(body.interviewDate !== undefined ? { interview_date: body.interviewDate } : {}),
    ...(body.maxGroupSize !== undefined ? { max_group_size: body.maxGroupSize } : {}),
    ...(body.minGroupSize !== undefined ? { min_group_size: body.minGroupSize } : {}),
  };

  const { data, error } = await supabase
    .from("sessions")
    .update(updates)
    .eq("id", params.id)
    .select(
      "id, name, track, status, reservation_open_at, reservation_close_at, apply_open_at, apply_close_at, interview_date, max_group_size, min_group_size, created_at, archived_at",
    )
    .single();

  if (error) {
    return errorResponse("세션을 수정하지 못했습니다.", 500);
  }

  return jsonResponse({ session: serializeSession(data as SessionRecord) });
}
