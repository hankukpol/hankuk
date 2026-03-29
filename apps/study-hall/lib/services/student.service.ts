import { cache } from "react";

import { Prisma } from "@prisma/client/index";

import { normalizeYmdDate, parseUtcDateFromYmd } from "@/lib/date-utils";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState, type MockStudentRecord } from "@/lib/mock-store";
import {
  getPrismaClient,
  isPrismaSchemaMismatchError,
  logSchemaCompatibilityFallback,
  normalizeOptionalText,
} from "@/lib/service-helpers";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { getWarningStage, type StudentStatusValue, type WarningStageValue } from "@/lib/student-meta";

export type DivisionStudent = {
  id: string;
  divisionId: string;
  name: string;
  studentNumber: string;
  studyTrack: string | null;
  phone: string | null;
  seatId: string | null;
  seatLabel: string | null;
  seatDisplay: string | null;
  studyRoomId: string | null;
  studyRoomName: string | null;
  courseStartDate: string | null;
  courseEndDate: string | null;
  tuitionPlanId: string | null;
  tuitionPlanName: string | null;
  tuitionAmount: number | null;
  status: StudentStatusValue;
};

export type StudentListItem = DivisionStudent & {
  enrolledAt: string;
  createdAt: string;
  updatedAt: string;
  withdrawnAt: string | null;
  withdrawnNote: string | null;
  memo: string | null;
  netPoints: number;
  warningStage: WarningStageValue;
};

export type StudentDetail = StudentListItem;

export type StudentUpsertInput = {
  name: string;
  studentNumber: string;
  studyTrack?: string | null;
  phone?: string | null;
  seatId?: string | null;
  courseStartDate?: string | null;
  courseEndDate?: string | null;
  tuitionPlanId?: string | null;
  tuitionAmount?: number | null;
  status?: StudentStatusValue;
  memo?: string | null;
};

export type StudentWithdrawInput = {
  withdrawnNote: string;
};

export type StudentSessionRecord = {
  studentId: string;
  divisionId: string;
  divisionSlug: string;
  studentNumber: string;
  name: string;
};

type DbStudentRecord = {
  id: string;
  divisionId: string;
  name: string;
  studentNumber: string;
  studyTrack: string | null;
  phone: string | null;
  status: StudentStatusValue;
  enrolledAt: Date;
  createdAt: Date;
  updatedAt: Date;
  withdrawnAt: Date | null;
  withdrawnNote: string | null;
  memo: string | null;
  seat: {
    id: string;
    label: string;
    studyRoom: {
      id: string;
      name: string;
    };
  } | null;
  courseStartDate: Date | null;
  courseEndDate: Date | null;
  tuitionAmount: number | null;
  tuitionPlanId: string | null;
  tuitionPlan: {
    id: string;
    name: string;
  } | null;
};

type LegacyStudentRow = {
  id: string;
  divisionId: string;
  name: string;
  studentNumber: string;
  phone: string | null;
  status: StudentStatusValue;
  enrolledAt: Date;
  createdAt: Date;
  updatedAt: Date;
  withdrawnAt: Date | null;
  withdrawnNote: string | null;
  memo: string | null;
  seatId: string | null;
  seatLabel: string | null;
};

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOptionalDate(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return normalizeYmdDate(trimmed, "수강 기간");
}

function ensureCourseStartDate(value: string | null, fallbackIsoDate: string) {
  return value ?? fallbackIsoDate.slice(0, 10);
}

function isPrismaUniqueConstraintError(error: unknown, target: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const rawTarget = error.meta?.target;
  const values = Array.isArray(rawTarget)
    ? rawTarget.map((value) => String(value))
    : rawTarget
      ? [String(rawTarget)]
      : [];

  return values.some((value) => value.includes(target));
}

function toStudentWriteError(error: unknown) {
  if (
    isPrismaSchemaMismatchError(error, [
      "students",
      "study_track",
      "course_start_date",
      "course_end_date",
      "tuition_plan_id",
      "tuition_amount",
    ])
  ) {
    return badRequest("학생 관련 데이터베이스 변경이 아직 반영되지 않았습니다. DB 마이그레이션 상태를 확인해 주세요.");
  }

  if (isPrismaUniqueConstraintError(error, "seat")) {
    return conflict("이미 다른 학생에게 배정된 좌석입니다. 다른 좌석을 선택해 주세요.");
  }

  if (isPrismaUniqueConstraintError(error, "student_number") || isPrismaUniqueConstraintError(error, "studentNumber")) {
    return conflict("이미 사용 중인 수험번호입니다.");
  }

  return error;
}

function parseDateString(value: string) {
  return parseUtcDateFromYmd(value, "수강 기간");
}

function compareDateStrings(left: string, right: string) {
  return parseDateString(left).getTime() - parseDateString(right).getTime();
}

