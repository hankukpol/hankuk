import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { getReservationDetailById } from "@/lib/reservation-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CancelReservationPayload = {
  cancelReason?: string;
};

type ReservationRouteProps = {
  params: {
    id: string;
  };
};

export async function DELETE(request: Request, { params }: ReservationRouteProps) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  let cancelReason: string | null = null;

  try {
    const body = (await request.json()) as CancelReservationPayload;
    cancelReason = body.cancelReason?.trim() ?? null;
  } catch {
    cancelReason = null;
  }

  if (!cancelReason) {
    return errorResponse("예약 취소 사유를 입력해 주세요.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("cancel_reservation", {
    p_reservation_id: params.id,
    p_cancel_reason: cancelReason,
  });

  if (error) {
    return errorResponse(error.message || "예약을 취소하지 못했습니다.", 400);
  }

  return jsonResponse({
    reservation: await getReservationDetailById((data as { id: string }).id),
  });
}
