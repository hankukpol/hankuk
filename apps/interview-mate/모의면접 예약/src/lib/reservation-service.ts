import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ReservationRecord = {
  id: string;
  session_id: string;
  slot_id: string;
  name: string;
  phone: string;
  status: "확정" | "취소";
  cancel_reason: string | null;
  booked_by: "학생" | "관리자";
  created_at: string;
};

export type ReservationSlotRecord = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  reserved_count: number;
  is_active: boolean;
};

export type ReservationSummary = {
  id: string;
  sessionId: string;
  name: string;
  phone: string;
  status: "확정" | "취소";
  cancelReason: string | null;
  bookedBy: "학생" | "관리자";
  createdAt: string;
  slot: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    capacity: number;
    reservedCount: number;
    remainingCount: number;
    isActive: boolean;
  };
};

export function serializeReservation(
  reservation: ReservationRecord,
  slot: ReservationSlotRecord,
): ReservationSummary {
  return {
    id: reservation.id,
    sessionId: reservation.session_id,
    name: reservation.name,
    phone: reservation.phone,
    status: reservation.status,
    cancelReason: reservation.cancel_reason,
    bookedBy: reservation.booked_by,
    createdAt: reservation.created_at,
    slot: {
      id: slot.id,
      date: slot.date,
      startTime: slot.start_time,
      endTime: slot.end_time,
      capacity: slot.capacity,
      reservedCount: slot.reserved_count,
      remainingCount: Math.max(slot.capacity - slot.reserved_count, 0),
      isActive: slot.is_active,
    },
  };
}

export async function getReservationDetailById(reservationId: string) {
  const supabase = createServerSupabaseClient();
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select(
      "id, session_id, slot_id, name, phone, status, cancel_reason, booked_by, created_at",
    )
    .eq("id", reservationId)
    .single();

  if (reservationError) {
    throw reservationError;
  }

  const { data: slot, error: slotError } = await supabase
    .from("reservation_slots")
    .select("id, date, start_time, end_time, capacity, reserved_count, is_active")
    .eq("id", reservation.slot_id)
    .single();

  if (slotError) {
    throw slotError;
  }

  return serializeReservation(
    reservation as ReservationRecord,
    slot as ReservationSlotRecord,
  );
}
