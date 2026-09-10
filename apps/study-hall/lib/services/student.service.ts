import { getManagementPolicy, getPolicyPointTotals, getPolicyHolidayUsage } from "@/lib/services/management-policy.service";
import { kstMonthBounds } from "@/lib/management-policy";
import { randomUUID } from "node:crypto";
import { indexFirstBy } from "@/lib/record-index";

import { cache } from "react";

import { Prisma } from "@prisma/client/index";

import { normalizeYmdDate, parseUtcDateFromYmd } from "@/lib/date-utils";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { readMockState, updateMockState, type MockStudentRecord } from "@/lib/mock-store";
import {
  getPrismaClient,
  isPrismaSchemaMismatchError,
  logSchemaCompatibilityFallback,
  normalizeOptionalText,
} from "@/lib/service-helpers";
import { getDivisionSettings } from "@/lib/services/settings.service";
import {
  getWarningStage,
  toDemeritPoints,
  type StudentStatusValue,
  type WarningStageValue,
} from "@/lib/student-meta";

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
  tuitionExempt: boolean;
  tuitionExemptReason: string | null;
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
  meritPoints?: number;
  unusedHolidayCount?: number;
  demeritPoints?: number;
  warningStageLabel?: string;
  warningStageLabels?: Record<string, string>;
  warningStage: WarningStageValue;
};

export type StudentDetail = StudentListItem;

export type StudentPointMetricOptions = {
  pointDateFrom?: string;
  pointDateTo?: string;
};

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
  tuitionExempt?: boolean;
  tuitionExemptReason?: string | null;
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
  tuitionExempt: boolean;
  tuitionExemptReason: string | null;
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

type CompatibleStudentRow = LegacyStudentRow & {
  studyTrack: string | null;
  studyRoomId: string | null;
  studyRoomName: string | null;
  courseStartDate: Date | null;
  courseEndDate: Date | null;
  tuitionPlanId: string | null;
  tuitionPlanName: string | null;
  tuitionAmount: number | null;
  tuitionExempt: boolean;
  tuitionExemptReason: string | null;
};

type StudentSchemaCompatibility = {
  hasStudyTrack: boolean;
  hasCourseStartDate: boolean;
  hasCourseEndDate: boolean;
  hasTuitionPlanId: boolean;
  hasTuitionAmount: boolean;
  hasTuitionExempt: boolean;
  hasTuitionExemptReason: boolean;
  hasStudyRoomsTable: boolean;
  hasTuitionPlansTable: boolean;
};

type StudentWriteCompatibleFields = {
  studyTrack: string | null;
  courseStartDate: Date | null;
  courseEndDate: Date | null;
  tuitionPlanId: string | null;
  tuitionAmount: number | null;
  tuitionExempt: boolean;
  tuitionExemptReason: string | null;
};

let studentSchemaCompatibilityPromise: Promise<StudentSchemaCompatibility> | null = null;

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

const STUDENT_SCHEMA_MISMATCH_PATTERNS = [
  "students",
  "study_track",
  "course_start_date",
  "course_end_date",
  "tuition_plan_id",
  "tuition_amount",
  "tuition_exempt",
  "tuition_exempt_reason",
] as const;

function isStudentSchemaMismatchError(error: unknown) {
  return isPrismaSchemaMismatchError(error, [...STUDENT_SCHEMA_MISMATCH_PATTERNS]);
}

async function detectStudentSchemaCompatibility(): Promise<StudentSchemaCompatibility> {
  const prisma = await getPrismaClient();
  const rows = await prisma.$queryRaw<Array<{ tableName: string; columnName: string }>>`
    SELECT
      table_name AS "tableName",
      column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema IN (current_schema(), 'study_hall')
      AND (
        (table_name = 'students' AND column_name IN (
          'study_track',
          'course_start_date',
          'course_end_date',
          'tuition_plan_id',
          'tuition_amount',
          'tuition_exempt',
          'tuition_exempt_reason'
        ))
        OR (table_name = 'study_rooms' AND column_name = 'id')
        OR (table_name = 'tuition_plans' AND column_name = 'id')
      )
  `;
  const columns = new Set(rows.map((row) => `${row.tableName}:${row.columnName}`));

  return {
    hasStudyTrack: columns.has("students:study_track"),
    hasCourseStartDate: columns.has("students:course_start_date"),
    hasCourseEndDate: columns.has("students:course_end_date"),
    hasTuitionPlanId: columns.has("students:tuition_plan_id"),
    hasTuitionAmount: columns.has("students:tuition_amount"),
    hasTuitionExempt: columns.has("students:tuition_exempt"),
    hasTuitionExemptReason: columns.has("students:tuition_exempt_reason"),
    hasStudyRoomsTable: columns.has("study_rooms:id"),
    hasTuitionPlansTable: columns.has("tuition_plans:id"),
  };
}

async function getStudentSchemaCompatibility() {
  if (!studentSchemaCompatibilityPromise) {
    studentSchemaCompatibilityPromise = detectStudentSchemaCompatibility().catch((error) => {
      logSchemaCompatibilityFallback("students:schema-detect", error);

      return {
        hasStudyTrack: true,
        hasCourseStartDate: true,
        hasCourseEndDate: true,
        hasTuitionPlanId: true,
        hasTuitionAmount: true,
        hasTuitionExempt: true,
        hasTuitionExemptReason: true,
        hasStudyRoomsTable: true,
        hasTuitionPlansTable: true,
      } satisfies StudentSchemaCompatibility;
    });
  }

  return studentSchemaCompatibilityPromise;
}

