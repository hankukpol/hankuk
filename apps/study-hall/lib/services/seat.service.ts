import { revalidateTag, unstable_cache } from "next/cache";
import { cache } from "react";
import { Prisma } from "@prisma/client/index";

import { badRequest, conflict, notFound } from "@/lib/errors";
import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import {
  readMockState,
  updateMockState,
  type MockSeatRecord,
  type MockStudentRecord,
  type MockStudyRoomRecord,
} from "@/lib/mock-store";
import {
  isPrismaSchemaMismatchError,
  logSchemaCompatibilityFallback,
} from "@/lib/service-helpers";
import {
  buildSeatLabel,
  createDefaultSeatDraftLayout,
  DEFAULT_SEAT_AISLE_COLUMNS,
  DEFAULT_SEAT_LAYOUT_COLUMNS,
  DEFAULT_SEAT_LAYOUT_ROWS,
  getSeatPositionKey,
  isAisleColumn,
  normalizeAisleColumns,
  type SeatDraftLayoutItem,
} from "@/lib/seat-layout";

export type SeatMapStudent = {
  id: string;
  name: string;
  studentNumber: string;
  status: "ACTIVE" | "ON_LEAVE" | "WITHDRAWN" | "GRADUATED";
  studyTrack: string | null;
  studyRoomName: string | null;
  courseEndDate: string | null;
};

export type SeatMapSeat = {
  id: string;
  studyRoomId: string;
  label: string;
  positionX: number;
  positionY: number;
  isActive: boolean;
  assignedStudent: SeatMapStudent | null;
};

export type StudyRoomItem = {
  id: string;
  divisionId: string;
  name: string;
  columns: number;
  rows: number;
  aisleColumns: number[];
  isActive: boolean;
  displayOrder: number;
  seatsCount: number;
  assignedStudentsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SeatLayout = {
  room: StudyRoomItem | null;
  columns: number;
  rows: number;
  aisleColumns: number[];
  seats: SeatMapSeat[];
};

export type StudyRoomInput = {
  name: string;
  columns: number;
  rows: number;
  aisleColumns?: number[];
  isActive?: boolean;
};

export type SeatOptionItem = {
  id: string;
  studyRoomId: string;
  studyRoomName: string;
  label: string;
  isActive: boolean;
  assignedStudentId: string | null;
};

type LegacySeatRow = {
  id: string;
  divisionId: string;
  label: string;
  positionX: number;
  positionY: number;
  isActive: boolean;
  studentId: string | null;
  studentName: string | null;
  studentNumber: string | null;
  studentStatus: SeatMapStudent["status"] | null;
  courseEndDate: string | null;
};

type SeatNormalizationSource = SeatDraftLayoutItem & {
  id?: string;
  assignedStudentId?: string | null;
};

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

function studyRoomsTag(divisionSlug: string) {
  return `study-rooms:${divisionSlug}`;
}

function seatOptionsTag(divisionSlug: string, activeOnly: boolean) {
  return `seat-options:${divisionSlug}:${activeOnly ? "active" : "all"}`;
}

function seatLayoutTag(divisionSlug: string, roomId?: string) {
  return `seat-layout:${divisionSlug}:${roomId ?? "default"}`;
}

function revalidateSeatData(divisionSlug: string, roomId?: string) {
  revalidateTag(studyRoomsTag(divisionSlug));
  revalidateTag(seatOptionsTag(divisionSlug, false));
  revalidateTag(seatOptionsTag(divisionSlug, true));
  revalidateTag(seatLayoutTag(divisionSlug));

  if (roomId) {
    revalidateTag(seatLayoutTag(divisionSlug, roomId));
  }
}

function normalizeText(value: string) {
  return value.trim();
}

function isSeatConflictError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const rawTarget = error.meta?.target;
  const targets = Array.isArray(rawTarget)
    ? rawTarget.map((value) => String(value))
    : rawTarget
      ? [String(rawTarget)]
      : [];

  return targets.some((target) => target.includes("seat"));
}

function toSeatAssignmentError(error: unknown) {
  if (isSeatConflictError(error)) {
    return new Error("이미 다른 학생에게 배정된 좌석입니다. 다른 좌석을 선택해 주세요.");
  }

  return error;
}

function serializeRoom(
  room: {
    id: string;
    divisionId: string;
    name: string;
    columns: number;
    rows: number;
    aisleColumns: unknown;
    isActive: boolean;
    displayOrder: number;
    createdAt: string | Date;
    updatedAt: string | Date;
  },
  seatsCount: number,
  assignedStudentsCount: number,
) {
  return {
    id: room.id,
    divisionId: room.divisionId,
    name: room.name,
    columns: room.columns,
    rows: room.rows,
    aisleColumns: normalizeAisleColumns(room.aisleColumns, room.columns),
    isActive: room.isActive,
    displayOrder: room.displayOrder,
    seatsCount,
    assignedStudentsCount,
    createdAt: typeof room.createdAt === "string" ? room.createdAt : room.createdAt.toISOString(),
    updatedAt: typeof room.updatedAt === "string" ? room.updatedAt : room.updatedAt.toISOString(),
  } satisfies StudyRoomItem;
}

function sortRooms<T extends { displayOrder: number; name: string }>(rooms: T[]) {
  return [...rooms].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "ko"),
  );
}

function sortSeats<T extends { positionY: number; positionX: number; label: string }>(seats: T[]) {
  return [...seats].sort(
    (left, right) =>
      left.positionY - right.positionY ||
      left.positionX - right.positionX ||
      left.label.localeCompare(right.label, "ko"),
  );
}

