import { randomUUID } from "node:crypto";
import { getPeriods, type PeriodRecord } from "@/lib/services/period.service";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { isControlledPeriod, isPolicyEffective, isHealthLeaveExempt, kstDate, type ManagementPolicy } from "@/lib/management-policy";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getMockAdminSession, getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { normalizeYmMonth, parseUtcDateFromYmd } from "@/lib/date-utils";
import { badRequest, conflict, notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockAttendanceRecord,
  type MockAttendanceStatus,
  type MockLeavePermissionRecord,
  type MockPointRecordRecord,
} from "@/lib/mock-store";
import type {
  LeavePermissionSchemaInput,
  LeaveSettlementSchemaInput,
} from "@/lib/leave-schemas";
import type { LeaveStatusValue, LeaveTypeValue } from "@/lib/leave-meta";
import { getPrismaClient, normalizeOptionalText } from "@/lib/service-helpers";
import { syncAttendanceDerivedPoints } from "@/lib/services/attendance.service";
import { getDivisionSettings } from "@/lib/services/settings.service";

type LeaveActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  name?: string;
};

type LeavePrismaClient = Awaited<ReturnType<typeof getPrismaClient>> | Prisma.TransactionClient;

type AttendanceStatus =
  | "PRESENT"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE";

const leaveAttendanceSnapshotSchema = z.object({
  version: z.literal(1),
  cells: z.array(z.object({
    periodId: z.string(),
    appliedAt: z.string(),
    previous: z.object({
      status: z.enum(["PRESENT", "TARDY", "ABSENT", "EXCUSED", "HOLIDAY", "HALF_HOLIDAY", "NOT_APPLICABLE"]),
      examAutoSource: z.string().nullable().optional(),
      reason: z.string().nullable(), checkInTime: z.string().nullable(), recordedById: z.string().nullable(),
    }).nullable(),
  })),
});
type LeaveAttendanceSnapshot = z.infer<typeof leaveAttendanceSnapshotSchema>;
function previousAttendance(record?: {examAutoSource?: string | null; status: AttendanceStatus; reason: string | null; checkInTime?: Date | string | null; recordedById: string | null}) {
  return record ? {examAutoSource: record.examAutoSource ?? null, status: record.status, reason: record.reason, checkInTime: record.checkInTime instanceof Date ? record.checkInTime.toISOString() : record.checkInTime ?? null, recordedById: record.recordedById} : null;
}

export type LeavePermissionItem = {
  automationWarnings?: string[];
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  type: LeaveTypeValue;
  date: string;
  reason: string | null;
  approvedById: string;
  approvedByName: string;
  status: LeaveStatusValue;
  createdAt: string;
};

export type LeaveSettlementPreviewItem = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  studyTrack: string | null;
  holidayUsed: number;
  holidayRemaining: number;
  halfDayUsed: number;
  halfDayRemaining: number;
  healthUsed: number;
  healthRemaining: number;
  rewardPoints: number;
  isSettled: boolean;
};

export type LeaveSettlementPreviewResult = {
  month: string;
  isClosedMonth: boolean;
  items: LeaveSettlementPreviewItem[];
  totalRewardPoints: number;
  grantableCount: number;
  alreadySettledCount: number;
};

export type LeaveSettlementResult = {
  month: string;
  createdCount: number;
  skippedCount: number;
  totalRewardPoints: number;
};

function parseDateString(value: string) {
  return parseUtcDateFromYmd(value, "휴가 날짜");
}

function toDateString(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function getMonthRange(month: string) {
  const normalizedMonth = normalizeYmMonth(month, "정산 대상 월");
  const [year, monthValue] = normalizedMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthValue - 1, 1));
  const end = new Date(Date.UTC(year, monthValue, 1));
  return { normalizedMonth, start, end };
}

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getCurrentMonth() {
  return getKstToday().slice(0, 7);
}

function getLeaveLimit(
  type: LeaveTypeValue,
  settings: { holidayLimit: number; halfDayLimit: number; healthLimit: number },
) {
  switch (type) {
    case "HOLIDAY":
      return settings.holidayLimit;
    case "HALF_DAY":
      return settings.halfDayLimit;
    case "HEALTH":
      return settings.healthLimit;
    default:
      return null;
  }
}

function getLeaveLimitLabel(type: LeaveTypeValue) {
  switch (type) {
    case "HOLIDAY":
      return "휴가";
    case "HALF_DAY":
      return "반차";
    case "HEALTH":
      return "병가";
    default:
      return "외출";
  }
}

function assertLeaveLimitNotExceeded(
  type: LeaveTypeValue,
  usedCount: number,
  settings: { holidayLimit: number; halfDayLimit: number; healthLimit: number },
) {
  const limit = getLeaveLimit(type, settings);

  if (limit === null) {
    return;
  }

  if (usedCount >= limit) {
    throw badRequest(`${getLeaveLimitLabel(type)} 월 한도를 초과했습니다. (${usedCount}/${limit})`);
  }
}

function isLeaveWriteConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

function getLeaveStatus(type: LeaveTypeValue, date: string) {
  const today = getKstToday();

  if (type === "OUTING" && date <= today) {
    return "USED";
  }

  return date < today ? "USED" : "APPROVED";
}

