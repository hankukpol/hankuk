import { getAdminKey, isAdminAuthorized } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SessionRow = {
  id: string;
  name: string;
  track: "police" | "fire";
  status: "active" | "archived";
  interview_date: string | null;
};

type StudentRow = {
  id: string;
  region: string | null;
  series: string | null;
};

type WaitingRow = {
  id: string;
};

type RoomRow = {
  id: string;
  room_name: string | null;
  status: "recruiting" | "formed" | "closed";
  max_members: number;
  request_extra_members: number;
};

type RoomMemberRow = {
  room_id: string;
};

type ReservationRow = {
  id: string;
  status: "확정" | "취소";
};

type SlotRow = {
  id: string;
  capacity: number;
  reserved_count: number;
  is_active: boolean;
};

function groupCount<T>(items: T[], pick: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = pick(item)?.trim() || "미입력";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ko-KR"));
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
    .select("id, name, track, status, interview_date")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !sessionData) {
    return errorResponse("세션 정보를 찾을 수 없습니다.", 404);
  }

  const [
    { count: registeredCount, error: registeredError },
    { data: studentsData, error: studentsError },
    { data: waitingData, error: waitingError },
    { data: roomsData, error: roomsError },
    { data: reservationsData, error: reservationsError },
    { data: slotsData, error: slotsError },
  ] = await Promise.all([
    supabase
      .from("registered_students")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
    supabase
      .from("students")
      .select("id, region, series")
      .eq("session_id", sessionId),
    supabase
      .from("waiting_pool")
      .select("id")
      .eq("session_id", sessionId)
      .is("assigned_room_id", null),
    supabase
      .from("group_rooms")
      .select("id, room_name, status, max_members, request_extra_members")
      .eq("session_id", sessionId),
    supabase
      .from("reservations")
      .select("id, status")
      .eq("session_id", sessionId),
    supabase
      .from("reservation_slots")
      .select("id, capacity, reserved_count, is_active")
      .eq("session_id", sessionId),
  ]);

  if (
    registeredError ||
    studentsError ||
    waitingError ||
    roomsError ||
    reservationsError ||
    slotsError
  ) {
    return errorResponse("통계 데이터를 불러오지 못했습니다.", 500);
  }

  const students = (studentsData ?? []) as StudentRow[];
  const waitingStudents = (waitingData ?? []) as WaitingRow[];
  const rooms = (roomsData ?? []) as RoomRow[];
  const reservations = (reservationsData ?? []) as ReservationRow[];
  const slots = (slotsData ?? []) as SlotRow[];
  const roomIds = rooms.map((room) => room.id);

  let joinedMembers: RoomMemberRow[] = [];

  if (roomIds.length > 0) {
    const { data: joinedMembersData, error: joinedMembersError } = await supabase
      .from("room_members")
      .select("room_id")
      .in("room_id", roomIds)
      .eq("status", "joined");

    if (joinedMembersError) {
      return errorResponse("방 인원 통계를 불러오지 못했습니다.", 500);
    }

    joinedMembers = (joinedMembersData ?? []) as RoomMemberRow[];
  }

  const roomMemberCountMap = new Map<string, number>();

  for (const member of joinedMembers) {
    roomMemberCountMap.set(
      member.room_id,
      (roomMemberCountMap.get(member.room_id) ?? 0) + 1,
    );
  }

  const confirmedReservationCount = reservations.filter(
    (reservation) => reservation.status === "확정",
  ).length;
  const cancelledReservationCount = reservations.filter(
    (reservation) => reservation.status === "취소",
  ).length;

  const slotCapacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const slotReservedCount = slots.reduce(
    (sum, slot) => sum + slot.reserved_count,
    0,
  );
  const activeSlotCount = slots.filter((slot) => slot.is_active).length;
  const totalJoinedMembers = Array.from(roomMemberCountMap.values()).reduce(
    (sum, count) => sum + count,
    0,
  );

  const roomStatusMap = {
    recruiting: "모집 중",
    formed: "편성 완료",
    closed: "종료",
  } as const;

  return jsonResponse({
    session: sessionData as SessionRow,
    overview: {
      registeredCount: registeredCount ?? 0,
      applicantCount: students.length,
      waitingCount: waitingStudents.length,
      roomCount: rooms.length,
      confirmedReservationCount,
      cancelledReservationCount,
      slotCount: slots.length,
      activeSlotCount,
      slotCapacity,
      slotReservedCount,
      totalJoinedMembers,
      averageRoomSize:
        rooms.length > 0 ? Number((totalJoinedMembers / rooms.length).toFixed(1)) : 0,
      extraRequestRoomCount: rooms.filter((room) => room.request_extra_members > 0)
        .length,
    },
    roomStatus: [
      {
        label: roomStatusMap.recruiting,
        key: "recruiting",
        count: rooms.filter((room) => room.status === "recruiting").length,
      },
      {
        label: roomStatusMap.formed,
        key: "formed",
        count: rooms.filter((room) => room.status === "formed").length,
      },
      {
        label: roomStatusMap.closed,
        key: "closed",
        count: rooms.filter((room) => room.status === "closed").length,
      },
    ],
    regionDistribution: groupCount(students, (student) => student.region).slice(0, 6),
    seriesDistribution: groupCount(students, (student) => student.series).slice(0, 6),
    roomOccupancy: rooms
      .map((room) => {
        const memberCount = roomMemberCountMap.get(room.id) ?? 0;
        return {
          roomId: room.id,
          roomName: room.room_name ?? "이름 없는 조 방",
          status: room.status,
          memberCount,
          maxMembers: room.max_members,
          occupancyRate:
            room.max_members > 0
              ? Math.round((memberCount / room.max_members) * 100)
              : 0,
          requestExtraMembers: room.request_extra_members,
        };
      })
      .sort(
        (left, right) =>
          right.occupancyRate - left.occupancyRate ||
          right.memberCount - left.memberCount,
      )
      .slice(0, 8),
  });
}
