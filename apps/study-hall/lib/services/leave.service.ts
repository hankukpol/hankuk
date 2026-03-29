import { cache } from "react";

import { getMockAdminSession, getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
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
import type { LeaveTypeValue } from "@/lib/leave-meta";
import { getPrismaClient, normalizeOptionalText } from "@/lib/service-helpers";
import { getPeriods } from "@/lib/services/period.service";
import { getDivisionSettings } from "@/lib/services/settings.service";

type LeaveActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  name?: string;
};

type AttendanceStatus =
  | "PRESENT"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE";

export type LeavePermissionItem = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  type: LeaveTypeValue;
  date: string;
  reason: string | null;
  approvedById: string;
  approvedByName: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "USED";
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

function getLeaveStatus(type: LeaveTypeValue, date: string) {
  const today = getKstToday();

  if (type === "OUTING" && date <= today) {
    return "USED";
  }

  return date < today ? "USED" : "APPROVED";
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
    status: "PENDING" | "APPROVED" | "REJECTED" | "USED";
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
    status: record.status,
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
) {
  const attendanceStatus = getAttendanceStatusForLeaveType(input.type);

  if (!attendanceStatus) {
    return;
  }

  const allPeriods = (state.periodsByDivision[divisionSlug] ?? [])
    .filter((period) => period.isActive && period.isMandatory)
    .sort((left, right) => left.displayOrder - right.displayOrder);

  const targetPeriods = input.type === "HALF_DAY" ? allPeriods.slice(0, 3) : allPeriods;

  if (targetPeriods.length === 0) {
    return;
  }

  const current = new Map(
    (state.attendanceByDivision[divisionSlug] ?? []).map((record) => [record.id, record]),
  );

  for (const period of targetPeriods) {
    const id = buildMockAttendanceId(input.studentId, period.id, input.date);
    const existing = current.get(id);

    if (existing) {
      continue;
    }

    current.set(id, {
      id,
      studentId: input.studentId,
      periodId: period.id,
      date: input.date,
      status: attendanceStatus as MockAttendanceStatus,
      reason: buildAttendanceReason(input.type, normalizeOptionalText(input.reason)),
      checkInTime: null,
      recordedById: actorId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies MockAttendanceRecord);
  }

  state.attendanceByDivision[divisionSlug] = Array.from(current.values());
}

async function applyDbLeaveAttendance(
  divisionSlug: string,
  actorId: string,
  input: LeavePermissionSchemaInput,
) {
  const attendanceStatus = getAttendanceStatusForLeaveType(input.type);

  if (!attendanceStatus) {
    return;
  }

  const prisma = await getPrismaClient();
  const allPeriods = (await getPeriods(divisionSlug))
    .filter((period) => period.isActive && period.isMandatory)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const targetPeriods = input.type === "HALF_DAY" ? allPeriods.slice(0, 3) : allPeriods;

  if (targetPeriods.length === 0) {
    return;
  }

  const targetDate = parseDateString(input.date);
  const existingRecords = await prisma.attendance.findMany({
    where: {
      studentId: input.studentId,
      date: targetDate,
    },
    select: {
      periodId: true,
    },
  });
  const existingPeriodIds = new Set(existingRecords.map((record) => record.periodId));
  const periodsToApply = targetPeriods.filter((period) => !existingPeriodIds.has(period.id));

  if (periodsToApply.length === 0) {
    return;
  }

  await prisma.attendance.createMany({
    data: periodsToApply.map((period) => ({
      studentId: input.studentId,
      periodId: period.id,
      date: targetDate,
      status: attendanceStatus,
      reason: buildAttendanceReason(input.type, normalizeOptionalText(input.reason)),
      recordedById: actorId,
    })),
    skipDuplicates: true,
  });
}

function buildLeaveSettlementPreviewItems(args: {
  students: Array<{
    id: string;
    name: string;
    studentNumber: string;
    studyTrack: string | null;
    status: string;
  }>;
  permissions: Array<{
    studentId: string;
    type: LeaveTypeValue;
    status: "PENDING" | "APPROVED" | "REJECTED" | "USED";
  }>;
  settledStudentIds: Set<string>;
  holidayLimit: number;
  halfDayLimit: number;
  holidayUnusedPts: number;
  halfDayUnusedPts: number;
}) {
  return args.students
    .filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE")
    .map((student) => {
      const records = args.permissions.filter(
        (permission) => permission.studentId === student.id && permission.status !== "REJECTED",
      );
      const holidayUsed = records.filter((permission) => permission.type === "HOLIDAY").length;
      const halfDayUsed = records.filter((permission) => permission.type === "HALF_DAY").length;
      const holidayRemaining = Math.max(args.holidayLimit - holidayUsed, 0);
      const halfDayRemaining = Math.max(args.halfDayLimit - halfDayUsed, 0);
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
  },
) {
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
  });

  return permissions.map((record) => serializeLeaveRecord(record, record.student, record.approvedBy.name));
}

