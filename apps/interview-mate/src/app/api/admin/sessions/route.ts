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

function normalizeSessionPayload(payload: SessionPayload) {
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

export async function GET(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
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
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const payload = normalizeSessionPayload((await request.json()) as SessionPayload);

  if (!payload.name) {
    return errorResponse("면접반 이름을 입력해주세요.");
  }

  if (!isTrack(payload.track)) {
    return errorResponse("직렬 값이 올바르지 않습니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: existingActiveSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("track", payload.track)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (existingActiveSession) {
    return errorResponse("해당 직렬에는 이미 운영 중인 세션이 있습니다.", 409);
  }

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