function toDateString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function validateCourseRange(startDate: string | null, endDate: string | null) {
  if (startDate && endDate && compareDateStrings(startDate, endDate) > 0) {
    throw badRequest("수강 시작일은 종료일보다 늦을 수 없습니다.");
  }
}

function sortBySeatAndName<T extends { seatDisplay: string | null; studyRoomName: string | null; seatLabel: string | null; name: string; studentNumber: string }>(students: T[]) {
  return [...students].sort((left, right) => {
    const hasLeftSeat = left.seatLabel != null;
    const hasRightSeat = right.seatLabel != null;
    // 좌석 없는 학생은 맨 뒤로
    if (hasLeftSeat !== hasRightSeat) return hasLeftSeat ? -1 : 1;
    if (!hasLeftSeat && !hasRightSeat) {
      return (
        left.name.localeCompare(right.name, "ko") ||
        left.studentNumber.localeCompare(right.studentNumber, "ko")
      );
    }
    // 자습실 이름 우선 정렬
    const roomCmp = (left.studyRoomName ?? "").localeCompare(right.studyRoomName ?? "", "ko");
    if (roomCmp !== 0) return roomCmp;
    // 자습실 같으면 좌석번호 숫자 자연 정렬
    const seatCmp = (left.seatLabel ?? "").localeCompare(right.seatLabel ?? "", "ko", { numeric: true });
    return seatCmp || left.name.localeCompare(right.name, "ko");
  });
}

function toStudentSession(student: Pick<StudentListItem, "id" | "divisionId" | "studentNumber" | "name">, divisionSlug: string) {
  return {
    studentId: student.id,
    divisionId: student.divisionId,
    divisionSlug,
    studentNumber: student.studentNumber,
    name: student.name,
  } satisfies StudentSessionRecord;
}

function toNetPoints(rawPointsSum: number) {
  return Math.abs(Math.min(rawPointsSum, 0));
}

function formatSeatDisplay(studyRoomName: string | null, seatLabel: string | null) {
  if (!seatLabel) {
    return null;
  }

  return studyRoomName ? `${studyRoomName} / ${seatLabel}` : seatLabel;
}

function serializeMockStudent(
  student: MockStudentRecord,
  netPoints: number,
  warningStage: WarningStageValue,
  seatMeta: {
    seatId: string | null;
    seatLabel: string | null;
    studyRoomId: string | null;
    studyRoomName: string | null;
  },
  tuitionPlanName: string | null,
): StudentDetail {
  return {
    id: student.id,
    divisionId: student.divisionId,
    name: student.name,
    studentNumber: student.studentNumber,
    studyTrack: student.studyTrack,
    phone: student.phone,
    seatId: seatMeta.seatId,
    seatLabel: seatMeta.seatLabel,
    seatDisplay: formatSeatDisplay(seatMeta.studyRoomName, seatMeta.seatLabel),
    studyRoomId: seatMeta.studyRoomId,
    studyRoomName: seatMeta.studyRoomName,
    courseStartDate: student.courseStartDate ?? null,
    courseEndDate: student.courseEndDate ?? null,
    tuitionPlanId: student.tuitionPlanId ?? null,
    tuitionPlanName,
    tuitionAmount: student.tuitionAmount ?? null,
    status: student.status,
    enrolledAt: student.enrolledAt,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
    withdrawnAt: student.withdrawnAt,
    withdrawnNote: student.withdrawnNote,
    memo: student.memo,
    netPoints,
    warningStage,
  };
}

function serializeDbStudent(
  student: DbStudentRecord,
  netPoints: number,
  warningStage: WarningStageValue,
): StudentDetail {
  return {
    id: student.id,
    divisionId: student.divisionId,
    name: student.name,
    studentNumber: student.studentNumber,
    studyTrack: student.studyTrack,
    phone: student.phone,
    seatId: student.seat?.id ?? null,
    seatLabel: student.seat?.label ?? null,
    seatDisplay: formatSeatDisplay(student.seat?.studyRoom.name ?? null, student.seat?.label ?? null),
    studyRoomId: student.seat?.studyRoom.id ?? null,
    studyRoomName: student.seat?.studyRoom.name ?? null,
    courseStartDate: toDateString(student.courseStartDate),
    courseEndDate: toDateString(student.courseEndDate),
    tuitionPlanId: student.tuitionPlanId,
    tuitionPlanName: student.tuitionPlan?.name ?? null,
    tuitionAmount: student.tuitionAmount,
    status: student.status,
    enrolledAt: student.enrolledAt.toISOString(),
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
    withdrawnAt: student.withdrawnAt?.toISOString() ?? null,
    withdrawnNote: student.withdrawnNote,
    memo: student.memo,
    netPoints,
    warningStage,
  };
}

