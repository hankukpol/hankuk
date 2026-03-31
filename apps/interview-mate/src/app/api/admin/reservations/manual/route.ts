import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import { getSessionById } from "@/lib/session-queries";
import { getReservationDetailById } from "@/lib/reservation-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ManualReservationPayload = {
  sessionId?: string;
  slotId?: string;
  name?: string;
  phone?: string;
};

export async function POST(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as ManualReservationPayload;

  if (!body.sessionId || !body.slotId || !body.name?.trim() || !body.phone?.trim()) {
    return errorResponse("세션, 슬롯, 이름, 연락처를 모두 입력해 주세요.");
  }

  const session = await getSessionById(body.sessionId);

  if (!session) {
    return errorResponse("면접반을 찾을 수 없습니다.", 404);
  }

  if (session.status !== "active") {
    return errorResponse("종료된 면접반에는 예약을 등록할 수 없습니다.", 409);
  }

  const supabase = createServerSupabaseClient();
  const normalizedPhone = normalizePhone(body.phone);
  const { data, error } = await supabase.rpc("create_reservation", {
    p_slot_id: body.slotId,
    p_session_id: body.sessionId,
    p_name: body.name.trim(),
    p_phone: normalizedPhone,
    p_booked_by: "관리자",
  });

  if (error) {
    return errorResponse("관리자 예약을 등록하지 못했습니다.", 400);
  }

  return jsonResponse(
    {
      reservation: await getReservationDetailById((data as { id: string }).id),
    },
    { status: 201 },
  );
}