export async function createLeavePermission(
  divisionSlug: string,
  actor: LeaveActor,
  input: LeavePermissionSchemaInput,
) {
  const reason = normalizeOptionalText(input.reason);
  const status = getLeaveStatus(input.type, input.date);

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
        (saved) => saved.studentId === input.studentId && saved.date === input.date,
      );

      if (duplicated) {
        throw conflict("해당 날짜에는 이미 휴가가 등록되어 있습니다.");
      }

      const nextRecord: MockLeavePermissionRecord = {
        id: `mock-leave-${divisionSlug}-${Date.now()}`,
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
      await applyMockLeaveAttendance(divisionSlug, state, actor.id, {
        ...input,
        reason,
      });

      return nextRecord;
    });
    const mockState = await readMockState();
    const mockStudent = (mockState.studentsByDivision[divisionSlug] ?? []).find(
      (s) => s.id === record.studentId,
    );
    if (!mockStudent) return null;
    return serializeLeaveRecord(record, mockStudent, getMockAdminSession(divisionSlug).name);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const student = await prisma.student.findFirst({
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

  const duplicated = await prisma.leavePermission.findFirst({
    where: {
      studentId: input.studentId,
      student: {
        divisionId: division.id,
      },
      date: parseDateString(input.date),
    },
    select: {
      id: true,
    },
  });

  if (duplicated) {
    throw conflict("해당 날짜에는 이미 휴가가 등록되어 있습니다.");
  }

  const permission = await prisma.leavePermission.create({
    data: {
      studentId: input.studentId,
      type: input.type,
      date: parseDateString(input.date),
      reason,
      approvedById: actor.id,
      status,
    },
  });

  await applyDbLeaveAttendance(divisionSlug, actor.id, {
    ...input,
    reason,
  });

  const createdPermission = await prisma.leavePermission.findUnique({
    where: { id: permission.id },
    include: {
      student: { select: { id: true, name: true, studentNumber: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!createdPermission) return null;
  return serializeLeaveRecord(createdPermission, createdPermission.student, createdPermission.approvedBy.name);
}

export async function previewLeaveSettlement(
  divisionSlug: string,
  input: LeaveSettlementSchemaInput,
) {
  const { normalizedMonth, start, end } = getMonthRange(input.month);
  const settlementNote = buildSettlementNote(normalizedMonth);
  const settings = await getDivisionSettings(divisionSlug);
  const isClosedMonth = normalizedMonth < getCurrentMonth();

  if (isMockMode()) {
    const state = await readMockState();
    const students = state.studentsByDivision[divisionSlug] ?? [];
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
      students,
      permissions,
      settledStudentIds,
      holidayLimit: settings.holidayLimit,
      halfDayLimit: settings.halfDayLimit,
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
      where: { divisionId: division.id },
      select: { id: true, name: true, studentNumber: true, studyTrack: true, status: true },
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
    students,
    permissions,
    settledStudentIds,
    holidayLimit: settings.holidayLimit,
    halfDayLimit: settings.halfDayLimit,
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
) {
  const preview = await previewLeaveSettlement(divisionSlug, input);

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
      const nextRecords = grantTargets.map(
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
      totalRewardPoints: grantTargets.reduce((sum, item) => sum + item.rewardPoints, 0),
    } satisfies LeaveSettlementResult;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const validStudentIds = new Set(
    (
      await prisma.student.findMany({
        where: {
          divisionId: division.id,
          id: {
            in: grantTargets.map((item) => item.studentId),
          },
          status: {
            in: ["ACTIVE", "ON_LEAVE"],
          },
        },
        select: {
          id: true,
        },
      })
    ).map((student) => student.id),
  );
  const records = grantTargets.filter((item) => validStudentIds.has(item.studentId));

  await prisma.pointRecord.createMany({
    data: records.map((item) => ({
      studentId: item.studentId,
      ruleId: null,
      points: item.rewardPoints,
      date: settlementDate,
      notes: note,
      recordedById: actor.id,
    })),
  });

  return {
    month: preview.month,
    createdCount: records.length,
    skippedCount: preview.items.length - records.length,
    totalRewardPoints: records.reduce((sum, item) => sum + item.rewardPoints, 0),
  } satisfies LeaveSettlementResult;
}
