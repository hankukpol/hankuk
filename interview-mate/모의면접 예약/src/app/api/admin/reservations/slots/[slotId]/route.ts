import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SlotRouteProps = {
  params: {
    slotId: string;
  };
};

type SlotUpdatePayload = {
  capacity?: number;
  isActive?: boolean;
};

export async function PATCH(request: Request, { params }: SlotRouteProps) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as SlotUpdatePayload;
  const slotId = params.slotId.trim();

  if (!slotId) {
    return errorResponse("수정할 슬롯 id가 필요합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: existingSlot, error: selectError } = await supabase
    .from("reservation_slots")
    .select("id, capacity, reserved_count, is_active")
    .eq("id", slotId)
    .maybeSingle();

  if (selectError) {
    return errorResponse("예약 슬롯 정보를 불러오지 못했습니다.", 500);
  }

  if (!existingSlot) {
    return errorResponse("예약 슬롯을 찾을 수 없습니다.", 404);
  }

  const updates: { capacity?: number; is_active?: boolean } = {};

  if (body.capacity !== undefined) {
    if (!Number.isInteger(body.capacity) || body.capacity <= 0) {
      return errorResponse("정원은 1 이상의 정수여야 합니다.");
    }

    if (body.capacity < existingSlot.reserved_count) {
      return errorResponse(
        `현재 확정 예약 ${existingSlot.reserved_count}건보다 작게 정원을 줄일 수 없습니다.`,
      );
    }

    updates.capacity = body.capacity;
  }

  if (body.isActive !== undefined) {
    updates.is_active = body.isActive;
  }

  if (!Object.keys(updates).length) {
    return errorResponse("수정할 항목이 없습니다.");
  }

  const { data, error } = await supabase
    .from("reservation_slots")
    .update(updates)
    .eq("id", slotId)
    .select("id, date, start_time, end_time, capacity, reserved_count, is_active")
    .single();

  if (error || !data) {
    return errorResponse("예약 슬롯을 수정하지 못했습니다.", 500);
  }

  return jsonResponse({
    slot: {
      id: data.id,
      date: data.date,
      startTime: data.start_time,
      endTime: data.end_time,
      capacity: data.capacity,
      reservedCount: data.reserved_count,
      remainingCount: Math.max(data.capacity - data.reserved_count, 0),
      isActive: data.is_active,
    },
  });
}

export async function DELETE(_request: Request, { params }: SlotRouteProps) {
  if (!isAdminAuthorized(getAdminKey(_request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const slotId = params.slotId.trim();

  if (!slotId) {
    return errorResponse("삭제할 슬롯 id가 필요합니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data: existingSlot, error: selectError } = await supabase
    .from("reservation_slots")
    .select("id, reserved_count")
    .eq("id", slotId)
    .maybeSingle();

  if (selectError) {
    return errorResponse("삭제할 슬롯 정보를 불러오지 못했습니다.", 500);
  }

  if (!existingSlot) {
    return errorResponse("삭제할 슬롯을 찾을 수 없습니다.", 404);
  }

  if (existingSlot.reserved_count > 0) {
    return errorResponse("확정 예약이 있는 슬롯은 삭제할 수 없습니다.", 409);
  }

  const { error } = await supabase
    .from("reservation_slots")
    .delete()
    .eq("id", slotId);

  if (error) {
    return errorResponse("예약 슬롯을 삭제하지 못했습니다.", 500);
  }

  return jsonResponse({
    deletedId: slotId,
  });
}