function serializeLegacyStudent(
  student: LegacyStudentRow,
  netPoints: number,
  warningStage: WarningStageValue,
): StudentDetail {
  return {
    id: student.id,
    divisionId: student.divisionId,
    name: student.name,
    studentNumber: student.studentNumber,
    studyTrack: null,
    phone: student.phone,
    seatId: student.seatId,
    seatLabel: student.seatLabel,
    seatDisplay: formatSeatDisplay(null, student.seatLabel),
    studyRoomId: null,
    studyRoomName: null,
    courseStartDate: null,
    courseEndDate: null,
    tuitionPlanId: null,
    tuitionPlanName: null,
    tuitionAmount: null,
    status: student.status,
    enrolledAt: student.enrolledAt.toISOString(),
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
    withdrawnAt: student.withdrawnAt?.toISOString() ?? null,
    withdrawnNote: student.withdrawnNote,
    memo: student.memo,
    netPoints,
    warningStage,
  };
}

async function readLegacyStudents(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionSlug: string,
): Promise<LegacyStudentRow[]> {
  return prisma.$queryRaw<LegacyStudentRow[]>`
    SELECT
      s.id,
      s.division_id AS "divisionId",
      s.name,
      s.student_number AS "studentNumber",
      s.phone,
      s.status::text AS "status",
      s.enrolled_at AS "enrolledAt",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      s.withdrawn_at AS "withdrawnAt",
      s.withdrawn_note AS "withdrawnNote",
      s.memo,
      seat.id AS "seatId",
      seat.label AS "seatLabel"
    FROM students s
    JOIN divisions d
      ON d.id = s.division_id
    LEFT JOIN seats seat
      ON seat.id = s.seat_id
    WHERE d.slug = ${divisionSlug}
  `;
}

async function getMockStudentsWithMetrics(divisionSlug: string) {
  const [state, settings] = await Promise.all([
    readMockState(),
    getDivisionSettings(divisionSlug),
  ]);
  const students = state.studentsByDivision[divisionSlug] ?? [];
  const seats = state.seatsByDivision[divisionSlug] ?? [];
  const rooms = state.studyRoomsByDivision[divisionSlug] ?? [];
  const pointTotals = new Map<string, number>();
  const planById = new Map((state.tuitionPlansByDivision[divisionSlug] ?? []).map((plan) => [plan.id, plan.name]));

  for (const record of state.pointRecordsByDivision[divisionSlug] ?? []) {
    pointTotals.set(record.studentId, (pointTotals.get(record.studentId) ?? 0) + record.points);
  }

  return sortBySeatAndName(
    students.map((student) => {
      const netPoints = toNetPoints(pointTotals.get(student.id) ?? 0);
      const seat =
        (student.seatId ? seats.find((item) => item.id === student.seatId) : null) ??
        (student.seatLabel ? seats.find((item) => item.label === student.seatLabel) : null) ??
        null;
      const room = seat ? rooms.find((item) => item.id === seat.studyRoomId) ?? null : null;

      return serializeMockStudent(
        student,
        netPoints,
        getWarningStage(netPoints, settings),
        {
          seatId: student.seatId ?? seat?.id ?? null,
          seatLabel: seat?.label ?? student.seatLabel ?? null,
          studyRoomId: room?.id ?? null,
          studyRoomName: room?.name ?? null,
        },
        student.tuitionPlanId ? planById.get(student.tuitionPlanId) ?? null : null,
      );
    }),
  );
}

async function getDbStudentsWithMetrics(divisionSlug: string) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
    select: { id: true },
  });
  const divisionId = division?.id;
  const settingsPromise = getDivisionSettings(divisionSlug);
  const pointAggregatesPromise = divisionId
    ? prisma.pointRecord.groupBy({
        by: ["studentId"],
        where: { student: { divisionId } },
        _sum: { points: true },
      })
    : Promise.resolve([] as { studentId: string; _sum: { points: number | null } }[]);

  let students: DbStudentRecord[];

  try {
    students = await prisma.student.findMany({
      where: { division: { slug: divisionSlug } },
      include: {
        seat: {
          select: {
            id: true,
            label: true,
            studyRoom: { select: { id: true, name: true } },
          },
        },
        tuitionPlan: { select: { id: true, name: true } },
      },
    });
  } catch (error) {
    if (
      !isPrismaSchemaMismatchError(error, [
        "students",
        "study_track",
        "course_start_date",
        "course_end_date",
        "tuition_plan_id",
        "tuition_amount",
        "study_room_id",
        "tuition_plans",
        "study_rooms",
      ])
    ) {
      throw error;
    }

    logSchemaCompatibilityFallback("students:list", error);

    const [settings, pointAggregates, legacyStudents] = await Promise.all([
      settingsPromise,
      pointAggregatesPromise,
      readLegacyStudents(prisma, divisionSlug),
    ]);

    const pointTotals = new Map<string, number>(
      pointAggregates.map((record) => [record.studentId, record._sum.points ?? 0]),
    );

    return sortBySeatAndName(
      legacyStudents.map((student) => {
        const netPoints = toNetPoints(pointTotals.get(student.id) ?? 0);
        return serializeLegacyStudent(student, netPoints, getWarningStage(netPoints, settings));
      }),
    );
  }

  const [settings, pointAggregates] = await Promise.all([
    settingsPromise,
    pointAggregatesPromise,
  ]);

  const pointRecords = pointAggregates.map((a) => ({
    studentId: a.studentId,
    points: a._sum.points ?? 0,
  }));

  const pointTotals = new Map<string, number>(
    pointRecords.map((r) => [r.studentId, r.points]),
  );

  return sortBySeatAndName(
    students.map((student) => {
      const netPoints = toNetPoints(pointTotals.get(student.id) ?? 0);
      return serializeDbStudent(student, netPoints, getWarningStage(netPoints, settings));
    }),
  );
}

