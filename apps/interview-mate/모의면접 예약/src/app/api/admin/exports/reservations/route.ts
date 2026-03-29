import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { buildCsv, createCsvResponse } from "@/lib/csv";
import { errorResponse } from "@/lib/http";
import {
  serializeReservation,
  type ReservationRecord,
  type ReservationSlotRecord,
} from "@/lib/reservation-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SessionRow = {
  id: string;
  name: string;
  track: string;
};

function sanitizeFileNamePart(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9-_]+/g, "-").replaceAll(/-+/g, "-");
}

export async function GET(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("관리자 권한이 없습니다.", 401);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return errorResponse("session_id가 필요합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase
    .from("sessions")
    .select("id, name, track")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !sessionData) {
    return errorResponse("세션 정보를 찾을 수 없습니다.", 404);
  }

  const { data: reservationsData, error: reservationsError } = await supabase
    .from("reservations")
    .select(
      "id, session_id, slot_id, name, phone, status, cancel_reason, booked_by, created_at",
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (reservationsError) {
    return errorResponse("예약 데이터를 내보내지 못했습니다.", 500);
  }

  const reservations = (reservationsData ?? []) as ReservationRecord[];
  const slotIds = Array.from(
    new Set(reservations.map((reservation) => reservation.slot_id)),
  );

  const slotMap = new Map<string, ReservationSlotRecord>();

  if (slotIds.length > 0) {
    const { data: slotsData, error: slotsError } = await supabase
      .from("reservation_slots")
      .select("id, date, start_time, end_time, capacity, reserved_count, is_active")
      .in("id", slotIds);

    if (slotsError) {
      return errorResponse("예약 슬롯 정보를 불러오지 못했습니다.", 500);
    }

    for (const slot of (slotsData ?? []) as ReservationSlotRecord[]) {
      slotMap.set(slot.id, slot);
    }
  }

  const serializedReservations = reservations
    .map((reservation) => {
      const slot = slotMap.get(reservation.slot_id);
      return slot ? serializeReservation(reservation, slot) : null;
    })
    .filter((reservation): reservation is NonNullable<typeof reservation> =>
      Boolean(reservation),
    )
    .sort((left, right) => {
      const leftKey = `${left.slot.date} ${left.slot.startTime} ${left.createdAt}`;
      const rightKey = `${right.slot.date} ${right.slot.startTime} ${right.createdAt}`;
      return leftKey.localeCompare(rightKey, "ko-KR");
    });

  const session = sessionData as SessionRow;
  const csv = buildCsv([
    [
      "세션명",
      "직렬",
      "예약ID",
      "이름",
      "연락처",
      "상태",
      "예약일",
      "시작시간",
      "종료시간",
      "예약경로",
      "등록일시",
      "취소사유",
    ],
    ...serializedReservations.map((reservation) => [
      session.name,
      session.track,
      reservation.id,
      reservation.name,
      reservation.phone,
      reservation.status,
      reservation.slot.date,
      reservation.slot.startTime,
      reservation.slot.endTime,
      reservation.bookedBy,
      reservation.createdAt,
      reservation.cancelReason ?? "",
    ]),
  ]);

  return createCsvResponse(
    `reservations-${sanitizeFileNamePart(session.track)}-${sessionId}.csv`,
    csv,
  );
}
