import { errorResponse, jsonResponse } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function isValidDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isValidMonth(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function getMonthRange(month: string) {
  const [yearString, monthString] = month.split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const date = searchParams.get("date");
  const month = searchParams.get("month");

  if (!sessionId) {
    return errorResponse("session_id가 필요합니다.");
  }

  const supabase = createServerSupabaseClient();

  if (date) {
    if (!isValidDate(date)) {
      return errorResponse("date 형식이 올바르지 않습니다.");
    }

    const { data, error } = await supabase
      .from("reservation_slots")
      .select(
        "id, date, start_time, end_time, capacity, reserved_count, is_active",
      )
      .eq("session_id", sessionId)
      .eq("date", date)
      .order("start_time", { ascending: true });

    if (error) {
      return errorResponse("예약 슬롯을 불러오지 못했습니다.", 500);
    }

    return jsonResponse({
      date,
      slots: (data ?? []).map((slot) => ({
        id: slot.id,
        date: slot.date,
        startTime: slot.start_time,
        endTime: slot.end_time,
        capacity: slot.capacity,
        reservedCount: slot.reserved_count,
        remainingCount: Math.max(slot.capacity - slot.reserved_count, 0),
        isActive: slot.is_active,
      })),
    });
  }

  if (month) {
    if (!isValidMonth(month)) {
      return errorResponse("month 형식이 올바르지 않습니다.");
    }

    const { start, end } = getMonthRange(month);
    const { data, error } = await supabase
      .from("reservation_slots")
      .select("date, capacity, reserved_count, is_active")
      .eq("session_id", sessionId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true });

    if (error) {
      return errorResponse("월별 슬롯 요약을 불러오지 못했습니다.", 500);
    }

    const dayMap = new Map<
      string,
      {
        date: string;
        totalSlots: number;
        availableSlots: number;
        remainingCount: number;
      }
    >();

    for (const slot of data ?? []) {
      const current = dayMap.get(slot.date) ?? {
        date: slot.date,
        totalSlots: 0,
        availableSlots: 0,
        remainingCount: 0,
      };

      current.totalSlots += 1;
      current.remainingCount += Math.max(slot.capacity - slot.reserved_count, 0);

      if (slot.is_active && slot.reserved_count < slot.capacity) {
        current.availableSlots += 1;
      }

      dayMap.set(slot.date, current);
    }

    return jsonResponse({
      month,
      days: Array.from(dayMap.values()),
    });
  }

  return errorResponse("date 또는 month 파라미터가 필요합니다.");
}