function createEmptyLayout(room: StudyRoomItem | null): SeatLayout {
  return {
    room,
    columns: room?.columns ?? DEFAULT_SEAT_LAYOUT_COLUMNS,
    rows: room?.rows ?? DEFAULT_SEAT_LAYOUT_ROWS,
    aisleColumns: room?.aisleColumns ?? [...DEFAULT_SEAT_AISLE_COLUMNS],
    seats: [],
  };
}

async function readLegacySeatRows(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionId: string,
): Promise<LegacySeatRow[]> {
  return prisma.$queryRaw<LegacySeatRow[]>`
    SELECT
      seat.id,
      seat.division_id AS "divisionId",
      seat.label,
      seat.position_x AS "positionX",
      seat.position_y AS "positionY",
      seat.is_active AS "isActive",
      student.id AS "studentId",
      student.name AS "studentName",
      student.student_number AS "studentNumber",
      student.status::text AS "studentStatus",
      to_char(student.course_end_date, 'YYYY-MM-DD') AS "courseEndDate"
    FROM seats seat
    LEFT JOIN students student
      ON student.seat_id = seat.id
    WHERE seat.division_id = ${divisionId}
    ORDER BY seat.position_y ASC, seat.position_x ASC
  `;
}

function buildLegacyStudyRoom(divisionId: string, seatRows: LegacySeatRow[]): StudyRoomItem {
  const maxColumn = seatRows.reduce((current, seat) => Math.max(current, seat.positionX), 0);
  const maxRow = seatRows.reduce((current, seat) => Math.max(current, seat.positionY), 0);
  const now = new Date().toISOString();

  return {
    id: `legacy-study-room-${divisionId}`,
    divisionId,
    name: "기본 자습실",
    columns: Math.max(DEFAULT_SEAT_LAYOUT_COLUMNS, maxColumn || 0),
    rows: Math.max(DEFAULT_SEAT_LAYOUT_ROWS, maxRow || 0),
    aisleColumns: [...DEFAULT_SEAT_AISLE_COLUMNS],
    isActive: true,
    displayOrder: 0,
    seatsCount: seatRows.length,
    assignedStudentsCount: seatRows.filter((seat) => seat.studentId).length,
    createdAt: now,
    updatedAt: now,
  };
}

function buildLegacySeatOptions(
  room: StudyRoomItem,
  seatRows: LegacySeatRow[],
  activeOnly: boolean,
): SeatOptionItem[] {
  return sortSeats(
    seatRows
      .filter((seat) => !activeOnly || seat.isActive)
      .map((seat) => ({
        id: seat.id,
        studyRoomId: room.id,
        studyRoomName: room.name,
        label: seat.label,
        isActive: seat.isActive,
        assignedStudentId: seat.studentId,
        positionX: seat.positionX,
        positionY: seat.positionY,
      })),
  ).map(({ positionX, positionY, ...seat }) => {
    void positionX;
    void positionY;
    return seat;
  });
}

function buildLegacySeatLayout(room: StudyRoomItem, seatRows: LegacySeatRow[]): SeatLayout {
  return {
    room,
    columns: room.columns,
    rows: room.rows,
    aisleColumns: room.aisleColumns,
    seats: sortSeats(
      seatRows.map((seat) => ({
        id: seat.id,
        studyRoomId: room.id,
        label: seat.label,
        positionX: seat.positionX,
        positionY: seat.positionY,
        isActive: seat.isActive,
        assignedStudent: seat.studentId
          ? {
              id: seat.studentId,
              name: seat.studentName ?? "",
              studentNumber: seat.studentNumber ?? "",
              status: seat.studentStatus ?? "ACTIVE",
              studyTrack: null,
              studyRoomName: room.name,
              courseEndDate: seat.courseEndDate ?? null,
            }
          : null,
      })),
    ),
  };
}

function validateRoomInput(input: StudyRoomInput) {
  const name = normalizeText(input.name);
  const columns = Math.max(3, Math.min(20, Math.trunc(input.columns)));
  const rows = Math.max(2, Math.min(20, Math.trunc(input.rows)));
  const aisleColumns = normalizeAisleColumns(input.aisleColumns, columns);
  const isActive = input.isActive ?? true;

  if (!name) {
    throw badRequest("자습실 이름을 입력해 주세요.");
  }

  return {
    name,
    columns,
    rows,
    aisleColumns,
    isActive,
  };
}

function validateSeatDrafts(seats: SeatDraftLayoutItem[], room: Pick<StudyRoomItem, "columns" | "rows" | "aisleColumns">) {
  const labelSet = new Set<string>();
  const positionSet = new Set<string>();

  for (const seat of seats) {
    const label = seat.label.trim();

    if (!label && seat.isActive) {
      throw badRequest("운영 좌석은 좌석 번호를 입력해 주세요.");
    }

    if (seat.positionX < 1 || seat.positionX > room.columns) {
      throw badRequest("좌석의 열 위치가 자습실 범위를 벗어났습니다.");
    }

    if (seat.positionY < 1 || seat.positionY > room.rows) {
      throw new Error("좌석의 행 위치가 자습실 범위를 벗어났습니다.");
    }

    if (isAisleColumn(seat.positionX, room.aisleColumns)) {
      throw badRequest("복도 칸에는 좌석을 배치할 수 없습니다.");
    }

    if (label && labelSet.has(label)) {
      throw conflict("같은 자습실 안에 동일한 좌석 번호가 있습니다.");
    }

    const positionKey = getSeatPositionKey(seat.positionX, seat.positionY);

    if (positionSet.has(positionKey)) {
      throw conflict("같은 위치에 좌석을 두 번 배치할 수 없습니다.");
    }

    if (label) {
      labelSet.add(label);
    }
    positionSet.add(positionKey);
  }
}

