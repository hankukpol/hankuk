import { errorResponse, jsonResponse } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import {
  buildRateLimitKey,
  checkRateLimit,
  createRateLimitHeaders,
} from "@/lib/rate-limit";
import {
  getReservationWindowStatus,
  type SessionRecord,
} from "@/lib/sessions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CreateReservationPayload = {
  sessionId?: string;
  slotId?: string;
  name?: string;
  phone?: string;
};

type ChangeReservationPayload = {
  reservationId?: string;
  newSlotId?: string;
};

type CancelReservationPayload = {
  id?: string;
  cancelReason?: string;
};

type ReservationRow = {
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

type SlotRow = {
  id: string;
  session_id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  reserved_count: number;
  is_active: boolean;
};

function buildRateLimitedResponse(
  message: string,
  rateLimit: Awaited<ReturnType<typeof checkRateLimit>>,
) {
  return jsonResponse(
    { message },
    {
      status: 429,
      headers: createRateLimitHeaders(rateLimit),
    },
  );
}

async function getSessionOrNull(sessionId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, name, track, status, reservation_open_at, reservation_close_at, apply_open_at, apply_close_at, interview_date, max_group_size, min_group_size, created_at, archived_at",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SessionRecord | null;
}

async function getSlotOrNull(slotId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("reservation_slots")
    .select("id, session_id, date, start_time, end_time, capacity, reserved_count, is_active")
    .eq("id", slotId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SlotRow | null;
}

async function getReservationDetailById(reservationId: string) {
  const supabase = createServerSupabaseClient();
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, session_id, slot_id, name, phone, status, cancel_reason, booked_by, created_at")
    .eq("id", reservationId)
    .single();

  if (reservationError) {
    throw reservationError;
  }

  const { data: slot, error: slotError } = await supabase
    .from("reservation_slots")
    .select("id, session_id, date, start_time, end_time, capacity, reserved_count, is_active")
    .eq("id", reservation.slot_id)
    .single();

  if (slotError) {
    throw slotError;
  }

  return serializeReservation(reservation as ReservationRow, slot as SlotRow);
}

function serializeReservation(reservation: ReservationRow, slot: SlotRow) {
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const phone = searchParams.get("phone");

  if (!sessionId || !phone) {
    return errorResponse("session_id와 phone이 필요합니다.");
  }

  const normalizedPhone = normalizePhone(phone);
  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey(request, "reservation-read", `${sessionId}:${normalizedPhone}`),
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return buildRateLimitedResponse(
      "예약 조회 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      rateLimit,
    );
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, session_id, slot_id, name, phone, status, cancel_reason, booked_by, created_at")
    .eq("session_id", sessionId)
    .eq("phone", normalizedPhone)
    .eq("status", "확정")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return errorResponse("예약 정보를 불러오지 못했습니다.", 500);
  }

  if (!data) {
    return jsonResponse(
      { reservation: null },
      { headers: createRateLimitHeaders(rateLimit) },
    );
  }

  const { data: slot, error: slotError } = await supabase
    .from("reservation_slots")
    .select("id, session_id, date, start_time, end_time, capacity, reserved_count, is_active")
    .eq("id", data.slot_id)
    .single();

  if (slotError) {
    return errorResponse("예약 슬롯 정보를 불러오지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      reservation: serializeReservation(data as ReservationRow, slot as SlotRow),
    },
    {
      headers: createRateLimitHeaders(rateLimit),
    },
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateReservationPayload;

  if (!body.sessionId || !body.slotId || !body.name?.trim() || !body.phone?.trim()) {
    return errorResponse("세션, 슬롯, 이름, 연락처를 모두 입력해 주세요.");
  }

  const normalizedPhone = normalizePhone(body.phone);
  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey(request, "reservation-create", `${body.sessionId}:${normalizedPhone}`),
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return buildRateLimitedResponse(
      "예약 생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      rateLimit,
    );
  }

  const session = await getSessionOrNull(body.sessionId);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 면접반을 찾을 수 없습니다.", 404);
  }

  const windowStatus = getReservationWindowStatus(session);

  if (windowStatus === "before_open") {
    return errorResponse("예약 시작 전입니다.", 409);
  }

  if (windowStatus === "after_close") {
    return errorResponse("예약이 이미 마감되었습니다.", 409);
  }

  const supabase = createServerSupabaseClient();
  const { data: existingReservation, error: existingReservationError } = await supabase
    .from("reservations")
    .select("id")
    .eq("session_id", body.sessionId)
    .eq("phone", normalizedPhone)
    .eq("status", "확정")
    .limit(1)
    .maybeSingle();

  if (existingReservationError) {
    return errorResponse("기존 예약 상태를 확인하지 못했습니다.", 500);
  }

  if (existingReservation) {
    return errorResponse("이미 예약된 연락처입니다.", 409);
  }

  const slot = await getSlotOrNull(body.slotId);

  if (!slot || slot.session_id !== body.sessionId) {
    return errorResponse("예약 슬롯을 찾을 수 없습니다.", 404);
  }

  if (!slot.is_active) {
    return errorResponse("비활성화된 슬롯입니다.", 409);
  }

  if (slot.reserved_count >= slot.capacity) {
    return errorResponse("정원이 마감되었습니다.", 409);
  }

  const { data, error } = await supabase.rpc("create_reservation", {
    p_slot_id: body.slotId,
    p_session_id: body.sessionId,
    p_name: body.name.trim(),
    p_phone: normalizedPhone,
    p_booked_by: "학생",
  });

  if (error) {
    return errorResponse("예약을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.", 400);
  }

  return jsonResponse(
    { reservation: await getReservationDetailById((data as ReservationRow).id) },
    {
      status: 201,
      headers: createRateLimitHeaders(rateLimit),
    },
  );
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as ChangeReservationPayload;

  if (!body.reservationId || !body.newSlotId) {
    return errorResponse("reservationId와 newSlotId가 필요합니다.");
  }

  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey(request, "reservation-change", body.reservationId),
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return buildRateLimitedResponse(
      "예약 변경 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      rateLimit,
    );
  }

  const supabase = createServerSupabaseClient();
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, session_id, slot_id, status")
    .eq("id", body.reservationId)
    .single();

  if (reservationError || !reservation) {
    return errorResponse("예약 정보를 찾을 수 없습니다.", 404);
  }

  if (reservation.status !== "확정") {
    return errorResponse("확정 예약만 변경할 수 있습니다.", 409);
  }

  const session = await getSessionOrNull(reservation.session_id);

  if (!session || session.status !== "active") {
    return errorResponse("운영 중인 면접반을 찾을 수 없습니다.", 404);
  }

  const windowStatus = getReservationWindowStatus(session);

  if (windowStatus === "before_open") {
    return errorResponse("예약 시작 전입니다.", 409);
  }

  if (windowStatus === "after_close") {
    return errorResponse("예약이 이미 마감되었습니다.", 409);
  }

  const newSlot = await getSlotOrNull(body.newSlotId);

  if (!newSlot) {
    return errorResponse("변경할 슬롯을 찾을 수 없습니다.", 404);
  }

  if (newSlot.session_id !== reservation.session_id) {
    return errorResponse("같은 면접반의 슬롯으로만 변경할 수 있습니다.", 409);
  }

  if (!newSlot.is_active) {
    return errorResponse("비활성화된 슬롯입니다.", 409);
  }

  if (newSlot.id !== reservation.slot_id && newSlot.reserved_count >= newSlot.capacity) {
    return errorResponse("변경할 슬롯의 정원이 마감되었습니다.", 409);
  }

  const { data, error } = await supabase.rpc("change_reservation_slot", {
    p_reservation_id: body.reservationId,
    p_new_slot_id: body.newSlotId,
  });

  if (error) {
    return errorResponse("예약을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.", 400);
  }

  return jsonResponse(
    {
      reservation: await getReservationDetailById((data as ReservationRow).id),
    },
    {
      headers: createRateLimitHeaders(rateLimit),
    },
  );
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  let reservationId = searchParams.get("id") ?? undefined;
  let cancelReason = searchParams.get("cancel_reason") ?? undefined;

  try {
    const body = (await request.json()) as CancelReservationPayload;
    reservationId = body.id ?? reservationId;
    cancelReason = body.cancelReason ?? cancelReason;
  } catch {
    // Ignore empty request body.
  }

  if (!reservationId) {
    return errorResponse("취소할 예약 id가 필요합니다.");
  }

  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey(request, "reservation-cancel", reservationId),
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return buildRateLimitedResponse(
      "예약 취소 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      rateLimit,
    );
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("cancel_reservation", {
    p_reservation_id: reservationId,
    p_cancel_reason: cancelReason ?? null,
  });

  if (error) {
    return errorResponse("예약을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.", 400);
  }

  return jsonResponse(
    {
      reservation: await getReservationDetailById((data as ReservationRow).id),
    },
    {
      headers: createRateLimitHeaders(rateLimit),
    },
  );
}