const getDivisionOrThrow = cache(async function getDivisionOrThrow(divisionSlug: string) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
  });

  if (!division) {
    throw notFound("지점 정보를 찾을 수 없습니다.");
  }

  return division;
});

function ensureMockStudentNumberAvailableInState(
  state: Awaited<ReturnType<typeof readMockState>>,
  divisionSlug: string,
  studentNumber: string,
  currentStudentId?: string,
) {
  const duplicate = (state.studentsByDivision[divisionSlug] ?? []).find(
    (student) => student.studentNumber === studentNumber && student.id !== currentStudentId,
  );

  if (duplicate) {
    throw conflict("이미 사용 중인 수험번호입니다.");
  }
}

function resolveMockSeatAssignmentInState(
  state: Awaited<ReturnType<typeof readMockState>>,
  divisionSlug: string,
  seatId?: string | null,
  currentStudentId?: string,
) {
  const seats = state.seatsByDivision[divisionSlug] ?? [];

  if (!seatId) {
    return null;
  }

  const seat = seats.find((item) => item.id === seatId) ?? null;

  if (!seat) {
    throw notFound("좌석 정보를 찾을 수 없습니다.");
  }

  if (!seat.isActive) {
    throw badRequest("비활성 좌석은 배정할 수 없습니다.");
  }

  const occupied = (state.studentsByDivision[divisionSlug] ?? []).find((student) => {
    if (student.id === currentStudentId) {
      return false;
    }

    if (!["ACTIVE", "ON_LEAVE"].includes(student.status)) {
      return false;
    }

    return student.seatId === seat.id || (student.seatId == null && student.seatLabel === seat.label);
  });

  if (occupied) {
    throw conflict("이미 다른 학생에게 배정된 좌석입니다. 다른 좌석을 선택해 주세요.");
  }

  return {
    seatId: seat.id,
    seatLabel: seat.label,
  };
}

async function resolveSeatId(
  divisionId: string,
  seatId?: string | null,
  currentStudentId?: string,
) {
  if (!seatId) {
    return null;
  }

  const prisma = await getPrismaClient();
  const seat = await prisma.seat.findFirst({
    where: {
      id: seatId,
      divisionId,
    },
  });

  if (!seat) {
    throw new Error("좌석 정보를 찾을 수 없습니다.");
  }

  if (!seat.isActive) {
    throw new Error("비활성 좌석은 배정할 수 없습니다.");
  }

  const occupied = await prisma.student.findFirst({
    where: {
      divisionId,
      seatId: seat.id,
      id: currentStudentId ? { not: currentStudentId } : undefined,
      status: {
        in: ["ACTIVE", "ON_LEAVE"],
      },
    },
    select: {
      id: true,
    },
  });

  if (occupied) {
    throw new Error("이미 다른 학생에게 배정된 좌석입니다. 다른 좌석을 선택해 주세요.");
  }

  return seat.id;
}

function resolveMockTuitionPlanInState(
  state: Awaited<ReturnType<typeof readMockState>>,
  divisionSlug: string,
  tuitionPlanId?: string | null,
  tuitionAmount?: number | null,
) {
  const plan = tuitionPlanId
    ? (state.tuitionPlansByDivision[divisionSlug] ?? []).find((item) => item.id === tuitionPlanId) ?? null
    : null;

  if (tuitionPlanId && !plan) {
    throw notFound("등록 플랜을 찾을 수 없습니다.");
  }

  return {
    tuitionPlanId: plan?.id ?? null,
    tuitionAmount:
      typeof tuitionAmount === "number" && Number.isFinite(tuitionAmount)
        ? Math.max(0, Math.trunc(tuitionAmount))
        : plan?.amount ?? null,
  };
}