function supportsPrismaStudentRead(schema: StudentSchemaCompatibility) {
  return (
    schema.hasStudyTrack &&
    schema.hasCourseStartDate &&
    schema.hasCourseEndDate &&
    schema.hasTuitionPlanId &&
    schema.hasTuitionAmount &&
    schema.hasTuitionExempt &&
    schema.hasTuitionExemptReason &&
    schema.hasStudyRoomsTable &&
    schema.hasTuitionPlansTable
  );
}

function ensureSupportedStudentWriteValue(
  isSupported: boolean,
  hasValue: boolean,
  label: string,
) {
  if (!isSupported && hasValue) {
    throw badRequest(`${label} 저장을 사용하려면 DB 마이그레이션이 필요합니다.`);
  }
}

function assertStudentWriteSchemaCompatibility(
  schema: StudentSchemaCompatibility,
  fields: {
    studyTrack: string | null;
    courseStartDate: string | null;
    courseEndDate: string | null;
    tuitionExempt: boolean;
    tuitionExemptReason: string | null;
  },
) {
  ensureSupportedStudentWriteValue(schema.hasStudyTrack, Boolean(fields.studyTrack), "직렬");
  ensureSupportedStudentWriteValue(schema.hasCourseStartDate, Boolean(fields.courseStartDate), "수강 시작일");
  ensureSupportedStudentWriteValue(schema.hasCourseEndDate, Boolean(fields.courseEndDate), "수강 종료일");
  ensureSupportedStudentWriteValue(schema.hasTuitionExempt, fields.tuitionExempt, "수강료 면제");
  ensureSupportedStudentWriteValue(
    schema.hasTuitionExemptReason,
    Boolean(fields.tuitionExemptReason),
    "면제 사유",
  );
}

function buildCompatibleStudentWriteData<T extends Record<string, unknown>>(
  baseData: T,
  fields: StudentWriteCompatibleFields,
  schema: StudentSchemaCompatibility,
) {
  return {
    ...baseData,
    ...(schema.hasStudyTrack ? { studyTrack: fields.studyTrack } : {}),
    ...(schema.hasCourseStartDate ? { courseStartDate: fields.courseStartDate } : {}),
    ...(schema.hasCourseEndDate ? { courseEndDate: fields.courseEndDate } : {}),
    ...(schema.hasTuitionPlanId ? { tuitionPlanId: fields.tuitionPlanId } : {}),
    ...(schema.hasTuitionAmount ? { tuitionAmount: fields.tuitionAmount } : {}),
    ...(schema.hasTuitionExempt ? { tuitionExempt: fields.tuitionExempt } : {}),
    ...(schema.hasTuitionExemptReason ? { tuitionExemptReason: fields.tuitionExemptReason } : {}),
  } as T & Partial<StudentWriteCompatibleFields>;
}

function toStudentWriteErrorCompat(error: unknown) {
  if (isStudentSchemaMismatchError(error)) {
    return badRequest("학생 관련 데이터베이스 변경이 아직 반영되지 않았습니다. DB 마이그레이션 상태를 확인해 주세요.");
  }

  return toStudentWriteError(error);
}

function getCreatedWithdrawalFields(isWithdrawn: boolean) {
  return {
    withdrawnAt: isWithdrawn ? new Date() : null,
    withdrawnNote: isWithdrawn ? "초기 등록 시 이미 퇴원 상태" : null,
  };
}

function getUpdatedWithdrawalFields(
  isWithdrawn: boolean,
  current: { withdrawnAt: Date | null; withdrawnNote: string | null },
) {
  return {
    withdrawnAt: isWithdrawn ? current.withdrawnAt ?? new Date() : null,
    withdrawnNote: isWithdrawn ? current.withdrawnNote ?? "관리자 상태 변경으로 퇴원 처리" : null,
  };
}

async function runStudentWriteWithFallback<T>({
  scope,
  preferLegacyWrite,
  runModern,
  runLegacy,
}: {
  scope: string;
  preferLegacyWrite?: boolean;
  runModern: () => Promise<T>;
  runLegacy: () => Promise<T>;
}) {
  if (!preferLegacyWrite) {
    try {
      return await runModern();
    } catch (error) {
      if (!isStudentSchemaMismatchError(error)) {
        throw toStudentWriteErrorCompat(error);
      }

      logSchemaCompatibilityFallback(scope, error);
    }
  }

  try {
    return await runLegacy();
  } catch (error) {
    throw toStudentWriteErrorCompat(error);
  }
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
      "tuition_exempt",
      "tuition_exempt_reason",
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
  return rawPointsSum;
}

function resolvePointMetricRange(options?: StudentPointMetricOptions) {
  const dateFrom = options?.pointDateFrom
    ? normalizeYmdDate(options.pointDateFrom, "시작일")
    : null;
  const dateTo = options?.pointDateTo
    ? normalizeYmdDate(options.pointDateTo, "종료일")
    : null;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw badRequest("종료일은 시작일 이후로 선택해주세요.");
  }

  const from = dateFrom ? parseUtcDateFromYmd(dateFrom, "시작일") : null;
  const to = dateTo ? parseUtcDateFromYmd(dateTo, "종료일") : null;

  if (to) {
    to.setUTCDate(to.getUTCDate() + 1);
  }

  return { dateFrom, dateTo, from, to };
}

