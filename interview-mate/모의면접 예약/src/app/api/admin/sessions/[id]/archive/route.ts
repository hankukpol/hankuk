import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { serializeSession, type SessionRecord } from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ArchiveRouteProps = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: ArchiveRouteProps) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const supabase = createServerSupabaseClient();
  const archivedAt = new Date().toISOString();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .update({
      status: "archived",
      archived_at: archivedAt,
      reservation_close_at: archivedAt,
      apply_close_at: archivedAt,
    })
    .eq("id", params.id)
    .select(
      "id, name, track, status, reservation_open_at, reservation_close_at, apply_open_at, apply_close_at, interview_date, max_group_size, min_group_size, created_at, archived_at",
    )
    .single();

  if (sessionError) {
    return errorResponse("세션을 종료하지 못했습니다.", 500);
  }

  const { error: roomError } = await supabase
    .from("group_rooms")
    .update({ status: "closed" })
    .eq("session_id", params.id);

  if (roomError) {
    return errorResponse("연결된 조 방 상태를 정리하지 못했습니다.", 500);
  }

  return jsonResponse({ session: serializeSession(session as SessionRecord) });
}