async function resolveDbTuitionPlan(
  divisionId: string,
  tuitionPlanId?: string | null,
  tuitionAmount?: number | null,
) {
  const prisma = await getPrismaClient();
  const plan = tuitionPlanId
    ? await prisma.tuitionPlan.findFirst({
        where: {
          id: tuitionPlanId,
          divisionId,
        },
        select: {
          id: true,
          amount: true,
        },
      })
    : null;

  if (tuitionPlanId && !plan) {
    throw new Error("등록 플랜을 찾을 수 없습니다.");
  }

  return {
    tuitionPlanId: plan?.id ?? null,
    tuitionAmount:
      typeof tuitionAmount === "number" && Number.isFinite(tuitionAmount)
        ? Math.max(0, Math.trunc(tuitionAmount))
        : plan?.amount ?? null,
  };
}


export const listStudents = cache(async function listStudents(divisionSlug: string): Promise<StudentListItem[]> {
  return isMockMode() ? getMockStudentsWithMetrics(divisionSlug) : getDbStudentsWithMetrics(divisionSlug);
});

export async function getDivisionStudents(divisionSlug: string): Promise<DivisionStudent[]> {
  const students = await listStudents(divisionSlug);

  return students
    .filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE")
    .map((student) => ({
      id: student.id,
      divisionId: student.divisionId,
      name: student.name,
      studentNumber: student.studentNumber,
      studyTrack: student.studyTrack,
      phone: student.phone,
      seatId: student.seatId,
      seatLabel: student.seatLabel,
      seatDisplay: student.seatDisplay,
      studyRoomId: student.studyRoomId,
      studyRoomName: student.studyRoomName,
      courseStartDate: student.courseStartDate,
      courseEndDate: student.courseEndDate,
      tuitionPlanId: student.tuitionPlanId,
      tuitionPlanName: student.tuitionPlanName,
      tuitionAmount: student.tuitionAmount,
      status: student.status,
    }));
}

