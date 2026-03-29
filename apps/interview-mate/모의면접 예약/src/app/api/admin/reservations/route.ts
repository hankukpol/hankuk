import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import {
  serializeReservation,
  type ReservationRecord,
  type ReservationSlotRecord,
} from "@/lib/reservation-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ReservationStatusFilter = "all" | "확정" | "취소";

function isReservationStatusFilter(
  value: string | null,
): value is ReservationStatusFilter {
  return value === "all" || value === "확정" || value === "취소";
}

export async function GET(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const query = searchParams.get("query")?.trim() ?? "";
  const status = searchParams.get("status") ?? "all";

  if (!sessionId) {
    return errorResponse("session_id가 필요합니다.");
  }

  if (!isReservationStatusFilter(status)) {
    return errorResponse("예약 상태 필터가 올바르지 않습니다.");
  }

  const supabase = createServerSupabaseClient();
  let reservationQuery = supabase
    .from("reservations")
    .select(
      "id, session_id, slot_id, name, phone, status, cancel_reason, booked_by, created_at",
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    reservationQuery = reservationQuery.eq("status", status);
  }

  if (query) {
    reservationQuery = reservationQuery.or(
      `name.ilike.%${query}%,phone.ilike.%${query}%`,
    );
  }

  const { data, error } = await reservationQuery;

  if (error) {
    return errorResponse("예약 목록을 불러오지 못했습니다.", 500);
  }

  const reservations = (data ?? []) as ReservationRecord[];

  if (reservations.length === 0) {
    return jsonResponse({
      reservations: [],
      summary: {
        totalCount: 0,
        confirmedCount: 0,
        cancelledCount: 0,
      },
    });
  }

  const slotIds = Array.from(new Set(reservations.map((reservation) => reservation.slot_id)));

  const { data: slotsData, error: slotsError } = await supabase
    .from("reservation_slots")
    .select("id, date, start_time, end_time, capacity, reserved_count, is_active")
    .in("id", slotIds);

  if (slotsError) {
    return errorResponse("예약 슬롯 정보를 불러오지 못했습니다.", 500);
  }

  const slotMap = new Map(
    ((slotsData ?? []) as ReservationSlotRecord[]).map((slot) => [slot.id, slot]),
  );

  const serializedReservations = reservations
    .map((reservation) => {
      const slot = slotMap.get(reservation.slot_id);
      return slot ? serializeReservation(reservation, slot) : null;
    })
    .filter((reservation): reservation is NonNullable<typeof reservation> => Boolean(reservation));

  const confirmedCount = serializedReservations.filter(
    (reservation) => reservation.status === "확정",
  ).length;
  const cancelledCount = serializedReservations.filter(
    (reservation) => reservation.status === "취소",
  ).length;

  return jsonResponse({
    reservations: serializedReservations,
    summary: {
      totalCount: serializedReservations.length,
      confirmedCount,
      cancelledCount,
    },
  });
}