function buildNormalizedGridSeatDrafts(
  room: Pick<StudyRoomItem, "columns" | "rows" | "aisleColumns">,
  seats: SeatNormalizationSource[],
) {
  const seatMap = new Map<string, SeatNormalizationSource>();

  for (const seat of sortSeats(seats)) {
    if (
      seat.positionX < 1 ||
      seat.positionX > room.columns ||
      seat.positionY < 1 ||
      seat.positionY > room.rows ||
      isAisleColumn(seat.positionX, room.aisleColumns)
    ) {
      continue;
    }

    const positionKey = getSeatPositionKey(seat.positionX, seat.positionY);
    if (!seatMap.has(positionKey)) {
      seatMap.set(positionKey, seat);
    }
  }

  const usedLabels = new Set<string>();

  return createDefaultSeatDraftLayout({
    columns: room.columns,
    rows: room.rows,
    aisleColumns: room.aisleColumns,
  }).map((seat) => {
    const positionKey = getSeatPositionKey(seat.positionX, seat.positionY);
    const existingSeat = seatMap.get(positionKey);
    const fallbackLabel = buildSeatLabel(seat.positionX, seat.positionY, usedLabels);
    const existingLabel = existingSeat?.label.trim() ?? "";
    const normalizedLabel = existingLabel || fallbackLabel;
    const label = usedLabels.has(normalizedLabel)
      ? buildSeatLabel(seat.positionX, seat.positionY, usedLabels)
      : normalizedLabel;
    const shouldAutoReactivate = Boolean(
      existingSeat && !existingSeat.isActive && !existingLabel && !existingSeat.assignedStudentId,
    );

    usedLabels.add(label);

    return {
      id: existingSeat?.id,
      label,
      positionX: seat.positionX,
      positionY: seat.positionY,
      isActive: shouldAutoReactivate ? true : existingSeat?.isActive ?? true,
    } satisfies SeatDraftLayoutItem & { id?: string };
  });
}

function hasNormalizedGridDifferences(
  room: Pick<StudyRoomItem, "columns" | "rows" | "aisleColumns">,
  seats: SeatNormalizationSource[],
  normalizedSeats: Array<SeatDraftLayoutItem & { id?: string }>,
) {
  const currentSeatMap = new Map<string, SeatNormalizationSource>();

  for (const seat of seats) {
    if (
      seat.positionX < 1 ||
      seat.positionX > room.columns ||
      seat.positionY < 1 ||
      seat.positionY > room.rows ||
      isAisleColumn(seat.positionX, room.aisleColumns)
    ) {
      continue;
    }

    currentSeatMap.set(getSeatPositionKey(seat.positionX, seat.positionY), seat);
  }

  if (currentSeatMap.size !== normalizedSeats.length) {
    return true;
  }

  return normalizedSeats.some((seat) => {
    const currentSeat = currentSeatMap.get(getSeatPositionKey(seat.positionX, seat.positionY));

    return (
      !currentSeat ||
      currentSeat.label.trim() !== seat.label.trim() ||
      currentSeat.isActive !== seat.isActive
    );
  });
}

async function normalizePersistedRoomSeatsIfNeeded(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionId: string,
  divisionSlug: string,
  room: {
    id: string;
    columns: number;
    rows: number;
    aisleColumns: unknown;
    seats: Array<{
      id: string;
      label: string;
      positionX: number;
      positionY: number;
      isActive: boolean;
      student: { id: string } | null;
    }>;
  },
) {
  const roomLayout = {
    columns: room.columns,
    rows: room.rows,
    aisleColumns: normalizeAisleColumns(room.aisleColumns, room.columns),
  };
  const currentSeats = room.seats.map((seat) => ({
    id: seat.id,
    label: seat.label,
    positionX: seat.positionX,
    positionY: seat.positionY,
    isActive: seat.isActive,
    assignedStudentId: seat.student?.id ?? null,
  }));
  const normalizedSeats = buildNormalizedGridSeatDrafts(roomLayout, currentSeats);

  if (!hasNormalizedGridDifferences(roomLayout, currentSeats, normalizedSeats)) {
    return false;
  }

  await prisma.$transaction(async (tx) => {
    const existingDrafts = normalizedSeats.filter(
      (seat): seat is SeatDraftLayoutItem & { id: string } => Boolean(seat.id),
    );

    for (const seat of existingDrafts) {
      await tx.seat.update({
        where: {
          id: seat.id,
        },
        data: {
          label: `temp-${seat.id}`,
          positionX: seat.positionX,
          positionY: seat.positionY,
          isActive: seat.isActive,
        },
      });
    }

    for (const seat of normalizedSeats.filter((item) => !item.id)) {
      await tx.seat.create({
        data: {
          divisionId,
          studyRoomId: room.id,
          label: seat.label.trim(),
          positionX: seat.positionX,
          positionY: seat.positionY,
          isActive: seat.isActive,
        },
      });
    }

    for (const seat of existingDrafts) {
      await tx.seat.update({
        where: {
          id: seat.id,
        },
        data: {
          label: seat.label.trim(),
          positionX: seat.positionX,
          positionY: seat.positionY,
          isActive: seat.isActive,
        },
      });
    }
  });

  revalidateSeatData(divisionSlug, room.id);
  return true;
}