export async function getStudentDetail(divisionSlug: string, studentId: string) {
  if (isMockMode()) {
    const students = await listStudents(divisionSlug);
    const student = students.find((item) => item.id === studentId);

    if (!student) {
      throw notFound("학생 정보를 찾을 수 없습니다.");
    }

    const state = await readMockState();
    const raw = (state.studentsByDivision[divisionSlug] ?? []).find((item) => item.id === studentId);

    if (!raw) {
      throw new Error("학생 정보를 찾을 수 없습니다.");
    }

    return {
      ...student,
      withdrawnNote: raw.withdrawnNote,
      memo: raw.memo,
      updatedAt: raw.updatedAt,
    } satisfies StudentDetail;
  }

  const prisma = await getPrismaClient();
  try {
    const [settings, raw, pointAggregate] = await Promise.all([
    getDivisionSettings(divisionSlug),
    prisma.student.findFirst({
      where: {
        id: studentId,
        division: {
          slug: divisionSlug,
        },
      },
      include: {
        seat: {
          select: {
            id: true,
            label: true,
            studyRoom: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        tuitionPlan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.pointRecord.aggregate({
      where: {
        studentId,
        student: {
          division: {
            slug: divisionSlug,
          },
        },
      },
      _sum: {
        points: true,
      },
    }),
  ]);

  if (!raw) {
    throw new Error("학생 정보를 찾을 수 없습니다.");
  }

  const netPoints = toNetPoints(pointAggregate._sum.points ?? 0);

    return serializeDbStudent(raw, netPoints, getWarningStage(netPoints, settings));
  } catch (error) {
    if (
      !isPrismaSchemaMismatchError(error, [
        "students",
        "study_track",
        "course_start_date",
        "course_end_date",
        "tuition_plan_id",
        "tuition_amount",
        "study_room_id",
        "tuition_plans",
        "study_rooms",
      ])
    ) {
      throw error;
    }

    logSchemaCompatibilityFallback("students:detail", error);
    const student = (await listStudents(divisionSlug)).find((item) => item.id === studentId);

    if (!student) {
      throw notFound("학생 정보를 찾을 수 없습니다.");
    }

    return student;
  }
}

export async function createStudent(divisionSlug: string, input: StudentUpsertInput) {
  const name = normalizeText(input.name);
  const studentNumber = normalizeText(input.studentNumber);
  const studyTrack = normalizeOptionalText(input.studyTrack);
  const phone = normalizeOptionalText(input.phone);
  const memo = normalizeOptionalText(input.memo);
  const status = input.status ?? "ACTIVE";
  const isWithdrawn = status === "WITHDRAWN";
  const courseStartDate = normalizeOptionalDate(input.courseStartDate);
  const courseEndDate = normalizeOptionalDate(input.courseEndDate);
  validateCourseRange(courseStartDate, courseEndDate);

  if (isMockMode()) {
    const studentId = await updateMockState(async (state) => {
      const divisionStudents = state.studentsByDivision[divisionSlug];
      if (!divisionStudents) {
        throw new Error("지점 정보를 찾을 수 없습니다.");
      }
      ensureMockStudentNumberAvailableInState(state, divisionSlug, studentNumber);
      const seatAssignment = isWithdrawn
        ? null
        : resolveMockSeatAssignmentInState(state, divisionSlug, input.seatId);
      const tuition = resolveMockTuitionPlanInState(
        state,
        divisionSlug,
        input.tuitionPlanId,
        input.tuitionAmount,
      );
      const divisionId = divisionStudents[0]?.divisionId ?? getMockDivisionBySlug(divisionSlug)?.id;
      const now = new Date().toISOString();
      const normalizedCourseStartDate = ensureCourseStartDate(courseStartDate, now);
      const student: MockStudentRecord = {
        id: `mock-student-${divisionSlug}-${Date.now()}`,
        divisionId: divisionId ?? `div-${divisionSlug}`,
        divisionSlug,
        name,
        studentNumber,
        studyTrack,
        phone,
        seatId: seatAssignment?.seatId ?? null,
        seatLabel: seatAssignment?.seatLabel ?? null,
        courseStartDate: normalizedCourseStartDate,
        courseEndDate,
        tuitionPlanId: tuition.tuitionPlanId,
        tuitionAmount: tuition.tuitionAmount,
        status,
        enrolledAt: now,
        withdrawnAt: status === "WITHDRAWN" ? now : null,
        withdrawnNote: status === "WITHDRAWN" ? "초기 등록 당시 이미 퇴실 상태" : null,
        memo,
        createdAt: now,
        updatedAt: now,
      };
      state.studentsByDivision[divisionSlug] = [...divisionStudents, student] as MockStudentRecord[];
      return student.id;
    });
    return getStudentDetail(divisionSlug, studentId);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const duplicate = await prisma.student.findFirst({
    where: {
      divisionId: division.id,
      studentNumber,
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error("이미 사용 중인 수험번호입니다.");
  }

  const seatId = isWithdrawn ? null : await resolveSeatId(division.id, input.seatId);
  const tuition = await resolveDbTuitionPlan(division.id, input.tuitionPlanId, input.tuitionAmount);

  let student;

  try {
    student = await prisma.student.create({
    data: {
      divisionId: division.id,
      name,
      studentNumber,
      studyTrack,
      phone,
      seatId,
      courseStartDate: courseStartDate ? parseDateString(courseStartDate) : null,
      courseEndDate: courseEndDate ? parseDateString(courseEndDate) : null,
      tuitionPlanId: tuition.tuitionPlanId,
      tuitionAmount: tuition.tuitionAmount,
      status,
      memo,
      withdrawnAt: status === "WITHDRAWN" ? new Date() : null,
      withdrawnNote: status === "WITHDRAWN" ? "초기 등록 시 이미 퇴실 상태" : null,
    },
    });
  } catch (error) {
    throw toStudentWriteError(error);
  }

  return getStudentDetail(divisionSlug, student.id);
}

export async function updateStudent(
  divisionSlug: string,
  studentId: string,
  input: StudentUpsertInput,
) {
  const name = normalizeText(input.name);
  const studentNumber = normalizeText(input.studentNumber);
  const studyTrack = normalizeOptionalText(input.studyTrack);
  const phone = normalizeOptionalText(input.phone);
  const memo = normalizeOptionalText(input.memo);
  const status = input.status ?? "ACTIVE";
  const isWithdrawn = status === "WITHDRAWN";
  const courseStartDate = normalizeOptionalDate(input.courseStartDate);
  const courseEndDate = normalizeOptionalDate(input.courseEndDate);
  validateCourseRange(courseStartDate, courseEndDate);

  if (isMockMode()) {
    await updateMockState(async (state) => {
      ensureMockStudentNumberAvailableInState(state, divisionSlug, studentNumber, studentId);
      const seatAssignment = isWithdrawn
        ? null
        : resolveMockSeatAssignmentInState(
            state,
            divisionSlug,
            input.seatId,
            studentId,
          );
      const tuition = resolveMockTuitionPlanInState(
        state,
        divisionSlug,
        input.tuitionPlanId,
        input.tuitionAmount,
      );
      const current = state.studentsByDivision[divisionSlug] ?? [];
      const target = current.find((student) => student.id === studentId);
      if (!target) {
        throw new Error("학생 정보를 찾을 수 없습니다.");
      }
      state.studentsByDivision[divisionSlug] = current.map((student) =>
        student.id === studentId
          ? {
              ...student,
              name,
              studentNumber,
              studyTrack,
              phone,
              seatId: isWithdrawn ? null : seatAssignment?.seatId ?? null,
              seatLabel: isWithdrawn ? null : seatAssignment?.seatLabel ?? null,
              courseStartDate: ensureCourseStartDate(
                courseStartDate,
                student.courseStartDate ?? student.enrolledAt,
              ),
              courseEndDate,
              tuitionPlanId: tuition.tuitionPlanId,
              tuitionAmount: tuition.tuitionAmount,
              status,
              memo,
              withdrawnAt: isWithdrawn ? student.withdrawnAt ?? new Date().toISOString() : null,
              withdrawnNote: isWithdrawn ? student.withdrawnNote ?? "관리자 상태 변경으로 퇴실 처리" : null,
              updatedAt: new Date().toISOString(),
            }
          : student,
      );
    });
    return getStudentDetail(divisionSlug, studentId);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      divisionId: division.id,
    },
    select: {
      id: true,
      withdrawnAt: true,
      withdrawnNote: true,
    },
  });

  if (!student) {
    throw new Error("학생 정보를 찾을 수 없습니다.");
  }

  const duplicate = await prisma.student.findFirst({
    where: {
      divisionId: division.id,
      studentNumber,
      id: {
        not: studentId,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error("이미 사용 중인 수험번호입니다.");
  }

  const seatId = isWithdrawn ? null : await resolveSeatId(division.id, input.seatId, studentId);
  const tuition = await resolveDbTuitionPlan(division.id, input.tuitionPlanId, input.tuitionAmount);

  try {
    await prisma.student.update({
    where: {
      id: studentId,
    },
    data: {
      name,
      studentNumber,
      studyTrack,
      phone,
      seatId,
      courseStartDate: courseStartDate ? parseDateString(courseStartDate) : null,
      courseEndDate: courseEndDate ? parseDateString(courseEndDate) : null,
      tuitionPlanId: tuition.tuitionPlanId,
      tuitionAmount: tuition.tuitionAmount,
      status,
      memo,
      withdrawnAt: isWithdrawn ? student.withdrawnAt ?? new Date() : null,
      withdrawnNote: isWithdrawn ? student.withdrawnNote ?? "관리자 상태 변경으로 퇴실 처리" : null,
    },
    });
  } catch (error) {
    throw toStudentWriteError(error);
  }

  return getStudentDetail(divisionSlug, studentId);
}

export async function updateStudentMemo(
  divisionSlug: string,
  studentId: string,
  memoInput: string | null,
) {
  const memo = normalizeOptionalText(memoInput);

  if (isMockMode()) {
    await updateMockState(async (state) => {
      const current = state.studentsByDivision[divisionSlug] ?? [];
      const target = current.find((student) => student.id === studentId);
      if (!target) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }
      state.studentsByDivision[divisionSlug] = current.map((student) =>
        student.id === studentId
          ? {
              ...student,
              memo,
              updatedAt: new Date().toISOString(),
            }
          : student,
      );
    });
    return getStudentDetail(divisionSlug, studentId);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      divisionId: division.id,
    },
    select: {
      id: true,
    },
  });

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  await prisma.student.update({
    where: {
      id: studentId,
    },
    data: {
      memo,
    },
  });

  return getStudentDetail(divisionSlug, studentId);
}

export async function withdrawStudent(
  divisionSlug: string,
  studentId: string,
  input: StudentWithdrawInput,
) {
  const withdrawnNote = normalizeText(input.withdrawnNote);

  if (isMockMode()) {
    await updateMockState(async (state) => {
      const current = state.studentsByDivision[divisionSlug] ?? [];
      const target = current.find((student) => student.id === studentId);
      if (!target) {
        throw new Error("학생 정보를 찾을 수 없습니다.");
      }
      const now = new Date().toISOString();
      state.studentsByDivision[divisionSlug] = current.map((student) =>
        student.id === studentId
          ? {
              ...student,
              status: "WITHDRAWN",
              withdrawnAt: now,
              withdrawnNote,
              updatedAt: now,
              seatId: null,
              seatLabel: null,
            }
          : student,
      );
    });
    return getStudentDetail(divisionSlug, studentId);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      divisionId: division.id,
    },
    select: {
      id: true,
    },
  });

  if (!student) {
    throw new Error("학생 정보를 찾을 수 없습니다.");
  }

  await prisma.student.update({
    where: {
      id: studentId,
    },
    data: {
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      withdrawnNote,
      seatId: null,
    },
  });

  return getStudentDetail(divisionSlug, studentId);
}

export async function deleteStudent(divisionSlug: string, studentId: string) {
  if (isMockMode()) {
    await updateMockState(async (state) => {
      const current = state.studentsByDivision[divisionSlug] ?? [];
      const target = current.find((student) => student.id === studentId);
      if (!target) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }
      state.studentsByDivision[divisionSlug] = current.filter(
        (student) => student.id !== studentId,
      );
      if (state.attendanceByDivision[divisionSlug]) {
        state.attendanceByDivision[divisionSlug] = state.attendanceByDivision[divisionSlug].filter(
          (record) => record.studentId !== studentId,
        );
      }
      if (state.pointRecordsByDivision[divisionSlug]) {
        state.pointRecordsByDivision[divisionSlug] = state.pointRecordsByDivision[divisionSlug].filter(
          (record) => record.studentId !== studentId,
        );
      }
    });
    return;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      divisionId: division.id,
    },
    select: { id: true },
  });

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  // Student 관련 레코드는 onDelete: Cascade로 자동 삭제
  await prisma.student.delete({ where: { id: studentId } });
}

export async function reactivateStudent(divisionSlug: string, studentId: string) {
  if (isMockMode()) {
    await updateMockState(async (state) => {
      const current = state.studentsByDivision[divisionSlug] ?? [];
      const target = current.find((student) => student.id === studentId);
      if (!target) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }
      if (target.status !== "WITHDRAWN") {
        throw badRequest("퇴실 상태인 학생만 재입실할 수 있습니다.");
      }
      state.studentsByDivision[divisionSlug] = current.map((student) =>
        student.id === studentId
          ? {
              ...student,
              status: "ACTIVE",
              withdrawnAt: null,
              withdrawnNote: null,
              updatedAt: new Date().toISOString(),
            }
          : student,
      );
    });
    return getStudentDetail(divisionSlug, studentId);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      divisionId: division.id,
    },
    select: { id: true, status: true },
  });

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  if (student.status !== "WITHDRAWN") {
    throw badRequest("퇴실 상태인 학생만 재입실할 수 있습니다.");
  }

  await prisma.student.update({
    where: { id: studentId },
    data: {
      status: "ACTIVE",
      withdrawnAt: null,
      withdrawnNote: null,
    },
  });

  return getStudentDetail(divisionSlug, studentId);
}