function normalizeLeaveStatus(status: string | null | undefined): LeaveStatusValue {
  switch (status) {
    case "APPROVED":
    case "USED":
    case "REJECTED":
    case "PENDING":
      return status;
    case "CANCELLED":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

function isInactiveLeaveStatus(status: string | null | undefined) {
  return normalizeLeaveStatus(status) === "REJECTED";
}

function isCancelableLeaveStatus(status: string | null | undefined) {
  const normalizedStatus = normalizeLeaveStatus(status);
  return normalizedStatus === "APPROVED" || normalizedStatus === "USED";
}

function getAttendanceStatusForLeaveType(type: LeaveTypeValue): AttendanceStatus | null {
  switch (type) {
    case "HOLIDAY":
    case "HEALTH":
      return "HOLIDAY";
    case "HALF_DAY":
      return "HALF_HOLIDAY";
    default:
      return null;
  }
}

function buildMockAttendanceId(studentId: string, periodId: string, date: string) {
  return `mock-attendance-${studentId}-${periodId}-${date}`;
}

function buildAttendanceReason(type: LeaveTypeValue, reason: string | null) {
  const prefix =
    type === "OUTING" ? "외출 승인" : type === "HALF_DAY" ? "반차 승인" : "휴가 승인";
  return reason ? `${prefix} · ${reason}` : prefix;
}

function getTargetLeavePeriods<T extends { id: string; isMandatory: boolean; displayOrder: number }>(
  periods: T[],
  input: Pick<LeavePermissionSchemaInput, "studentId" | "date" | "type">,
  policy: ManagementPolicy | null,
) {
  const applicable = periods.filter((period) => isPolicyEffective(policy, input.date)
    ? isControlledPeriod(policy, period.id, input.date, input.studentId)
    : period.isMandatory).sort((left, right) => left.displayOrder - right.displayOrder);
  // Existing policies retain three periods until the academy changes its count.
  const halfDayCount = isPolicyEffective(policy, input.date) ? policy.halfDayPeriodCount ?? 3 : 3;
  const selected = input.type === "HALF_DAY" ? applicable.slice(0, halfDayCount) : applicable;
  const exam = isPolicyEffective(policy, input.date) && policy.morningExam.syncAttendance
    ? periods.find(p => p.id === policy.morningExam.periodId) : null;
  // The exam is excluded from the normal half-day allowance, but covered when
  // it falls inside the approved morning span (or a full-day leave).
  if (exam && !selected.some(p => p.id === exam.id) && (input.type !== "HALF_DAY" || selected.some(p => p.displayOrder >= exam.displayOrder))) return [exam, ...selected].sort((a,b)=>a.displayOrder-b.displayOrder);
  return selected;
}

function buildSettlementNote(month: string) {
  return `[자동정산][휴가정산:${month}] ${month} 미사용 휴가/반차 정산`;
}

function getSettlementDate(month: string) {
  const { normalizedMonth } = getMonthRange(month);
  const [year, monthValue] = normalizedMonth.split("-").map(Number);
  return new Date(Date.UTC(year, monthValue, 0));
}

function serializeLeaveRecord(
  record: {
    id: string;
    studentId: string;
    type: LeaveTypeValue;
    date: string | Date;
    reason: string | null;
    approvedById: string;
    status: string;
    createdAt: string | Date;
  },
  student: {
    id: string;
    name: string;
    studentNumber: string;
  },
  approvedByName: string,
) {
  return {
    id: record.id,
    studentId: student.id,
    studentName: student.name,
    studentNumber: student.studentNumber,
    type: record.type,
    date: toDateString(record.date),
    reason: record.reason,
    approvedById: record.approvedById,
    approvedByName,
    status: normalizeLeaveStatus(record.status),
    createdAt:
      typeof record.createdAt === "string" ? record.createdAt : record.createdAt.toISOString(),
  } satisfies LeavePermissionItem;
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

async function applyMockLeaveAttendance(
  divisionSlug: string,
  state: Awaited<ReturnType<typeof readMockState>>,
  actorId: string,
  input: LeavePermissionSchemaInput,
  policy: ManagementPolicy | null,
  periods: PeriodRecord[],
) {
  const snapshot: LeaveAttendanceSnapshot = {version: 1, cells: []};
  const attendanceStatus = getAttendanceStatusForLeaveType(input.type);

  if (!attendanceStatus) {
    return snapshot;
  }

  const targetPeriods = getTargetLeavePeriods(
    periods.filter((period) => period.isActive), input, policy,
  );

  if (targetPeriods.length === 0) {
    return snapshot;
  }

  const current = new Map(
    (state.attendanceByDivision[divisionSlug] ?? []).map((record) => [buildMockAttendanceId(record.studentId, record.periodId, record.date), record]),
  );
  const now = new Date().toISOString();

  for (const period of targetPeriods) {
    const id = buildMockAttendanceId(input.studentId, period.id, input.date);
    const existing = current.get(id);
    snapshot.cells.push({periodId: period.id, appliedAt: now, previous: previousAttendance(existing)});

    current.set(id, {
      id: existing?.id ?? id,
      studentId: input.studentId,
      periodId: period.id,
      date: input.date,
      status: attendanceStatus as MockAttendanceStatus,
      reason: buildAttendanceReason(input.type, normalizeOptionalText(input.reason)),
      checkInTime: null,
      recordedById: actorId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies MockAttendanceRecord);
  }

  state.attendanceByDivision[divisionSlug] = Array.from(current.values());
  return snapshot;
}

async function applyDbLeaveAttendanceWithTx(
  tx: LeavePrismaClient,
  divisionId: string,
  actorId: string,
  input: LeavePermissionSchemaInput,
  policy: ManagementPolicy | null,
  periods: PeriodRecord[],
) {
  const snapshot: LeaveAttendanceSnapshot = {version: 1, cells: []};
  const attendanceStatus = getAttendanceStatusForLeaveType(input.type);

  if (!attendanceStatus) {
    return snapshot;
  }

  const targetPeriods = getTargetLeavePeriods(periods.filter(period => period.isActive), input, policy);

  if (targetPeriods.length === 0) {
    return snapshot;
  }

  const targetDate = parseDateString(input.date);
  const attendanceReason = buildAttendanceReason(input.type, normalizeOptionalText(input.reason));

  const previous = await tx.attendance.findMany({where: {studentId: input.studentId, student: {divisionId}, date: targetDate, periodId: {in: targetPeriods.map(period=>period.id)}}});
  for (const period of targetPeriods) {
      const applied = await tx.attendance.upsert({
        where: {
          studentId_periodId_date: {
            studentId: input.studentId,
            periodId: period.id,
            date: targetDate,
          },
        },
        update: {
          status: attendanceStatus,
          examAutoSource: null,
          reason: attendanceReason,
          checkInTime: null,
          recordedById: actorId,
        },
        create: {
          studentId: input.studentId,
          periodId: period.id,
          date: targetDate,
          status: attendanceStatus,
          examAutoSource: null,
          reason: attendanceReason,
          checkInTime: null,
          recordedById: actorId,
        },
      });
      snapshot.cells.push({periodId: period.id, appliedAt: applied.updatedAt.toISOString(), previous: previousAttendance(previous.find(row=>row.periodId===period.id))});
  }
  return snapshot;
}

async function revertMockLeaveAttendance(
  divisionSlug: string,
  state: Awaited<ReturnType<typeof readMockState>>,
  input: {
    studentId: string;
    type: LeaveTypeValue;
    date: string;
    reason: string | null;
    attendanceSnapshot?: unknown;
  },
  policy: ManagementPolicy | null,
  periods: PeriodRecord[],
) {
  if (input.attendanceSnapshot != null) {
    const snapshot = leaveAttendanceSnapshotSchema.parse(input.attendanceSnapshot);
    const records = state.attendanceByDivision[divisionSlug] ?? [];
    for (const cell of snapshot.cells) {
      const index = records.findIndex(row=>row.studentId===input.studentId && row.date===input.date && row.periodId===cell.periodId);
      const current = records[index];
      if (!current || current.updatedAt !== cell.appliedAt || current.status !== getAttendanceStatusForLeaveType(input.type) || current.reason !== buildAttendanceReason(input.type, input.reason)) continue;
      if (cell.previous) records[index] = {...current, ...cell.previous, updatedAt: new Date().toISOString()};
      else records.splice(index, 1);
    }
    state.attendanceByDivision[divisionSlug] = records;
    return;
  }
  const attendanceStatus = getAttendanceStatusForLeaveType(input.type);

  if (!attendanceStatus) {
    return;
  }

  const targetPeriods = getTargetLeavePeriods(
    periods.filter((period) => period.isActive), input, policy,
  );

  if (targetPeriods.length === 0) {
    return;
  }

  const targetPeriodIds = new Set(targetPeriods.map((period) => period.id));
  const attendanceReason = buildAttendanceReason(input.type, input.reason);

  state.attendanceByDivision[divisionSlug] = (state.attendanceByDivision[divisionSlug] ?? []).filter(
    (record) =>
      !(
        record.studentId === input.studentId &&
        record.date === input.date &&
        targetPeriodIds.has(record.periodId) &&
        record.status === attendanceStatus &&
        record.reason === attendanceReason
      ),
  );
}

async function revertDbLeaveAttendance(
  tx: LeavePrismaClient,
  divisionId: string,
  input: {
    studentId: string;
    type: LeaveTypeValue;
    date: string;
    reason: string | null;
    attendanceSnapshot?: unknown;
  },
  policy: ManagementPolicy | null,
  periods: PeriodRecord[],
) {
  if (input.attendanceSnapshot != null) {
    const snapshot = leaveAttendanceSnapshotSchema.parse(input.attendanceSnapshot);
    for (const cell of snapshot.cells) {
      const where = {studentId: input.studentId, student: {divisionId}, date: parseDateString(input.date), periodId: cell.periodId,
        status: getAttendanceStatusForLeaveType(input.type)!, reason: buildAttendanceReason(input.type, input.reason), updatedAt: new Date(cell.appliedAt)};
      if (cell.previous) await tx.attendance.updateMany({where, data: {...cell.previous, checkInTime: cell.previous.checkInTime ? new Date(cell.previous.checkInTime) : null}});
      else await tx.attendance.deleteMany({where});
    }
    return;
  }
  const attendanceStatus = getAttendanceStatusForLeaveType(input.type);

  if (!attendanceStatus) {
    return;
  }

  const targetPeriods = getTargetLeavePeriods(periods.filter(period => period.isActive), input, policy);

  if (targetPeriods.length === 0) {
    return;
  }

  await tx.attendance.deleteMany({
    where: {
      studentId: input.studentId,
      date: parseDateString(input.date),
      periodId: {
        in: targetPeriods.map((period) => period.id),
      },
      status: attendanceStatus,
          examAutoSource: null,
      reason: buildAttendanceReason(input.type, input.reason),
    },
  });
}

function buildLeaveSettlementPreviewItems(args: {
  students: Array<{
    id: string;
    name: string;
    studentNumber: string;
    studyTrack: string | null;
    status: string;
    courseStartDate: Date | string | null;
    courseEndDate: Date | string | null;
    enrolledAt: Date | string;
  }>;
  permissions: Array<{
    studentId: string;
    type: LeaveTypeValue;
    status: string;
  }>;
  settledStudentIds: Set<string>;
  holidayLimit: number;
  halfDayLimit: number;
  healthLimit: number;
  holidayUnusedPts: number;
  halfDayUnusedPts: number;
  monthStart: string;
  monthEnd: string;
  recognizedHealth: boolean;
}) {
  return args.students
    .filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE")
    .filter((student) => {
      const start = student.courseStartDate
        ? toDateString(student.courseStartDate)
        : kstDate(new Date(student.enrolledAt));
      return start <= args.monthEnd &&
        (!student.courseEndDate || toDateString(student.courseEndDate) >= args.monthStart);
    })
    .map((student) => {
      const records = args.permissions.filter(
        (permission) => permission.studentId === student.id && !isInactiveLeaveStatus(permission.status),
      );
      const holidayUsed = records.filter((permission) => permission.type === "HOLIDAY").length;
      const halfDayUsed = records.filter((permission) => permission.type === "HALF_DAY").length;
      const healthUsed = records.filter((permission) => permission.type === "HEALTH").length;
      const holidayRemaining = Math.max(
        args.holidayLimit - holidayUsed - (args.recognizedHealth ? 0 : healthUsed), 0,
      );
      const halfDayRemaining = Math.max(args.halfDayLimit - halfDayUsed, 0);
      const healthRemaining = Math.max(args.healthLimit - healthUsed, 0);
      const rewardPoints =
        holidayRemaining * args.holidayUnusedPts + halfDayRemaining * args.halfDayUnusedPts;

      return {
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.studentNumber,
        studyTrack: student.studyTrack,
        holidayUsed,
        holidayRemaining,
        halfDayUsed,
        halfDayRemaining,
        healthUsed,
        healthRemaining,
        rewardPoints,
        isSettled: args.settledStudentIds.has(student.id),
      } satisfies LeaveSettlementPreviewItem;
    })
    .filter((item) => item.rewardPoints > 0)
    .sort(
      (left, right) =>
        right.rewardPoints - left.rewardPoints ||
        left.studentNumber.localeCompare(right.studentNumber, "ko"),
    );
}

export async function listLeavePermissions(
  divisionSlug: string,
  options?: {
    studentId?: string;
    month?: string;
    limit?: number;
  },
) {
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 500);

  if (isMockMode()) {
    const state = await readMockState();
    const students = new Map(
      (state.studentsByDivision[divisionSlug] ?? []).map((student) => [student.id, student]),
    );

    return (state.leavePermissionsByDivision[divisionSlug] ?? [])
      .filter((record) => !options?.studentId || record.studentId === options.studentId)
      .filter((record) => !options?.month || record.date.startsWith(options.month))
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .slice(0, limit)
      .map((record) =>
        serializeLeaveRecord(
          record,
          students.get(record.studentId) ??
            (() => {
              throw notFound("학생 정보를 찾을 수 없습니다.");
            })(),
          getMockAdminSession(divisionSlug).name,
        ),
      )
      ;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const monthRange = options?.month ? getMonthRange(options.month) : null;
  const permissions = await prisma.leavePermission.findMany({
    where: {
      student: {
        divisionId: division.id,
      },
      ...(options?.studentId ? { studentId: options.studentId } : {}),
      ...(monthRange
        ? {
            date: {
              gte: monthRange.start,
              lt: monthRange.end,
            },
          }
        : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          studentNumber: true,
        },
      },
      approvedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return permissions.map((record) => serializeLeaveRecord(record, record.student, record.approvedBy.name));
}

export async function createLeavePermission(
  divisionSlug: string,
  actor: LeaveActor,
  input: LeavePermissionSchemaInput,
) {
  const leaveDate = parseDateString(input.date);
  const reason = normalizeOptionalText(input.reason);
  const [policy, periods] = await Promise.all([getManagementPolicy(divisionSlug, input.date), getPeriods(divisionSlug, input.date)]);
  if (isPolicyEffective(policy, input.date) && policy.holidayPriorNotice && input.type === "HOLIDAY" && input.date <= kstDate() && !reason) {
    throw badRequest("휴일권은 전일까지 통보해야 합니다. 당일·사후 승인이라면 질병·사고 등 예외 인정 사유를 기록해 주세요.");
  }
  if (isPolicyEffective(policy, input.date) && input.type === "HEALTH" && !reason) throw badRequest("질병·건강 인정사유와 확인 내용을 기록해 주세요.");
  const status = getLeaveStatus(input.type, input.date);
  const settings = await getDivisionSettings(divisionSlug, input.date);

  if (isMockMode()) {
    const record = await updateMockState(async (state) => {
      const division = getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      const student = (state.studentsByDivision[divisionSlug] ?? []).find(
        (item) => item.id === input.studentId,
      );

      if (!student) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      if (student.status === "WITHDRAWN" || student.status === "GRADUATED") {
        throw badRequest("퇴실 또는 수료 처리된 학생에게는 외출/휴가를 등록할 수 없습니다.");
      }

      const duplicated = (state.leavePermissionsByDivision[divisionSlug] ?? []).some(
        (saved) =>
          saved.studentId === input.studentId &&
          saved.date === input.date &&
          !isInactiveLeaveStatus(saved.status),
      );

      if (duplicated) {
        throw conflict("해당 날짜에는 이미 휴가가 등록되어 있습니다.");
      }

      const monthPrefix = input.date.slice(0, 7);
      const usedCount = (state.leavePermissionsByDivision[divisionSlug] ?? []).filter(
        (saved) =>
          saved.studentId === input.studentId &&
          saved.type === input.type &&
          saved.date.startsWith(monthPrefix) &&
          !isInactiveLeaveStatus(saved.status),
      ).length;
      if (!(isHealthLeaveExempt(policy, input.date) && input.type === "HEALTH")) assertLeaveLimitNotExceeded(input.type, usedCount, settings);

      const nextRecord: MockLeavePermissionRecord = {
        id: `mock-leave-${divisionSlug}-${randomUUID()}`,
        studentId: input.studentId,
        type: input.type,
        date: input.date,
        reason,
        approvedById: actor.id,
        status,
        createdAt: new Date().toISOString(),
      };

      state.leavePermissionsByDivision[divisionSlug] = [
        nextRecord,
        ...(state.leavePermissionsByDivision[divisionSlug] ?? []),
      ];
      nextRecord.attendanceSnapshot = await applyMockLeaveAttendance(divisionSlug, state, actor.id, {
        ...input,
        reason,
      }, policy, periods);

      await reconcileLeaveSettlementAfterChange(divisionSlug, nextRecord.id, actor.id, input.date, input.type, {state});
      return nextRecord;
    });

    const automationWarnings = getAttendanceStatusForLeaveType(input.type)
      ? (await syncAttendanceDerivedPoints(divisionSlug, input.date, actor.id)) ?? [] : [];

    const mockState = await readMockState();
    const mockStudent = (mockState.studentsByDivision[divisionSlug] ?? []).find(
      (s) => s.id === record.studentId,
    );
    if (!mockStudent) return null;
    return { ...serializeLeaveRecord(record, mockStudent, getMockAdminSession(divisionSlug).name), automationWarnings };
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const { start: monthStart, end: monthEnd } = getMonthRange(input.date.slice(0, 7));

  const permission = await prisma.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: {
          id: input.studentId,
          divisionId: division.id,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!student) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      if (student.status === "WITHDRAWN" || student.status === "GRADUATED") {
        throw badRequest("퇴실 또는 수료 처리된 학생에게는 외출/휴가를 등록할 수 없습니다.");
      }

      const duplicated = await tx.leavePermission.findFirst({
        where: {
          studentId: input.studentId,
          student: {
            divisionId: division.id,
          },
          date: leaveDate,
          status: {
            notIn: ["REJECTED"],
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicated) {
        throw conflict("해당 날짜에는 이미 휴가가 등록되어 있습니다.");
      }

      const usedCount = await tx.leavePermission.count({
        where: {
          studentId: input.studentId,
          type: input.type,
          date: {
            gte: monthStart,
            lt: monthEnd,
          },
          status: {
            notIn: ["REJECTED"],
          },
          student: {
            divisionId: division.id,
          },
        },
      });
      if (!(isHealthLeaveExempt(policy, input.date) && input.type === "HEALTH")) assertLeaveLimitNotExceeded(input.type, usedCount, settings);

      const created = await tx.leavePermission.create({
        data: {
          studentId: input.studentId,
          type: input.type,
          date: leaveDate,
          reason,
          approvedById: actor.id,
          status,
        },
      });

      const attendanceSnapshot = await applyDbLeaveAttendanceWithTx(tx, division.id, actor.id, {
        ...input,
        reason,
      }, policy, periods);

      await tx.leavePermission.update({where: {id: created.id}, data: {attendanceSnapshot}});

      await reconcileLeaveSettlementAfterChange(divisionSlug, created.id, actor.id, input.date, input.type, {tx});
      return created;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }).catch((error) => {
      if (isLeaveWriteConflict(error)) {
        throw conflict("같은 날짜의 휴가가 이미 등록되었거나 동시에 처리 중입니다.");
      }

      throw error;
    });

  const automationWarnings = getAttendanceStatusForLeaveType(input.type)
    ? (await syncAttendanceDerivedPoints(divisionSlug, input.date, actor.id)) ?? [] : [];

  const createdPermission = await prisma.leavePermission.findUnique({
    where: { id: permission.id },
    include: {
      student: { select: { id: true, name: true, studentNumber: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!createdPermission) return null;
  revalidateDivisionOperationalViews(divisionSlug, { studentId: input.studentId });
  return { ...serializeLeaveRecord(createdPermission, createdPermission.student, createdPermission.approvedBy.name), automationWarnings };
}

export async function cancelLeavePermission(
  divisionSlug: string,
  leavePermissionId: string,
  actor: LeaveActor,
) {
  if (isMockMode()) {
    // Resolve outside the mock-store write lock; the record date is immutable.
    const existing = (await readMockState()).leavePermissionsByDivision[divisionSlug]?.find(row => row.id === leavePermissionId);
    if (!existing) throw notFound("외출/휴가 승인 내역을 찾을 수 없습니다.");
    const [policy, periods] = await Promise.all([getManagementPolicy(divisionSlug, existing.date), getPeriods(divisionSlug, existing.date)]);
    const result = await updateMockState(async (state) => {
      const records = state.leavePermissionsByDivision[divisionSlug] ?? [];
      const record = records.find((item) => item.id === leavePermissionId);

      if (!record) {
        throw notFound("외출/휴가 승인 내역을 찾을 수 없습니다.");
      }

      if (isInactiveLeaveStatus(record.status)) {
        throw badRequest("이미 취소 처리된 외출/휴가입니다.");
      }

      if (!isCancelableLeaveStatus(record.status)) {
        throw badRequest("승인된 외출/휴가만 취소할 수 있습니다.");
      }

      await revertMockLeaveAttendance(divisionSlug, state, {
        studentId: record.studentId,
        type: record.type,
        date: record.date,
        reason: record.reason,
        attendanceSnapshot: record.attendanceSnapshot,
      }, policy, periods);

      record.status = "REJECTED";
      await reconcileLeaveSettlementAfterChange(divisionSlug, record.id, actor.id, record.date, record.type, {state});

      const student = (state.studentsByDivision[divisionSlug] ?? []).find(
        (item) => item.id === record.studentId,
      );

      if (!student) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      return {
        record,
        student,
      };
    });

    const automationWarnings = getAttendanceStatusForLeaveType(result.record.type)
      ? (await syncAttendanceDerivedPoints(divisionSlug, result.record.date, actor.id)) ?? [] : [];

    revalidateDivisionOperationalViews(divisionSlug, { studentId: result.record.studentId });
    return { ...serializeLeaveRecord(result.record, result.student, getMockAdminSession(divisionSlug).name), automationWarnings };
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const updatedPermission = await prisma.$transaction(async (tx) => {
    const permission = await tx.leavePermission.findFirst({
      where: {
        id: leavePermissionId,
        student: {
          divisionId: division.id,
        },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            studentNumber: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!permission) {
      throw notFound("외출/휴가 승인 내역을 찾을 수 없습니다.");
    }

    if (isInactiveLeaveStatus(permission.status)) {
      throw badRequest("이미 취소 처리된 외출/휴가입니다.");
    }

    if (!isCancelableLeaveStatus(permission.status)) {
      throw badRequest("승인된 외출/휴가만 취소할 수 있습니다.");
    }

    const [policy, periods] = await Promise.all([getManagementPolicy(divisionSlug, toDateString(permission.date)), getPeriods(divisionSlug, toDateString(permission.date))]);
    await revertDbLeaveAttendance(tx, division.id, {
      studentId: permission.studentId,
      type: permission.type,
      date: toDateString(permission.date),
      reason: permission.reason,
      attendanceSnapshot: permission.attendanceSnapshot,
    }, policy, periods);

    const cancelled = await tx.leavePermission.update({
      where: {
        id: permission.id,
      },
      data: {
        status: "REJECTED",
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            studentNumber: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    await reconcileLeaveSettlementAfterChange(divisionSlug, permission.id, actor.id, toDateString(permission.date), permission.type, {tx});
    return cancelled;
  }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});

  const automationWarnings = getAttendanceStatusForLeaveType(updatedPermission.type)
    ? (await syncAttendanceDerivedPoints(divisionSlug, toDateString(updatedPermission.date), actor.id)) ?? [] : [];

  revalidateDivisionOperationalViews(divisionSlug, { studentId: updatedPermission.studentId });
  return { ...serializeLeaveRecord(
    updatedPermission,
    updatedPermission.student,
    updatedPermission.approvedBy.name,
  ), automationWarnings };
}

// Retry derived calculations without registering/cancelling the leave again.
export async function retryLeaveAutomation(divisionSlug: string, permissionId: string, actor: LeaveActor) {
  let date: string;
  let studentId: string;
  if (isMockMode()) {
    const state = await readMockState();
    const permission = (state.leavePermissionsByDivision[divisionSlug] ?? []).find(record => record.id === permissionId);
    if (!permission) throw notFound("외출/휴가 내역을 찾을 수 없습니다.");
    date = permission.date;
    studentId = permission.studentId;
  } else {
    const division = await getDivisionOrThrow(divisionSlug);
    const prisma = await getPrismaClient();
    const permission = await prisma.leavePermission.findFirst({
      where: { id: permissionId, student: { divisionId: division.id } },
    });
    if (!permission) throw notFound("외출/휴가 내역을 찾을 수 없습니다.");
    date = toDateString(permission.date);
    studentId = permission.studentId;
  }
  const automationWarnings = (await syncAttendanceDerivedPoints(divisionSlug, date, actor.id)) ?? [];
  revalidateDivisionOperationalViews(divisionSlug, { studentId });
  return { automationWarnings };
}

export async function previewLeaveSettlement(
  divisionSlug: string,
  input: LeaveSettlementSchemaInput,
  options: { activeOnly?: boolean } = {},
) {
  const { normalizedMonth, start, end } = getMonthRange(input.month);
  const settlementNote = buildSettlementNote(normalizedMonth);
  const settlementDate = toDateString(getSettlementDate(normalizedMonth));
  const settings = await getDivisionSettings(divisionSlug, settlementDate);
  const isClosedMonth = normalizedMonth < getCurrentMonth();
  const policy = await getManagementPolicy(divisionSlug, settlementDate);
  const settlementPeriod = {
    monthStart: toDateString(start),
    monthEnd: toDateString(getSettlementDate(normalizedMonth)),
    recognizedHealth: isHealthLeaveExempt(policy, toDateString(getSettlementDate(normalizedMonth))),
  };

  if (isMockMode()) {
    const state = await readMockState();
    const students = (state.studentsByDivision[divisionSlug] ?? []).filter(student=>!options.activeOnly || student.status === "ACTIVE");
    const permissions = (state.leavePermissionsByDivision[divisionSlug] ?? [])
      .filter((permission) => permission.date.startsWith(normalizedMonth))
      .map((permission) => ({
        studentId: permission.studentId,
        type: permission.type,
        status: permission.status,
      }));
    const settledStudentIds = new Set(
      (state.pointRecordsByDivision[divisionSlug] ?? [])
        .filter((record) => record.notes === settlementNote)
        .map((record) => record.studentId),
    );
    const items = buildLeaveSettlementPreviewItems({
      ...settlementPeriod,
      students,
      permissions,
      settledStudentIds,
      holidayLimit: settings.holidayLimit,
      halfDayLimit: settings.halfDayLimit,
      healthLimit: settings.healthLimit,
      holidayUnusedPts: settings.holidayUnusedPts,
      halfDayUnusedPts: settings.halfDayUnusedPts,
    });

    return {
      month: normalizedMonth,
      isClosedMonth,
      items,
      totalRewardPoints: items
        .filter((item) => !item.isSettled)
        .reduce((sum, item) => sum + item.rewardPoints, 0),
      grantableCount: items.filter((item) => !item.isSettled).length,
      alreadySettledCount: items.filter((item) => item.isSettled).length,
    } satisfies LeaveSettlementPreviewResult;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const [students, permissions, settledStudentIds] = await Promise.all([
    prisma.student.findMany({
      where: { divisionId: division.id, ...(options.activeOnly ? {status: "ACTIVE" as const} : {}) },
      select: { id: true, name: true, studentNumber: true, studyTrack: true, status: true, courseStartDate: true, courseEndDate: true, enrolledAt: true },
    }),
    prisma.leavePermission.findMany({
      where: {
        student: { divisionId: division.id },
        date: { gte: start, lt: end },
      },
      select: { studentId: true, type: true, status: true },
    }),
    prisma.pointRecord.findMany({
      where: {
        student: { divisionId: division.id },
        notes: settlementNote,
      },
      select: { studentId: true },
    }).then((records) => new Set(records.map((record) => record.studentId))),
  ]);
  const items = buildLeaveSettlementPreviewItems({
    ...settlementPeriod,
    students,
    permissions,
    settledStudentIds,
    holidayLimit: settings.holidayLimit,
    halfDayLimit: settings.halfDayLimit,
    healthLimit: settings.healthLimit,
    holidayUnusedPts: settings.holidayUnusedPts,
    halfDayUnusedPts: settings.halfDayUnusedPts,
  });

  return {
    month: normalizedMonth,
    isClosedMonth,
    items,
    totalRewardPoints: items
      .filter((item) => !item.isSettled)
      .reduce((sum, item) => sum + item.rewardPoints, 0),
    grantableCount: items.filter((item) => !item.isSettled).length,
    alreadySettledCount: items.filter((item) => item.isSettled).length,
  } satisfies LeaveSettlementPreviewResult;
}

export async function settleLeaveMonth(
  divisionSlug: string,
  actor: LeaveActor,
  input: LeaveSettlementSchemaInput,
  options: { activeOnly?: boolean } = {},
) {
  const preview = await previewLeaveSettlement(divisionSlug, input, options);

  if (!preview.isClosedMonth) {
    throw badRequest("진행 중인 월은 아직 정산할 수 없습니다.");
  }

  const grantTargets = preview.items.filter((item) => !item.isSettled);

  if (grantTargets.length === 0) {
    return {
      month: preview.month,
      createdCount: 0,
      skippedCount: preview.items.length,
      totalRewardPoints: 0,
    } satisfies LeaveSettlementResult;
  }

  const note = buildSettlementNote(preview.month);
  const settlementDate = getSettlementDate(preview.month);

  if (isMockMode()) {
    const records = await updateMockState((state) => {
      const now = new Date().toISOString();
      const settledStudentIds = new Set((state.pointRecordsByDivision[divisionSlug] ?? [])
        .filter((record) => record.notes === note).map((record) => record.studentId));
      const currentStudentIds = new Set((state.studentsByDivision[divisionSlug] ?? [])
        .filter((student) => student.status === "ACTIVE" || (!options.activeOnly && student.status === "ON_LEAVE"))
        .map((student) => student.id));
      const nextRecords = grantTargets.filter((item) =>
        currentStudentIds.has(item.studentId) && !settledStudentIds.has(item.studentId)).map(
        (item, index) =>
          ({
            id: `mock-point-record-${divisionSlug}-leave-settlement-${Date.now()}-${index}`,
            studentId: item.studentId,
            ruleId: null,
            points: item.rewardPoints,
            date: settlementDate.toISOString(),
            notes: note,
            recordedById: actor.id,
            createdAt: now,
          }) satisfies MockPointRecordRecord,
      );

      state.pointRecordsByDivision[divisionSlug] = [
        ...nextRecords,
        ...(state.pointRecordsByDivision[divisionSlug] ?? []),
      ];

      return nextRecords;
    });

    return {
      month: preview.month,
      createdCount: records.length,
      skippedCount: preview.items.length - records.length,
      totalRewardPoints: records.reduce((sum, record) => sum + record.points, 0),
    } satisfies LeaveSettlementResult;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const records = await prisma.$transaction(async (tx) => {
    const [students, settled] = await Promise.all([
      tx.student.findMany({
        where: {
          divisionId: division.id,
          id: {
            in: grantTargets.map((item) => item.studentId),
          },
          status: {
            in: options.activeOnly ? ["ACTIVE"] : ["ACTIVE", "ON_LEAVE"],
          },
        },
        select: {
          id: true,
        },
      }),
      tx.pointRecord.findMany({
        where: { student: { divisionId: division.id }, notes: note },
        select: { studentId: true },
      }),
    ]);
    const validStudentIds = new Set(students.map((student) => student.id));
    const settledStudentIds = new Set(settled.map((record) => record.studentId));
    const targets = grantTargets.filter((item) =>
      validStudentIds.has(item.studentId) && !settledStudentIds.has(item.studentId));
    if (targets.length) await tx.pointRecord.createMany({
      data: targets.map((item) => ({
        studentId: item.studentId,
        ruleId: null,
        points: item.rewardPoints,
        date: settlementDate,
        notes: note,
        recordedById: actor.id,
      })),
    });
    return targets;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error) => {
    if (isLeaveWriteConflict(error)) {
      throw conflict("같은 월의 휴가 정산이 동시에 처리 중입니다. 정산 결과를 확인한 뒤 다시 시도해 주세요.");
    }
    throw error;
  });

  revalidateDivisionOperationalViews(divisionSlug);
  return {
    month: preview.month,
    createdCount: records.length,
    skippedCount: preview.items.length - records.length,
    totalRewardPoints: records.reduce((sum, item) => sum + item.rewardPoints, 0),
  } satisfies LeaveSettlementResult;
}

/** Reconcile an already settled month after a leave correction. Never creates a
 * new award or a negative demerit, and keeps the original automatic record ID. */
async function reconcileLeaveSettlementAfterChange(slug: string, permissionId: string, actorId: string, date: string, type: string, context: {state: Awaited<ReturnType<typeof readMockState>>} | {tx: Prisma.TransactionClient}) {
  const month = date.slice(0, 7);
  if (type === "OUTING" || month >= getCurrentMonth()) return;
  const note = buildSettlementNote(month);
  const monthEnd = toDateString(getSettlementDate(month));
  const [settings, policy] = await Promise.all([getDivisionSettings(slug, monthEnd), getManagementPolicy(slug, monthEnd)]);
  const recognizedHealth = isHealthLeaveExempt(policy, monthEnd);
  const amount = (permissions: Array<{type: string; status: string}>) => {
    const used = permissions.filter(p => !isInactiveLeaveStatus(p.status));
    const holidays = used.filter(p => p.type === "HOLIDAY").length;
    const health = recognizedHealth ? 0 : used.filter(p => p.type === "HEALTH").length;
    const halves = used.filter(p => p.type === "HALF_DAY").length;
    return Math.max(0, settings.holidayLimit - holidays - health) * settings.holidayUnusedPts + Math.max(0, settings.halfDayLimit - halves) * settings.halfDayUnusedPts;
  };
  const history = (snapshot: unknown, changes: Array<{id:string; before:number; after:number}>) => {
    const base = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot as Record<string, unknown> : {};
    const previous = Array.isArray(base.settlementCorrections) ? base.settlementCorrections : [];
    return {...base, settlementCorrections:[...previous,{month,actorId,at:new Date().toISOString(),changes}]};
  };
  if ("state" in context) {
    const state = context.state;
    {
      const permission = (state.leavePermissionsByDivision[slug] ?? []).find(p => p.id === permissionId);
      if (!permission) throw notFound("휴가 기록을 찾을 수 없습니다.");
      const records = (state.pointRecordsByDivision[slug] ?? []).filter(p => p.studentId === permission.studentId && p.ruleId === null && p.notes === note);
      if (!records.length) return;
      const desired = amount((state.leavePermissionsByDivision[slug] ?? []).filter(p => p.studentId === permission.studentId && p.date.startsWith(month)));
      const changes = records.flatMap((r,index) => {
        const after = index === 0 ? desired : 0;
        if (r.points === after) return [];
        const change = {id:r.id,before:r.points,after}; r.points = after; return [change];
      });
      if(changes.length) permission.attendanceSnapshot = history(permission.attendanceSnapshot,changes);
    }
    return;
  }
  const division = await getDivisionOrThrow(slug);
  const tx = context.tx;
  {
    const permission = await tx.leavePermission.findFirst({where:{id:permissionId,student:{divisionId:division.id}}});
    if(!permission) throw notFound("휴가 기록을 찾을 수 없습니다.");
    const records = await tx.pointRecord.findMany({where:{studentId:permission.studentId,student:{divisionId:division.id},ruleId:null,notes:note},orderBy:[{createdAt:"asc"},{id:"asc"}]});
    if(!records.length) return;
    const {start,end} = getMonthRange(month);
    const permissions = await tx.leavePermission.findMany({where:{studentId:permission.studentId,student:{divisionId:division.id},date:{gte:start,lt:end}},select:{type:true,status:true}});
    const desired = amount(permissions);
    const changes: Array<{id:string;before:number;after:number}> = [];
    for(let index=0;index<records.length;index++) {
      const record=records[index], after=index===0?desired:0;
      if(record.points===after) continue;
      await tx.pointRecord.updateMany({where:{id:record.id,student:{divisionId:division.id},points:record.points,ruleId:null,notes:note},data:{points:after}});
      changes.push({id:record.id,before:record.points,after});
    }
    if(changes.length) await tx.leavePermission.updateMany({where:{id:permission.id,student:{divisionId:division.id}},data:{attendanceSnapshot:history(permission.attendanceSnapshot,changes) as Prisma.InputJsonValue}});
  }
}