function buildMockAssignedStudent(
  seat: MockSeatRecord,
  students: MockStudentRecord[],
  rooms: MockStudyRoomRecord[],
) {
  const student =
    students.find((item) => item.seatId === seat.id) ??
    students.find((item) => item.seatLabel === seat.label && item.seatId == null);

  if (!student) {
    return null;
  }

  const room = rooms.find((item) => item.id === seat.studyRoomId);

  return {
    id: student.id,
    name: student.name,
    studentNumber: student.studentNumber,
    status: student.status,
    studyTrack: student.studyTrack,
    studyRoomName: room?.name ?? null,
    courseEndDate: student.courseEndDate ?? null,
  } satisfies SeatMapStudent;
}

function findMockSeatForStudent(seats: MockSeatRecord[], student: MockStudentRecord) {
  if (student.seatId) {
    return seats.find((seat) => seat.id === student.seatId) ?? null;
  }

  if (!student.seatLabel) {
    return null;
  }

  const matches = seats.filter((seat) => seat.label === student.seatLabel);
  return matches.length === 1 ? matches[0] : null;
}

const getDivisionOrThrow = cache(async function getDivisionOrThrow(divisionSlug: string) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: {
      slug: divisionSlug,
    },
  });

  if (!division) {
    throw notFound("지점 정보를 찾을 수 없습니다.");
  }

  return division;
});

