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

export async function PATCH(request: Request, { params }: SessionRouteProps) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as SessionPayload;

  if (body.track && !isTrack(body.track)) {
    return errorResponse("직렬 값이 올바르지 않습니다.");
  }

  const updates = {
    ...(body.name ? { name: body.name.trim() } : {}),
    ...(body.track ? { track: body.track } : {}),
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

  const supabase = createServerSupabaseClient();
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