function isPointRecordInMetricRange(
  record: { date: string },
  range: ReturnType<typeof resolvePointMetricRange>,
) {
  const dateKey = record.date.slice(0, 10);

  return (
    (!range.dateFrom || dateKey >= range.dateFrom) &&
    (!range.dateTo || dateKey <= range.dateTo)
  );
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
    tuitionExempt: student.tuitionExempt,
    tuitionExemptReason: student.tuitionExemptReason ?? null,
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
    tuitionExempt: student.tuitionExempt,
    tuitionExemptReason: student.tuitionExemptReason,
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

function serializeCompatibleStudent(
  student: CompatibleStudentRow,
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
    seatId: student.seatId,
    seatLabel: student.seatLabel,
    seatDisplay: formatSeatDisplay(student.studyRoomName, student.seatLabel),
    studyRoomId: student.studyRoomId,
    studyRoomName: student.studyRoomName,
    courseStartDate: toDateString(student.courseStartDate),
    courseEndDate: toDateString(student.courseEndDate),
    tuitionPlanId: student.tuitionPlanId,
    tuitionPlanName: student.tuitionPlanName,
    tuitionAmount: student.tuitionAmount,
    tuitionExempt: student.tuitionExempt,
    tuitionExemptReason: student.tuitionExemptReason,
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

async function readCompatibleStudents(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionSlug: string,
  options?: {
    studentId?: string;
    schema?: StudentSchemaCompatibility;
  },
): Promise<CompatibleStudentRow[]> {
  const schema = options?.schema ?? await getStudentSchemaCompatibility();
  const roomJoin = schema.hasStudyRoomsTable
    ? Prisma.sql`
        LEFT JOIN study_hall.study_rooms room
          ON room.id = seat.study_room_id
      `
    : Prisma.empty;
  const planJoin =
    schema.hasTuitionPlansTable && schema.hasTuitionPlanId
      ? Prisma.sql`
          LEFT JOIN study_hall.tuition_plans plan
            ON plan.id = s.tuition_plan_id
        `
      : Prisma.empty;
  const studentFilter = options?.studentId
    ? Prisma.sql`
        AND s.id = ${options.studentId}
      `
    : Prisma.empty;

  return prisma.$queryRaw<CompatibleStudentRow[]>(Prisma.sql`
    SELECT
      s.id,
      s.division_id AS "divisionId",
      s.name,
      s.student_number AS "studentNumber",
      ${schema.hasStudyTrack ? Prisma.sql`s.study_track` : Prisma.sql`NULL`} AS "studyTrack",
      s.phone,
      s.status::text AS "status",
      s.enrolled_at AS "enrolledAt",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      s.withdrawn_at AS "withdrawnAt",
      s.withdrawn_note AS "withdrawnNote",
      s.memo,
      seat.id AS "seatId",
      seat.label AS "seatLabel",
      ${schema.hasStudyRoomsTable ? Prisma.sql`room.id` : Prisma.sql`NULL`} AS "studyRoomId",
      ${schema.hasStudyRoomsTable ? Prisma.sql`room.name` : Prisma.sql`NULL`} AS "studyRoomName",
      ${schema.hasCourseStartDate ? Prisma.sql`s.course_start_date` : Prisma.sql`NULL`} AS "courseStartDate",
      ${schema.hasCourseEndDate ? Prisma.sql`s.course_end_date` : Prisma.sql`NULL`} AS "courseEndDate",
      ${schema.hasTuitionPlanId ? Prisma.sql`s.tuition_plan_id` : Prisma.sql`NULL`} AS "tuitionPlanId",
      ${schema.hasTuitionPlansTable && schema.hasTuitionPlanId ? Prisma.sql`plan.name` : Prisma.sql`NULL`} AS "tuitionPlanName",
      ${schema.hasTuitionAmount ? Prisma.sql`s.tuition_amount` : Prisma.sql`NULL`} AS "tuitionAmount",
      ${schema.hasTuitionExempt ? Prisma.sql`COALESCE(s.tuition_exempt, false)` : Prisma.sql`false`} AS "tuitionExempt",
      ${schema.hasTuitionExemptReason ? Prisma.sql`s.tuition_exempt_reason` : Prisma.sql`NULL`} AS "tuitionExemptReason"
    FROM study_hall.students s
    JOIN study_hall.divisions d
      ON d.id = s.division_id
    LEFT JOIN study_hall.seats seat
      ON seat.id = s.seat_id
    ${roomJoin}
    ${planJoin}
    WHERE d.slug = ${divisionSlug}
    ${studentFilter}
  `);
}

async function getMockStudentsWithMetrics(
  divisionSlug: string,
  options?: StudentPointMetricOptions,
) {
  const [state, settings] = await Promise.all([
    readMockState(),
    getDivisionSettings(divisionSlug),
  ]);
  const students = state.studentsByDivision[divisionSlug] ?? [];
  const seats = state.seatsByDivision[divisionSlug] ?? [];
  const rooms = state.studyRoomsByDivision[divisionSlug] ?? [];
  const seatsById = indexFirstBy(seats, (seat) => seat.id);
  const seatsByLabel = indexFirstBy(seats, (seat) => seat.label);
  const roomsById = indexFirstBy(rooms, (room) => room.id);
  const pointTotals = new Map<string, number>();
  const planById = new Map((state.tuitionPlansByDivision[divisionSlug] ?? []).map((plan) => [plan.id, plan.name]));
  const pointRange = resolvePointMetricRange(options);

  for (const record of state.pointRecordsByDivision[divisionSlug] ?? []) {
    if (!isPointRecordInMetricRange(record, pointRange)) {
      continue;
    }

    pointTotals.set(record.studentId, (pointTotals.get(record.studentId) ?? 0) + record.points);
  }

  return sortBySeatAndName(
    students.map((student) => {
      const netPoints = toNetPoints(pointTotals.get(student.id) ?? 0);
      const seat =
        (student.seatId ? seatsById.get(student.seatId) : null) ??
        (student.seatLabel ? seatsByLabel.get(student.seatLabel) : null) ??
        null;
      const room = seat ? roomsById.get(seat.studyRoomId) ?? null : null;

      return serializeMockStudent(
        student,
        netPoints,
        getWarningStage(toDemeritPoints(netPoints), settings),
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

async function getDbStudentsWithMetrics(
  divisionSlug: string,
  options?: StudentPointMetricOptions,
) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
    select: { id: true },
  });
  const divisionId = division?.id;
  const pointRange = resolvePointMetricRange(options);
  const settingsPromise = getDivisionSettings(divisionSlug);
  const pointAggregatesPromise = divisionId
    ? prisma.pointRecord.groupBy({
        by: ["studentId"],
        where: {
          student: { divisionId },
          ...(pointRange.from || pointRange.to
            ? {
                date: {
                  ...(pointRange.from ? { gte: pointRange.from } : {}),
                  ...(pointRange.to ? { lt: pointRange.to } : {}),
                },
              }
            : {}),
        },
        _sum: { points: true },
      })
    : Promise.resolve([] as { studentId: string; _sum: { points: number | null } }[]);
  const studentSchema = await getStudentSchemaCompatibility();

  if (!supportsPrismaStudentRead(studentSchema)) {
    const [settings, pointAggregates, compatibleStudents] = await Promise.all([
      settingsPromise,
      pointAggregatesPromise,
      readCompatibleStudents(prisma, divisionSlug, { schema: studentSchema }),
    ]);

    const pointTotals = new Map<string, number>(
      pointAggregates.map((record) => [record.studentId, record._sum.points ?? 0]),
    );

    return sortBySeatAndName(
      compatibleStudents.map((student) => {
        const netPoints = toNetPoints(pointTotals.get(student.id) ?? 0);
        return serializeCompatibleStudent(student, netPoints, getWarningStage(toDemeritPoints(netPoints), settings));
      }),
    );
  }

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
        "tuition_exempt",
        "tuition_exempt_reason",
        "study_room_id",
        "tuition_plans",
        "study_rooms",
      ])
    ) {
      throw error;
    }

    logSchemaCompatibilityFallback("students:list", error);

    const [settings, pointAggregates, compatibleStudents] = await Promise.all([
      settingsPromise,
      pointAggregatesPromise,
      readCompatibleStudents(prisma, divisionSlug, { schema: studentSchema }),
    ]);

    const pointTotals = new Map<string, number>(
      pointAggregates.map((record) => [record.studentId, record._sum.points ?? 0]),
    );

    return sortBySeatAndName(
      compatibleStudents.map((student) => {
        const netPoints = toNetPoints(pointTotals.get(student.id) ?? 0);
        return serializeCompatibleStudent(student, netPoints, getWarningStage(toDemeritPoints(netPoints), settings));
      }),
    );
  }

  const [settings, pointAggregates] = await Promise.all([
    settingsPromise,
    pointAggregatesPromise,
  ]);

  const pointTotals = new Map<string, number>(
    pointAggregates.map((record) => [record.studentId, record._sum.points ?? 0]),
  );

  return sortBySeatAndName(
    students.map((student) => {
      const netPoints = toNetPoints(pointTotals.get(student.id) ?? 0);
      return serializeDbStudent(student, netPoints, getWarningStage(toDemeritPoints(netPoints), settings));
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
  schema: StudentSchemaCompatibility,
  tuitionPlanId?: string | null,
  tuitionAmount?: number | null,
) {
  if (!schema.hasTuitionPlanId && tuitionPlanId) {
    throw badRequest("수강 플랜 저장을 사용하려면 DB 마이그레이션이 필요합니다.");
  }

  const normalizedAmount =
    typeof tuitionAmount === "number" && Number.isFinite(tuitionAmount)
      ? Math.max(0, Math.trunc(tuitionAmount))
      : null;

  if (!schema.hasTuitionAmount && normalizedAmount != null) {
    throw badRequest("수강 금액 저장을 사용하려면 DB 마이그레이션이 필요합니다.");
  }

  if (!tuitionPlanId) {
    return {
      tuitionPlanId: null,
      tuitionAmount: normalizedAmount,
    };
  }

  if (!schema.hasTuitionPlansTable) {
    throw badRequest("수강 플랜 조회를 사용하려면 DB 마이그레이션이 필요합니다.");
  }

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
    tuitionAmount: normalizedAmount ?? plan?.amount ?? null,
  };
}


export const listStudents = cache(async function listStudents(
  divisionSlug: string,
  options?: StudentPointMetricOptions,
): Promise<StudentListItem[]> {
  const students = await (isMockMode()
    ? getMockStudentsWithMetrics(divisionSlug, options)
    : getDbStudentsWithMetrics(divisionSlug, options));
  return applyPolicyPointMetrics(divisionSlug, students, options);
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
      tuitionExempt: student.tuitionExempt,
      tuitionExemptReason: student.tuitionExemptReason,
      status: student.status,
    }));
}