async function ensureDefaultStudyRoom(divisionSlug: string, divisionId: string) {
  const prisma = await getPrismaClient();
  const existing = await prisma.studyRoom.findFirst({
    where: {
      divisionId,
    },
    orderBy: [
      {
        displayOrder: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  if (existing) {
    return existing;
  }

  return prisma.studyRoom.create({
    data: {
      divisionId,
      name: "기본 자습실",
      columns: DEFAULT_SEAT_LAYOUT_COLUMNS,
      rows: DEFAULT_SEAT_LAYOUT_ROWS,
      aisleColumns: [...DEFAULT_SEAT_AISLE_COLUMNS],
      isActive: true,
      displayOrder: 0,
    },
  });
}

function findMockRoomOrThrow(rooms: MockStudyRoomRecord[], roomId?: string | null) {
  const room =
    (roomId ? rooms.find((item) => item.id === roomId) : null) ??
    sortRooms(rooms).find((item) => item.isActive) ??
    sortRooms(rooms)[0];

  if (!room) {
    throw notFound("자습실 정보를 찾을 수 없습니다.");
  }

  return room;
}

export async function listStudyRooms(divisionSlug: string): Promise<StudyRoomItem[]> {
  if (isMockMode()) {
    const state = await readMockState();
    const rooms = state.studyRoomsByDivision[divisionSlug] ?? [];
    const seats = state.seatsByDivision[divisionSlug] ?? [];
    const students = state.studentsByDivision[divisionSlug] ?? [];

    return sortRooms(
      rooms.map((room) =>
        serializeRoom(
          room,
          seats.filter((seat) => seat.studyRoomId === room.id).length,
          students.filter((student) => {
            const seat = findMockSeatForStudent(seats, student);
            return seat?.studyRoomId === room.id;
          }).length,
        ),
      ),
    );
  }

  if (process.env.NODE_ENV !== "production") {
    return listStudyRoomsUncached(divisionSlug);
  }

  try {
    return await getListStudyRoomsCached(divisionSlug)();
  } catch (error) {
    if (!isPrismaSchemaMismatchError(error, ["study_rooms", "study_room_id"])) {
      throw error;
    }

    logSchemaCompatibilityFallback("study-rooms:list", error);
    const division = await getDivisionOrThrow(divisionSlug);
    const prisma = await getPrismaClient();
    const seatRows = await readLegacySeatRows(prisma, division.id);
    return [buildLegacyStudyRoom(division.id, seatRows)];
  }
}

export async function listSeatOptions(
  divisionSlug: string,
  options?: { activeOnly?: boolean },
): Promise<SeatOptionItem[]> {
  if (isMockMode()) {
    const state = await readMockState();
    const rooms = state.studyRoomsByDivision[divisionSlug] ?? [];
    const seats = state.seatsByDivision[divisionSlug] ?? [];
    const students = state.studentsByDivision[divisionSlug] ?? [];

    return sortSeats(
      seats.filter((seat) => !options?.activeOnly || seat.isActive).map((seat) => ({
        id: seat.id,
        studyRoomId: seat.studyRoomId,
        studyRoomName: rooms.find((room) => room.id === seat.studyRoomId)?.name ?? "알 수 없는 자습실",
        label: seat.label,
        isActive: seat.isActive,
        assignedStudentId:
          students.find((student) => findMockSeatForStudent(seats, student)?.id === seat.id)?.id ?? null,
        positionX: seat.positionX,
        positionY: seat.positionY,
      })),
    ).map(({ positionX, positionY, ...seat }) => {
      void positionX;
      void positionY;
      return seat;
    });
  }

  const activeOnly = options?.activeOnly ?? false;

  if (process.env.NODE_ENV !== "production") {
    return listSeatOptionsUncached(divisionSlug, activeOnly);
  }

  try {
    return await getListSeatOptionsCached(divisionSlug, activeOnly)();
  } catch (error) {
    if (!isPrismaSchemaMismatchError(error, ["study_rooms", "study_room_id"])) {
      throw error;
    }

    logSchemaCompatibilityFallback("seat-options:list", error);
    const division = await getDivisionOrThrow(divisionSlug);
    const prisma = await getPrismaClient();
    const seatRows = await readLegacySeatRows(prisma, division.id);
    const room = buildLegacyStudyRoom(division.id, seatRows);
    return buildLegacySeatOptions(room, seatRows, activeOnly);
  }
}

export async function getSeatLayout(
  divisionSlug: string,
  roomId?: string,
): Promise<SeatLayout> {
  if (isMockMode()) {
    const state = await readMockState();
    const rooms = state.studyRoomsByDivision[divisionSlug] ?? [];
    const room = findMockRoomOrThrow(rooms, roomId);
    const students = state.studentsByDivision[divisionSlug] ?? [];
    const seats = (state.seatsByDivision[divisionSlug] ?? []).filter((seat) => seat.studyRoomId === room.id);
    const serializedRoom = serializeRoom(
      room,
      seats.length,
      students.filter((student) => {
        const assignedSeat = findMockSeatForStudent(seats, student);
        return assignedSeat?.studyRoomId === room.id;
      }).length,
    );

    return {
      room: serializedRoom,
      columns: serializedRoom.columns,
      rows: serializedRoom.rows,
      aisleColumns: serializedRoom.aisleColumns,
      seats: sortSeats(
        seats.map((seat) => ({
          id: seat.id,
          studyRoomId: seat.studyRoomId,
          label: seat.label,
          positionX: seat.positionX,
          positionY: seat.positionY,
          isActive: seat.isActive,
          assignedStudent: buildMockAssignedStudent(seat, students, rooms),
        })),
      ),
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return getSeatLayoutUncached(divisionSlug, roomId);
  }

  try {
    return await getSeatLayoutCached(divisionSlug, roomId)();
  } catch (error) {
    if (!isPrismaSchemaMismatchError(error, ["study_rooms", "study_room_id"])) {
      throw error;
    }

    logSchemaCompatibilityFallback("seat-layout:get", error);
    const division = await getDivisionOrThrow(divisionSlug);
    const prisma = await getPrismaClient();
    const seatRows = await readLegacySeatRows(prisma, division.id);
    const room = buildLegacyStudyRoom(division.id, seatRows);

    if (roomId && roomId !== room.id) {
      return createEmptyLayout(room);
    }

    return buildLegacySeatLayout(room, seatRows);
  }
}

async function listStudyRoomsUncached(divisionSlug: string): Promise<StudyRoomItem[]> {
  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultStudyRoom(divisionSlug, division.id);
  const prisma = await getPrismaClient();
  const rooms = await prisma.studyRoom.findMany({
    where: {
      divisionId: division.id,
    },
    include: {
      seats: {
        include: {
          student: {
            select: {
              id: true,
            },
          },
        },
      },
    },
    orderBy: [
      {
        displayOrder: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  return rooms.map((room) =>
    serializeRoom(
      room,
      room.seats.length,
      room.seats.reduce((sum, seat) => sum + (seat.student ? 1 : 0), 0),
    ),
  );
}

function getListStudyRoomsCached(divisionSlug: string) {
  return unstable_cache(() => listStudyRoomsUncached(divisionSlug), ["study-rooms", divisionSlug], {
    revalidate: 300,
    tags: [studyRoomsTag(divisionSlug)],
  });
}

async function listSeatOptionsUncached(
  divisionSlug: string,
  activeOnly: boolean,
): Promise<SeatOptionItem[]> {
  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultStudyRoom(divisionSlug, division.id);
  const prisma = await getPrismaClient();
  const seats = await prisma.seat.findMany({
    where: {
      divisionId: division.id,
      ...(activeOnly ? { isActive: true } : {}),
    },
    include: {
      studyRoom: {
        select: {
          id: true,
          name: true,
        },
      },
      student: {
        select: {
          id: true,
        },
      },
    },
    orderBy: [
      {
        studyRoom: {
          displayOrder: "asc",
        },
      },
      {
        positionY: "asc",
      },
      {
        positionX: "asc",
      },
    ],
  });

  return seats.map((seat) => ({
    id: seat.id,
    studyRoomId: seat.studyRoom.id,
    studyRoomName: seat.studyRoom.name,
    label: seat.label,
    isActive: seat.isActive,
    assignedStudentId: seat.student?.id ?? null,
  }));
}

function getListSeatOptionsCached(divisionSlug: string, activeOnly: boolean) {
  return unstable_cache(
    () => listSeatOptionsUncached(divisionSlug, activeOnly),
    ["seat-options", divisionSlug, activeOnly ? "active" : "all"],
    {
      revalidate: 300,
      tags: [seatOptionsTag(divisionSlug, activeOnly)],
    },
  );
}

async function getSeatLayoutUncached(divisionSlug: string, roomId?: string): Promise<SeatLayout> {
  const division = await getDivisionOrThrow(divisionSlug);
  const defaultRoom = await ensureDefaultStudyRoom(divisionSlug, division.id);
  const prisma = await getPrismaClient();
  const room = await prisma.studyRoom.findFirst({
    where: {
      divisionId: division.id,
      ...(roomId ? { id: roomId } : {}),
    },
    include: {
      seats: {
        include: {
          student: {
            select: {
              id: true,
              name: true,
              studentNumber: true,
              status: true,
              studyTrack: true,
              courseEndDate: true,
            },
          },
        },
        orderBy: [
          {
            positionY: "asc",
          },
          {
            positionX: "asc",
          },
        ],
      },
    },
    orderBy: [
      {
        displayOrder: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  const targetRoom = room ?? defaultRoom;

  if (!room) {
    const defaultLayout = serializeRoom(targetRoom, 0, 0);
    return createEmptyLayout(defaultLayout);
  }

  const didNormalizeSeats = await normalizePersistedRoomSeatsIfNeeded(
    prisma,
    division.id,
    divisionSlug,
    room,
  );
  const effectiveRoom = didNormalizeSeats
    ? await prisma.studyRoom.findUnique({
        where: {
          id: room.id,
        },
        include: {
          seats: {
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  studentNumber: true,
                  status: true,
                  studyTrack: true,
                  courseEndDate: true,
                },
              },
            },
            orderBy: [
              {
                positionY: "asc",
              },
              {
                positionX: "asc",
              },
            ],
          },
        },
      })
    : room;

  if (!effectiveRoom) {
    const defaultLayout = serializeRoom(targetRoom, 0, 0);
    return createEmptyLayout(defaultLayout);
  }

  const serializedRoom = serializeRoom(
    effectiveRoom,
    effectiveRoom.seats.length,
    effectiveRoom.seats.reduce((sum, seat) => sum + (seat.student ? 1 : 0), 0),
  );

  return {
    room: serializedRoom,
    columns: serializedRoom.columns,
    rows: serializedRoom.rows,
    aisleColumns: serializedRoom.aisleColumns,
    seats: sortSeats(
      effectiveRoom.seats.map((seat) => ({
        id: seat.id,
        studyRoomId: seat.studyRoomId,
        label: seat.label,
        positionX: seat.positionX,
        positionY: seat.positionY,
        isActive: seat.isActive,
        assignedStudent: seat.student
          ? {
              id: seat.student.id,
              name: seat.student.name,
              studentNumber: seat.student.studentNumber,
              status: seat.student.status,
              studyTrack: seat.student.studyTrack,
              studyRoomName: effectiveRoom.name,
              courseEndDate: seat.student.courseEndDate
                ? seat.student.courseEndDate.toISOString().slice(0, 10)
                : null,
            }
          : null,
      })),
    ),
  };
}

function getSeatLayoutCached(divisionSlug: string, roomId?: string) {
  return unstable_cache(
    () => getSeatLayoutUncached(divisionSlug, roomId),
    ["seat-layout", divisionSlug, roomId ?? "default"],
    {
      revalidate: 300,
      tags: [seatLayoutTag(divisionSlug), seatLayoutTag(divisionSlug, roomId)],
    },
  );
}

export async function createStudyRoom(divisionSlug: string, input: StudyRoomInput) {
  const normalized = validateRoomInput(input);

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const division = getMockDivisionBySlug(divisionSlug);
      if (!division) {
        throw new Error("지점 정보를 찾을 수 없습니다.");
      }
      const current = state.studyRoomsByDivision[divisionSlug] ?? [];
      if (current.some((room) => room.name === normalized.name)) {
        throw conflict("이미 같은 이름의 자습실이 있습니다.");
      }
      const now = new Date().toISOString();
      const room: MockStudyRoomRecord = {
        id: "mock-study-room-" + divisionSlug + "-" + Date.now(),
        divisionId: division.id,
        name: normalized.name,
        columns: normalized.columns,
        rows: normalized.rows,
        aisleColumns: normalized.aisleColumns,
        isActive: normalized.isActive,
        displayOrder: current.length,
        createdAt: now,
        updatedAt: now,
      };
      state.studyRoomsByDivision[divisionSlug] = [...current, room];
      return serializeRoom(room, 0, 0);
    });
  }

  const division = await getDivisionOrThrow(divisionSlug);
  await ensureDefaultStudyRoom(divisionSlug, division.id);
  const prisma = await getPrismaClient();
  const duplicate = await prisma.studyRoom.findFirst({
    where: {
      divisionId: division.id,
      name: normalized.name,
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error("이미 같은 이름의 자습실이 있습니다.");
  }

  const displayOrder = await prisma.studyRoom.count({
    where: {
      divisionId: division.id,
    },
  });

  const room = await prisma.studyRoom.create({
    data: {
      divisionId: division.id,
      name: normalized.name,
      columns: normalized.columns,
      rows: normalized.rows,
      aisleColumns: normalized.aisleColumns,
      isActive: normalized.isActive,
      displayOrder,
    },
  });

  const serializedRoom = serializeRoom(room, 0, 0);
  revalidateSeatData(divisionSlug, room.id);
  return serializedRoom;
}
export async function updateStudyRoom(
  divisionSlug: string,
  roomId: string,
  input: StudyRoomInput,
) {
  const normalized = validateRoomInput(input);

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const rooms = state.studyRoomsByDivision[divisionSlug] ?? [];
      const room = rooms.find((item) => item.id === roomId);
      if (!room) {
        throw new Error("자습실 정보를 찾을 수 없습니다.");
      }
      if (rooms.some((item) => item.id !== roomId && item.name === normalized.name)) {
        throw new Error("이미 같은 이름의 자습실이 있습니다.");
      }
      const roomSeats = (state.seatsByDivision[divisionSlug] ?? []).filter((seat) => seat.studyRoomId === roomId);
      validateSeatDrafts(
        roomSeats.map((seat) => ({
          id: seat.id,
          label: seat.label,
          positionX: seat.positionX,
          positionY: seat.positionY,
          isActive: seat.isActive,
        })),
        normalized,
      );
      const now = new Date().toISOString();
      state.studyRoomsByDivision[divisionSlug] = rooms.map((item) =>
        item.id === roomId
          ? {
              ...item,
              ...normalized,
              updatedAt: now,
            }
          : item,
      );
      const updated = state.studyRoomsByDivision[divisionSlug].find((item) => item.id === roomId)!;
      return serializeRoom(
        updated,
        roomSeats.length,
        (state.studentsByDivision[divisionSlug] ?? []).filter((student) => {
          const assignedSeat = findMockSeatForStudent(roomSeats, student);
          return Boolean(assignedSeat);
        }).length,
      );
    });
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const room = await prisma.studyRoom.findFirst({
    where: {
      id: roomId,
      divisionId: division.id,
    },
    include: {
      seats: {
        select: {
          id: true,
          label: true,
          positionX: true,
          positionY: true,
          isActive: true,
        },
      },
    },
  });

  if (!room) {
    throw new Error("자습실 정보를 찾을 수 없습니다.");
  }

  const duplicate = await prisma.studyRoom.findFirst({
    where: {
      divisionId: division.id,
      name: normalized.name,
      id: {
        not: roomId,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error("이미 같은 이름의 자습실이 있습니다.");
  }

  validateSeatDrafts(room.seats, normalized);

  const updated = await prisma.studyRoom.update({
    where: {
      id: roomId,
    },
    data: normalized,
    include: {
      seats: {
        include: {
          student: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  const serializedRoom = serializeRoom(
    updated,
    updated.seats.length,
    updated.seats.reduce((sum, seat) => sum + (seat.student ? 1 : 0), 0),
  );
  revalidateSeatData(divisionSlug, roomId);
  return serializedRoom;
}
export async function deleteStudyRoom(divisionSlug: string, roomId: string) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const rooms = state.studyRoomsByDivision[divisionSlug] ?? [];
      const room = rooms.find((item) => item.id === roomId);
      if (!room) {
        throw new Error("자습실 정보를 찾을 수 없습니다.");
      }
      if (rooms.length <= 1) {
        throw badRequest("자습실은 1개 이상 유지해야 합니다.");
      }
      const roomSeats = (state.seatsByDivision[divisionSlug] ?? []).filter((seat) => seat.studyRoomId === roomId);
      const removedSeatIds = new Set(roomSeats.map((seat) => seat.id));
      state.studyRoomsByDivision[divisionSlug] = rooms.filter((item) => item.id !== roomId);
      state.seatsByDivision[divisionSlug] = (state.seatsByDivision[divisionSlug] ?? []).filter(
        (seat) => seat.studyRoomId !== roomId,
      );
      state.studentsByDivision[divisionSlug] = (state.studentsByDivision[divisionSlug] ?? []).map((student) => {
        const assignedSeat = findMockSeatForStudent(roomSeats, student);
        if (assignedSeat && removedSeatIds.has(assignedSeat.id)) {
          return {
            ...student,
            seatId: null,
            seatLabel: null,
          };
        }
        return student;
      });
      return { id: roomId };
    });
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const rooms = await prisma.studyRoom.findMany({
    where: {
      divisionId: division.id,
    },
    select: {
      id: true,
    },
  });

  if (!rooms.some((room) => room.id === roomId)) {
    throw new Error("자습실 정보를 찾을 수 없습니다.");
  }

  if (rooms.length <= 1) {
    throw new Error("자습실은 1개 이상 유지해야 합니다.");
  }

  // 이 자습실 좌석에 배정된 학생이 있으면 삭제 차단
  const assignedStudentCount = await prisma.student.count({
    where: {
      seat: { studyRoomId: roomId },
    },
  });
  if (assignedStudentCount > 0) {
    throw new Error(
      `이 자습실에 배정된 학생이 ${assignedStudentCount}명 있습니다. 먼저 학생들의 좌석을 해제하거나 다른 자습실로 이동한 후 삭제해주세요.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.seat.deleteMany({
      where: {
        divisionId: division.id,
        studyRoomId: roomId,
      },
    });

    await tx.studyRoom.delete({
      where: {
        id: roomId,
      },
    });
  });

  revalidateSeatData(divisionSlug, roomId);
  return { id: roomId };
}
export async function saveSeatLayout(
  divisionSlug: string,
  roomId: string,
  seats: SeatDraftLayoutItem[],
) {
  const rooms = await listStudyRooms(divisionSlug);
  const room = rooms.find((item) => item.id === roomId);

  if (!room) {
    throw new Error("자습실 정보를 찾을 수 없습니다.");
  }

  validateSeatDrafts(seats, room);

  // 비활성 좌석에 빈 label이면 빈 문자열로 정규화 (partial unique index가 빈 문자열 제외)
  for (const seat of seats) {
    if (!seat.label.trim() && !seat.isActive) {
      seat.label = "";
    }
  }

  if (isMockMode()) {
    await updateMockState(async (state) => {
      const currentSeats = (state.seatsByDivision[divisionSlug] ?? []).filter((seat) => seat.studyRoomId === roomId);
      const otherSeats = (state.seatsByDivision[divisionSlug] ?? []).filter((seat) => seat.studyRoomId !== roomId);
      const now = new Date().toISOString();
      const nextRoomSeats = sortSeats(
        seats.map((seat, index) => {
          const existing = currentSeats.find((item) => item.id === seat.id);
          return {
            id: existing?.id ?? "mock-seat-" + divisionSlug + "-" + roomId + "-" + Date.now() + "-" + index,
            divisionId: room.divisionId,
            studyRoomId: roomId,
            label: seat.label.trim(),
            positionX: seat.positionX,
            positionY: seat.positionY,
            isActive: seat.isActive,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          } satisfies MockSeatRecord;
        }),
      );
      const nextSeatIds = new Set(nextRoomSeats.map((seat) => seat.id));
      const students = state.studentsByDivision[divisionSlug] ?? [];
      state.studentsByDivision[divisionSlug] = students.map((student) => {
        if (student.seatId && currentSeats.some((seat) => seat.id === student.seatId)) {
          const nextSeat = nextRoomSeats.find((seat) => seat.id === student.seatId) ?? null;
          if (!nextSeat) {
            return {
              ...student,
              seatId: null,
              seatLabel: null,
              updatedAt: now,
            };
          }
          return {
            ...student,
            seatId: nextSeatIds.has(nextSeat.id) ? nextSeat.id : null,
            seatLabel: nextSeat.label,
            updatedAt: now,
          };
        }
        return student;
      });
      state.seatsByDivision[divisionSlug] = [...otherSeats, ...nextRoomSeats];
    });
    return getSeatLayout(divisionSlug, roomId);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const existingSeats = await prisma.seat.findMany({
    where: {
      divisionId: division.id,
      studyRoomId: roomId,
    },
    select: {
      id: true,
      label: true,
    },
  });

  for (const seat of seats) {
    if (seat.id && !existingSeats.some((item) => item.id === seat.id)) {
      throw notFound("좌석 정보를 찾을 수 없습니다.");
    }
  }

  const incomingIds = new Set(seats.filter((seat) => seat.id).map((seat) => seat.id as string));
  const removedIds = existingSeats.filter((seat) => !incomingIds.has(seat.id)).map((seat) => seat.id);

  await prisma.$transaction(async (tx) => {
    if (removedIds.length > 0) {
      // 학생이 배정된 좌석은 삭제 차단
      const assignedCount = await tx.student.count({
        where: { seatId: { in: removedIds } },
      });
      if (assignedCount > 0) {
        throw new Error(
          `삭제하려는 좌석 중 ${assignedCount}개에 학생이 배정되어 있습니다. 먼저 학생의 좌석을 해제한 후 다시 시도해주세요.`,
        );
      }

      await tx.seat.deleteMany({
        where: {
          id: {
            in: removedIds,
          },
        },
      });
    }

    const existingDrafts = seats.filter((seat) => seat.id);

    for (const seat of existingDrafts) {
      await tx.seat.update({
        where: {
          id: seat.id,
        },
        data: {
          label: "temp-" + seat.id,
          positionX: seat.positionX,
          positionY: seat.positionY,
          isActive: seat.isActive,
        },
      });
    }

    for (const seat of seats.filter((item) => !item.id)) {
      await tx.seat.create({
        data: {
          divisionId: division.id,
          studyRoomId: roomId,
          label: seat.label.trim(),
          positionX: seat.positionX,
          positionY: seat.positionY,
          isActive: seat.isActive,
        },
      });
    }

    for (const seat of existingDrafts) {
      await tx.seat.update({
        where: {
          id: seat.id,
        },
        data: {
          label: seat.label.trim(),
          positionX: seat.positionX,
          positionY: seat.positionY,
          isActive: seat.isActive,
        },
      });
    }
  });

  revalidateSeatData(divisionSlug, roomId);
  return getSeatLayout(divisionSlug, roomId);
}
export async function assignStudentToSeat(
  divisionSlug: string,
  seatId: string,
  studentId: string | null,
) {
  if (isMockMode()) {
    const roomId = await updateMockState(async (state) => {
      const seats = state.seatsByDivision[divisionSlug] ?? [];
      const seat = seats.find((item) => item.id === seatId);
      if (!seat) {
        throw notFound("좌석 정보를 찾을 수 없습니다.");
      }
      if (!seat.isActive) {
        throw badRequest("비활성 좌석은 배정할 수 없습니다.");
      }
      const now = new Date().toISOString();
      const students = state.studentsByDivision[divisionSlug] ?? [];
      if (studentId) {
        const targetStudent = students.find((student) => student.id === studentId);
        if (!targetStudent) {
          throw notFound("학생 정보를 찾을 수 없습니다.");
        }
        if (!["ACTIVE", "ON_LEAVE"].includes(targetStudent.status)) {
          throw badRequest("재원 또는 휴가 상태 학생만 좌석을 배정할 수 없습니다.");
        }
        const occupiedByOtherStudent = students.find((student) => {
          if (student.id === studentId) {
            return false;
          }
          return student.seatId === seat.id || (student.seatId == null && student.seatLabel === seat.label);
        });
        if (occupiedByOtherStudent) {
          throw conflict("이미 다른 학생에게 배정된 좌석입니다. 다른 좌석을 선택해 주세요.");
        }
      }
      state.studentsByDivision[divisionSlug] = students.map((student) => {
        if (studentId && student.id === studentId) {
          return {
            ...student,
            seatId: seat.id,
            seatLabel: seat.label,
            updatedAt: now,
          };
        }
        if (
          !studentId &&
          (student.seatId === seat.id || (student.seatId == null && student.seatLabel === seat.label))
        ) {
          return {
            ...student,
            seatId: null,
            seatLabel: null,
            updatedAt: now,
          };
        }
        return student;
      });
      return seat.studyRoomId;
    });
    return getSeatLayout(divisionSlug, roomId);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const seat = await prisma.seat.findFirst({
    where: {
      id: seatId,
      divisionId: division.id,
    },
    select: {
      id: true,
      isActive: true,
      studyRoomId: true,
    },
  });

  if (!seat) {
    throw new Error("좌석 정보를 찾을 수 없습니다.");
  }

  if (!seat.isActive) {
    throw new Error("비활성 좌석은 배정할 수 없습니다.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (studentId) {
        const targetStudent = await tx.student.findFirst({
          where: {
            id: studentId,
            divisionId: division.id,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (!targetStudent) {
          throw new Error("학생 정보를 찾을 수 없습니다.");
        }

        if (!["ACTIVE", "ON_LEAVE"].includes(targetStudent.status)) {
          throw new Error("재원 또는 휴가 상태 학생만 좌석을 배정할 수 없습니다.");
        }

        await tx.student.update({
          where: {
            id: studentId,
          },
          data: {
            seatId,
          },
        });
      } else {
        await tx.student.updateMany({
          where: {
            seatId,
          },
          data: {
            seatId: null,
          },
        });
      }
    });
  } catch (error) {
    throw toSeatAssignmentError(error);
  }

  revalidateSeatData(divisionSlug, seat.studyRoomId);
  return getSeatLayout(divisionSlug, seat.studyRoomId);
}