export async function findStudentSessionByCredentials(
  divisionSlug: string,
  studentNumber: string,
  name: string,
) {
  const normalizedName = normalizeText(name);
  const normalizedNumber = normalizeText(studentNumber);

  if (isMockMode()) {
    const state = await readMockState();
    const student = (state.studentsByDivision[divisionSlug] ?? []).find(
      (item) =>
        item.studentNumber === normalizedNumber &&
        item.name === normalizedName &&
        (item.status === "ACTIVE" || item.status === "ON_LEAVE"),
    );

    if (!student) {
      return null;
    }

    return {
      studentId: student.id,
      divisionId: student.divisionId,
      divisionSlug,
      studentNumber: student.studentNumber,
      name: student.name,
    } satisfies StudentSessionRecord;
  }

  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
    where: {
      studentNumber: normalizedNumber,
      name: normalizedName,
      division: {
        slug: divisionSlug,
      },
      status: {
        in: ["ACTIVE", "ON_LEAVE"],
      },
    },
    include: {
      division: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!student) {
    return null;
  }

  return {
    studentId: student.id,
    divisionId: student.divisionId,
    divisionSlug: student.division.slug,
    studentNumber: student.studentNumber,
    name: student.name,
  } satisfies StudentSessionRecord;
}

export async function findStudentSessionById(
  divisionSlug: string,
  studentId: string,
) {
  if (isMockMode()) {
    const state = await readMockState();
    const student = (state.studentsByDivision[divisionSlug] ?? []).find(
      (item) =>
        item.id === studentId &&
        (item.status === "ACTIVE" || item.status === "ON_LEAVE"),
    );

    if (!student) {
      return null;
    }

    return {
      studentId: student.id,
      divisionId: student.divisionId,
      divisionSlug,
      studentNumber: student.studentNumber,
      name: student.name,
    } satisfies StudentSessionRecord;
  }

  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      division: {
        slug: divisionSlug,
      },
      status: {
        in: ["ACTIVE", "ON_LEAVE"],
      },
    },
    include: {
      division: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!student) {
    return null;
  }

  return {
    studentId: student.id,
    divisionId: student.divisionId,
    divisionSlug: student.division.slug,
    studentNumber: student.studentNumber,
    name: student.name,
  } satisfies StudentSessionRecord;
}

export async function getDefaultMockStudentSession(divisionSlug = "police") {
  const students = await getDivisionStudents(divisionSlug);
  const student = students[0];

  if (!student) {
    return null;
  }

  return toStudentSession(student, divisionSlug);
}