async function getStudentDetailLegacy(divisionSlug: string, studentId: string) {
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
  const studentSchema = await getStudentSchemaCompatibility();

  if (!supportsPrismaStudentRead(studentSchema)) {
    const [settings, compatibleRows, pointAggregate] = await Promise.all([
      getDivisionSettings(divisionSlug),
      readCompatibleStudents(prisma, divisionSlug, {
        studentId,
        schema: studentSchema,
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
    const raw = compatibleRows[0];

    if (!raw) {
      throw notFound("학생 정보를 찾을 수 없습니다.");
    }

    const netPoints = toNetPoints(pointAggregate._sum.points ?? 0);
    return serializeCompatibleStudent(raw, netPoints, getWarningStage(toDemeritPoints(netPoints), settings));
  }

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

    return serializeDbStudent(raw, netPoints, getWarningStage(toDemeritPoints(netPoints), settings));
  } catch (error) {
    if (
      !isPrismaSchemaMismatchError(error, [
        "students",
        "study_track",
        "course_start_date",
        "course_end_date",
        "tuition_plan_id",
        "tuition_amount",
        "tuition_exempt",
        "tuition_exempt_reason",
        "study_room_id",
        "tuition_plans",
        "study_rooms",
      ])
    ) {
      throw error;
    }

    logSchemaCompatibilityFallback("students:detail", error);
    const [settings, compatibleRows, pointAggregate] = await Promise.all([
      getDivisionSettings(divisionSlug),
      readCompatibleStudents(prisma, divisionSlug, {
        studentId,
        schema: studentSchema,
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
    const raw = compatibleRows[0];

    if (!raw) {
      throw notFound("학생 정보를 찾을 수 없습니다.");
    }

    const netPoints = toNetPoints(pointAggregate._sum.points ?? 0);
    return serializeCompatibleStudent(raw, netPoints, getWarningStage(toDemeritPoints(netPoints), settings));
  }
}

/**
 * 학생 1명을 생성하고 id만 돌려준다.
 * 일괄 등록은 학생마다 상세 조회를 다시 하지 않도록 이 함수를 직접 사용한다.
 */
async function createStudentRecord(
  divisionSlug: string,
  input: StudentUpsertInput,
  options?: { skipRevalidate?: boolean },
): Promise<{ id: string }> {
  const name = normalizeText(input.name);
  const studentNumber = normalizeText(input.studentNumber);
  const studyTrack = normalizeOptionalText(input.studyTrack);
  const phone = normalizeOptionalText(input.phone);
  const tuitionExempt = Boolean(input.tuitionExempt);
  const tuitionExemptReason = tuitionExempt ? normalizeOptionalText(input.tuitionExemptReason) : null;
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
        // 일괄 등록은 같은 밀리초에 여러 명을 만들므로 무작위 접미사로 ID 충돌을 막는다.
        id: `mock-student-${divisionSlug}-${Date.now()}-${randomUUID().slice(0, 8)}`,
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
        tuitionExempt,
        tuitionExemptReason,
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
    return { id: studentId };
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
  const studentSchema = await getStudentSchemaCompatibility();
  assertStudentWriteSchemaCompatibility(studentSchema, {
    studyTrack,
    courseStartDate,
    courseEndDate,
    tuitionExempt,
    tuitionExemptReason,
  });
  const tuition = await resolveDbTuitionPlan(
    division.id,
    studentSchema,
    input.tuitionPlanId,
    input.tuitionAmount,
  );

  const withdrawalFields = getCreatedWithdrawalFields(isWithdrawn);
  const legacyCreateData = {
    divisionId: division.id,
    name,
    studentNumber,
    phone,
    seatId,
    status,
    memo,
    ...withdrawalFields,
  };
  const modernCreateData = buildCompatibleStudentWriteData(
    legacyCreateData,
    {
      studyTrack,
      courseStartDate: courseStartDate ? parseDateString(courseStartDate) : null,
      courseEndDate: courseEndDate ? parseDateString(courseEndDate) : null,
      tuitionPlanId: tuition.tuitionPlanId,
      tuitionAmount: tuition.tuitionAmount,
      tuitionExempt,
      tuitionExemptReason,
    },
    studentSchema,
  );

  const student = await runStudentWriteWithFallback({
    scope: "students:create",
    runModern: () =>
      prisma.student.create({
        data: modernCreateData,
        select: {
          id: true,
        },
      }),
    runLegacy: async () => {
      const legacyStudentId = `student-${randomUUID()}`;
      const now = new Date();

      await prisma.$executeRaw`
        INSERT INTO study_hall.students (
          id,
          division_id,
          name,
          student_number,
          phone,
          seat_id,
          status,
          enrolled_at,
          withdrawn_at,
          withdrawn_note,
          memo,
          created_at,
          updated_at
        ) VALUES (
          ${legacyStudentId},
          ${division.id},
          ${name},
          ${studentNumber},
          ${phone},
          ${seatId},
          CAST(${status} AS "StudentStatus"),
          ${now},
          ${legacyCreateData.withdrawnAt},
          ${legacyCreateData.withdrawnNote},
          ${memo},
          ${now},
          ${now}
        )
      `;

      return { id: legacyStudentId };
    },
  });
  if (!options?.skipRevalidate) {
    revalidateDivisionOperationalViews(divisionSlug, { studentId: student.id });
  }

  return { id: student.id };
}

export async function createStudent(divisionSlug: string, input: StudentUpsertInput) {
  const { id } = await createStudentRecord(divisionSlug, input);
  return getStudentDetail(divisionSlug, id);
}

export type BulkStudentInputRow = {
  studentNumber: string;
  name: string;
  phone?: string | null;
  /** 좌석 라벨(예: "1", "A-01"). 비어 있으면 배정하지 않는다. */
  seatLabel?: string | null;
};

export type BulkStudentResultItem = {
  rowNumber: number;
  studentNumber: string;
  name: string;
  result: "CREATED" | "UPDATED" | "DUPLICATE" | "FAILED";
  message: string | null;
};

export type BulkStudentResult = {
  createdCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
  items: BulkStudentResultItem[];
};

/** 한 번에 등록할 수 있는 최대 인원. */
export const BULK_STUDENT_LIMIT = 500;

/**
 * 수험번호+이름 목록을 한 번에 등록한다.
 * 이미 등록된 수험번호는 건너뛰고(DUPLICATE), 실패한 행도 나머지 등록을 막지 않는다.
 * studyTrack은 등록하는 전원에게 같은 값으로 적용된다. 시험 템플릿이 직렬로
 * 응시 대상자를 고르므로, 이 값이 비면 성적 입력 화면에 학생이 뜨지 않을 수 있다.
 */
export async function createStudentsBulk(
  divisionSlug: string,
  rows: BulkStudentInputRow[],
  studyTrack?: string | null,
  options?: { overwriteExisting?: boolean },
): Promise<BulkStudentResult> {
  if (rows.length === 0) {
    throw badRequest("등록할 학생이 없습니다.");
  }

  if (rows.length > BULK_STUDENT_LIMIT) {
    throw badRequest(`한 번에 등록할 수 있는 인원은 ${BULK_STUDENT_LIMIT}명까지입니다.`);
  }

  const existing = await listStudents(divisionSlug);
  const takenNumbers = new Set(existing.map((student) => student.studentNumber));
  const existingByNumber = new Map(existing.map((student) => [student.studentNumber, student]));
  const overwriteExisting = options?.overwriteExisting ?? false;

  // 좌석은 라벨로 들어온다. 같은 라벨이 강의실 두 곳에 있으면 어느 쪽인지 고를 수 없으므로
  // 그 줄만 실패로 남기고 나머지는 진행한다 — 넘겨짚어 배정하면 엉뚱한 자리에 앉는다.
  const wantsSeat = rows.some((row) => normalizeText(row.seatLabel ?? "") !== "");
  const { listSeatOptions } = wantsSeat
    ? await import("@/lib/services/seat.service")
    : { listSeatOptions: null };
  const seatsByLabel = new Map<string, { id: string; studyRoomName: string; assignedStudentId: string | null }[]>();
  if (listSeatOptions) {
    for (const seat of await listSeatOptions(divisionSlug, { activeOnly: true })) {
      const key = seat.label.trim();
      if (!key) continue;
      seatsByLabel.set(key, [...(seatsByLabel.get(key) ?? []), seat]);
    }
  }
  /** 라벨 하나를 좌석 하나로 좁힌다. 못 좁히면 이유를 문장으로 돌려준다. */
  const resolveSeatLabel = (label: string, forStudentId?: string) => {
    const found = seatsByLabel.get(label) ?? [];
    if (found.length === 0) return { error: `좌석 «${label}» 을 찾을 수 없습니다.` };
    if (found.length > 1) {
      return { error: `좌석 «${label}» 이 ${found.map((s) => s.studyRoomName).join(", ")} 에 모두 있습니다. 강의실을 하나로 정해 주세요.` };
    }
    const [seat] = found;
    if (seat.assignedStudentId && seat.assignedStudentId !== forStudentId) {
      return { error: `좌석 «${label}» 은 이미 다른 학생이 쓰고 있습니다.` };
    }
    return { seatId: seat.id };
  };
  const items: BulkStudentResultItem[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const studentNumber = normalizeText(row.studentNumber);
    const name = normalizeText(row.name);
    const phone = normalizeOptionalText(row.phone ?? null);
    const seatLabel = normalizeText(row.seatLabel ?? "");
    const rowNumber = index + 1;
    const already = existingByNumber.get(studentNumber);
    const seat = seatLabel ? resolveSeatLabel(seatLabel, already?.id) : null;

    if (seat?.error) {
      failedCount += 1;
      items.push({ rowNumber, studentNumber, name, result: "FAILED", message: seat.error });
      continue;
    }

    // 이미 등록된 번호와 이번 요청 안에서 중복된 번호를 같은 방식으로 다룬다.
    if (takenNumbers.has(studentNumber)) {
      // 덮어쓰기가 아니거나 같은 붙여넣기 안에서 두 번 나온 줄이면 건너뛴다.
      // 두 번째 줄까지 반영하면 어느 쪽이 이겼는지 결과 표로 알 수 없다.
      if (!overwriteExisting || !already) {
        duplicateCount += 1;
        items.push({
          rowNumber,
          studentNumber,
          name,
          result: "DUPLICATE",
          message: overwriteExisting
            ? "붙여넣은 목록 안에서 중복된 수험번호입니다."
            : "이미 등록된 수험번호입니다.",
        });
        continue;
      }

      try {
        // 빈 연락처는 기존 값을 지우지 않는다. 연락처 없이 만든 명단을 다시 넣어
        // 이름만 고치는 경우가 있고, 그때 이미 받아 둔 번호가 사라지면 안 된다.
        await updateStudent(divisionSlug, already.id, {
          ...already,
          name,
          studentNumber,
          phone: phone ?? already.phone ?? null,
          studyTrack: studyTrack ?? already.studyTrack ?? null,
          seatId: seat?.seatId ?? already.seatId ?? null,
        });
        if (seat?.seatId) {
          seatsByLabel.set(seatLabel, (seatsByLabel.get(seatLabel) ?? []).map((s) => ({ ...s, assignedStudentId: already.id })));
        }
        existingByNumber.set(studentNumber, { ...already, name, phone: phone ?? already.phone ?? null });
        takenNumbers.add(studentNumber);
        updatedCount += 1;
        items.push({ rowNumber, studentNumber, name, result: "UPDATED", message: null });
      } catch (error) {
        failedCount += 1;
        items.push({
          rowNumber,
          studentNumber,
          name,
          result: "FAILED",
          message: error instanceof Error ? error.message : "수정에 실패했습니다.",
        });
      }
      continue;
    }

    try {
      await createStudentRecord(
        divisionSlug,
        { name, studentNumber, phone, seatId: seat?.seatId ?? null, studyTrack: studyTrack ?? null },
        { skipRevalidate: true },
      );
      // 같은 붙여넣기 안에서 같은 좌석을 두 번 쓰지 못하게 곧바로 찼다고 표시한다.
      if (seat?.seatId) {
        seatsByLabel.set(seatLabel, (seatsByLabel.get(seatLabel) ?? []).map((s) => ({ ...s, assignedStudentId: "just-assigned" })));
      }
      takenNumbers.add(studentNumber);
      createdCount += 1;
      items.push({ rowNumber, studentNumber, name, result: "CREATED", message: null });
    } catch (error) {
      failedCount += 1;
      items.push({
        rowNumber,
        studentNumber,
        name,
        result: "FAILED",
        message: error instanceof Error ? error.message : "등록에 실패했습니다.",
      });
    }
  }

  if (createdCount > 0 || updatedCount > 0) {
    revalidateDivisionOperationalViews(divisionSlug);
  }

  return { createdCount, updatedCount, duplicateCount, failedCount, items };
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
  const tuitionExempt = Boolean(input.tuitionExempt);
  const tuitionExemptReason = tuitionExempt ? normalizeOptionalText(input.tuitionExemptReason) : null;
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
              tuitionExempt,
              tuitionExemptReason,
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
  const studentSchema = await getStudentSchemaCompatibility();
  assertStudentWriteSchemaCompatibility(studentSchema, {
    studyTrack,
    courseStartDate,
    courseEndDate,
    tuitionExempt,
    tuitionExemptReason,
  });
  const tuition = await resolveDbTuitionPlan(
    division.id,
    studentSchema,
    input.tuitionPlanId,
    input.tuitionAmount,
  );

  const withdrawalFields = getUpdatedWithdrawalFields(isWithdrawn, student);
  const legacyUpdateData = {
    name,
    studentNumber,
    phone,
    seatId,
    status,
    memo,
    ...withdrawalFields,
  };
  const modernUpdateData = buildCompatibleStudentWriteData(
    legacyUpdateData,
    {
      studyTrack,
      courseStartDate: courseStartDate ? parseDateString(courseStartDate) : null,
      courseEndDate: courseEndDate ? parseDateString(courseEndDate) : null,
      tuitionPlanId: tuition.tuitionPlanId,
      tuitionAmount: tuition.tuitionAmount,
      tuitionExempt,
      tuitionExemptReason,
    },
    studentSchema,
  );

  await runStudentWriteWithFallback({
    scope: "students:update",
    runModern: () =>
      prisma.student.update({
        where: {
          id: studentId,
        },
        data: modernUpdateData,
        select: {
          id: true,
        },
      }),
    runLegacy: () =>
      prisma.$executeRaw`
        UPDATE study_hall.students
        SET
          name = ${name},
          student_number = ${studentNumber},
          phone = ${phone},
          seat_id = ${seatId},
          status = CAST(${status} AS "StudentStatus"),
          memo = ${memo},
          withdrawn_at = ${legacyUpdateData.withdrawnAt},
          withdrawn_note = ${legacyUpdateData.withdrawnNote},
          updated_at = ${new Date()}
        WHERE id = ${studentId}
          AND division_id = ${division.id}
      `.then(() => ({ id: studentId })),
  });
  revalidateDivisionOperationalViews(divisionSlug, { studentId });
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
    select: {
      id: true,
    },
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId });
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
    select: {
      id: true,
    },
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId });
  return getStudentDetail(divisionSlug, studentId);
}

/** 삭제 요청의 결과. 화면이 사실대로 말할 수 있도록 어느 쪽이었는지 돌려준다. */
export type DeleteStudentResult = {
  mode: "DELETED" | "WITHDRAWN";
  /** 퇴실로 돌아간 경우, 남아 있어서 지우지 않은 기록의 종류와 건수. */
  keptRecords: { label: string; count: number }[];
};

/**
 * 기록이 없으면 학생을 실제로 지우고, 있으면 퇴실 처리한다.
 *
 * 잘못 등록한 학생은 실제로 사라져야 한다 — 명단을 붙여넣다 오타가 나면 그 줄을 되돌릴
 * 방법이 있어야 하고, 지금까지는 "삭제했습니다" 라고 말한 뒤 퇴실 상태로 목록에 남았다.
 *
 * 반대로 출결·상벌점·성적이 쌓인 학생을 지우면 그 기록들이 함께 사라진다. 학생 한 명을
 * 정리하려다 그 반의 출석 통계가 바뀌는 일은 없어야 하므로, 그 경우에는 퇴실로 남기고
 * 무엇이 남았는지 돌려준다. 화면은 그 값으로 실제로 일어난 일을 말한다.
 */
export async function deleteStudent(
  divisionSlug: string,
  studentId: string,
): Promise<DeleteStudentResult> {
  const withdrawnNote = "관리자 삭제 요청으로 퇴실 처리됨";

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const current = state.studentsByDivision[divisionSlug] ?? [];
      const target = current.find((student) => student.id === studentId);
      if (!target) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      const slices: [string, unknown[] | undefined][] = [
        ["출결", state.attendanceByDivision[divisionSlug]],
        ["상벌점", state.pointRecordsByDivision[divisionSlug]],
        ["외출·휴가", state.leavePermissionsByDivision[divisionSlug]],
        ["면담", state.interviewsByDivision[divisionSlug]],
        ["수납", state.paymentRecordsByDivision[divisionSlug]],
        ["정기 성적", state.examScoresByDivision[divisionSlug]],
        ["아침 성적", state.morningExamScoresByDivision[divisionSlug]],
        ["휴대폰", state.phoneSubmissionsByDivision[divisionSlug]],
      ];
      const keptRecords = slices
        .map(([label, rows]) => ({
          label,
          count: (rows ?? []).filter((row) => (row as { studentId?: string }).studentId === studentId).length,
        }))
        .filter((entry) => entry.count > 0);

      if (keptRecords.length === 0) {
        state.studentsByDivision[divisionSlug] = current.filter((student) => student.id !== studentId);
        return { mode: "DELETED" as const, keptRecords };
      }

      state.studentsByDivision[divisionSlug] = current.map((student) =>
        student.id === studentId
          ? {
              ...student,
              status: "WITHDRAWN",
              withdrawnAt: new Date().toISOString(),
              withdrawnNote: student.withdrawnNote ?? withdrawnNote,
              // 목업 학생은 seatLabel 을 따로 들고 있고, 좌석 해석기가 seatId 가 비면
              // 그 라벨로 자리를 다시 찾는다. 둘 다 비워야 자리가 실제로 난다.
              seatId: null,
              seatLabel: null,
              updatedAt: new Date().toISOString(),
            }
          : student,
      );
      return { mode: "WITHDRAWN" as const, keptRecords };
    });
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
    where: { id: studentId, divisionId: division.id },
    select: {
      id: true,
      _count: {
        select: {
          attendanceRecords: true,
          pointRecords: true,
          leavePermissions: true,
          interviews: true,
          payments: true,
          examScores: true,
          morningExamScores: true,
          phoneSubmissions: true,
          warningNotices: true,
          scoreTargets: true,
        },
      },
    },
  });

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  const labels: Record<string, string> = {
    attendanceRecords: "출결",
    pointRecords: "상벌점",
    leavePermissions: "외출·휴가",
    interviews: "면담",
    payments: "수납",
    examScores: "정기 성적",
    morningExamScores: "아침 성적",
    phoneSubmissions: "휴대폰",
    warningNotices: "경고 통지",
    scoreTargets: "목표 점수",
  };
  const keptRecords = Object.entries(student._count)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ label: labels[key] ?? key, count }));

  if (keptRecords.length === 0) {
    await prisma.student.delete({ where: { id: studentId }, select: { id: true } });
    revalidateDivisionOperationalViews(divisionSlug, { studentId });
    return { mode: "DELETED", keptRecords };
  }

  await prisma.student.update({
    where: { id: studentId },
    data: {
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      withdrawnNote,
      seatId: null,
    },
    select: { id: true },
  });
  revalidateDivisionOperationalViews(divisionSlug, { studentId });
  return { mode: "WITHDRAWN", keptRecords };
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
    select: {
      id: true,
    },
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId });
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

