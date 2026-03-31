import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { getSessionById } from "@/lib/session-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SlotBatchPayload = {
  sessionId?: string;
  startDate?: string;
  endDate?: string;
  weekdays?: number[];
  startTime?: string;
  endTime?: string;
  intervalMinutes?: number;
  capacity?: number;
};

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:00`;
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(getAdminKey(request.headers))) {
    return errorResponse("접근 권한이 없습니다.", 401);
  }

  const body = (await request.json()) as SlotBatchPayload;

  if (
    !body.sessionId ||
    !body.startDate ||
    !body.endDate ||
    !body.startTime ||
    !body.endTime
  ) {
    return errorResponse("세션, 날짜 범위, 시간 범위를 모두 입력해주세요.");
  }

  if (body.weekdays && body.weekdays.length === 0) {
    return errorResponse("요일을 하나 이상 선택해주세요.");
  }

  const weekdays = body.weekdays?.length ? body.weekdays : [1, 2, 3, 4, 5];
  const intervalMinutes = body.intervalMinutes ?? 60;
  const capacity = body.capacity ?? 20;

  if (intervalMinutes <= 0 || capacity <= 0) {
    return errorResponse("간격과 정원은 1 이상이어야 합니다.");
  }

  const startMinutes = timeToMinutes(body.startTime);
  const endMinutes = timeToMinutes(body.endTime);

  if (endMinutes <= startMinutes) {
    return errorResponse("종료 시간은 시작 시간보다 늦어야 합니다.");
  }

  const sessionStart = parseDateKey(body.startDate);
  const sessionEnd = parseDateKey(body.endDate);

  if (sessionEnd < sessionStart) {
    return errorResponse("종료 날짜는 시작 날짜보다 빠를 수 없습니다.");
  }

  const session = await getSessionById(body.sessionId);

  if (!session) {
    return errorResponse("세션을 찾을 수 없습니다.", 404);
  }

  if (session.status !== "active") {
    return errorResponse("운영 중인 세션에서만 예약 슬롯을 생성할 수 있습니다.", 409);
  }

  const rows: {
    session_id: string;
    date: string;
    start_time: string;
    end_time: string;
    capacity: number;
    reserved_count: number;
    is_active: boolean;
  }[] = [];

  for (
    let current = new Date(sessionStart);
    current <= sessionEnd;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const dayOfWeek = current.getUTCDay();

    if (!weekdays.includes(dayOfWeek)) {
      continue;
    }

    for (
      let cursor = startMinutes;
      cursor + intervalMinutes <= endMinutes;
      cursor += intervalMinutes
    ) {
      rows.push({
        session_id: body.sessionId,
        date: toDateKey(current),
        start_time: minutesToTime(cursor),
        end_time: minutesToTime(cursor + intervalMinutes),
        capacity,
        reserved_count: 0,
        is_active: true,
      });
    }
  }

  if (!rows.length) {
    return errorResponse("선택한 조건으로 생성할 슬롯이 없습니다.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("reservation_slots")
    .insert(rows)
    .select("id");

  if (error) {
    return errorResponse("슬롯을 생성하지 못했습니다.", 500);
  }

  return jsonResponse(
    {
      createdCount: data?.length ?? 0,
    },
    { status: 201 },
  );
}