async function applyPolicyPointMetrics(divisionSlug: string, students: StudentListItem[], options?: StudentPointMetricOptions): Promise<StudentListItem[]> {
  const month = kstMonthBounds();
  const totals = await getPolicyPointTotals(divisionSlug, {
    dateFrom: options?.pointDateFrom ?? month.dateFrom,
    dateTo: options?.pointDateTo ?? month.dateTo,
  });
  if (!totals) return students;
  // Warnings always use the current management month, even when viewing old rewards.
  const warningTotals = options?.pointDateFrom || options?.pointDateTo
    ? await getPolicyPointTotals(divisionSlug) : totals;
  const [settings, policy] = await Promise.all([getDivisionSettings(divisionSlug), getManagementPolicy(divisionSlug)]);
  const holidayUsage = await getPolicyHolidayUsage(divisionSlug, options?.pointDateFrom ?? month.dateFrom, options?.pointDateTo ?? month.dateTo);
  return students.map((student) => {
    const t = totals.get(student.id) ?? { merit: 0, demerit: 0 };
    const warningStage = getWarningStage(warningTotals?.get(student.id)?.demerit ?? 0, settings);
    return { ...student, netPoints: t.merit, meritPoints: t.merit, demeritPoints: t.demerit, unusedHolidayCount: Math.max(0, settings.holidayLimit - (holidayUsage.get(student.id) ?? 0)),
      warningStage, warningStageLabel: policy?.warningLabels[warningStage], warningStageLabels: policy?.warningLabels };
  });
}

export async function getStudentDetail(divisionSlug: string, studentId: string): Promise<StudentDetail> {
  const student = await getStudentDetailLegacy(divisionSlug, studentId);
  return (await applyPolicyPointMetrics(divisionSlug, [student]))[0];
}
