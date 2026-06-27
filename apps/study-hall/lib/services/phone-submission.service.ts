import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import {
  readMockState,
  updateMockState,
  type MockPhoneSubmissionRecord,
} from "@/lib/mock-store";
import { normalizeYmdDate } from "@/lib/date-utils";
import { badRequest, notFound } from "@/lib/errors";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import type {
  PhoneBulkRentalSchemaInput,
  PhoneSubmissionBatchSchemaInput,
} from "@/lib/phone-submission-schemas";
import { getPrismaClient, getDivisionBySlugOrThrow } from "@/lib/service-helpers";
import { listStudents, type StudentListItem } from "@/lib/services/student.service";
import { getPeriods, type PeriodRecord } from "@/lib/services/period.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type PhoneActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
};

export type PhoneCheckStatus = "SUBMITTED" | "NOT_SUBMITTED" | "RENTED";
export type PhoneAttendanceStatus =
  | "PRESENT"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE";

export type PhoneAttendanceCell = {
  studentId: string;
  status: PhoneAttendanceStatus | null;
  reason: string | null;
  checkable: boolean;
};

export type PhoneCheckRecord = {
  id: string;
  divisionId: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  periodId: string;
  periodName: string;
  date: string;
  status: PhoneCheckStatus;
  rentalNote: string | null;
  attendanceStatus: PhoneAttendanceStatus | null;
  attendanceReason: string | null;
  attendanceCheckable: boolean;
  recordedById: string;
  createdAt: string;
  updatedAt: string;
};

export type PhonePeriodSnapshot = {
  periodId: string;
  periodName: string;
  periodLabel: string | null;
  displayOrder: number;
  startTime: string;
  endTime: string;
  attendance: PhoneAttendanceCell[];
  records: PhoneCheckRecord[];
  submittedCount: number;
  notSubmittedCount: number;
  rentedCount: number;
  uncheckedCount: number;
  checkableStudentCount: number;
  attendanceUnprocessedCount: number;
  attendanceBlockedCount: number;
  totalStudents: number;
};

export type PhoneDaySnapshot = {
  date: string;
  attendanceIntegrationEnabled: boolean;
  periods: PhonePeriodSnapshot[];
  students: StudentListItem[];
};

export type PhoneBulkRentalResult = {
  appliedCount: number;
  updatedExistingCount: number;
  skippedAttendanceCount: number;
  skippedExistingCount: number;
  targetCellCount: number;
};

const PHONE_ATTENDANCE_CHECKABLE_STATUSES = new Set<PhoneAttendanceStatus>(["PRESENT", "TARDY"]);

function normalizePhoneDate(date: string) {
  return normalizeYmdDate(date, "날짜");
}

function parsePhoneDate(date: string) {
  const normalizedDate = normalizePhoneDate(date);
  const [y, m, d] = normalizedDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function getAttendanceKey(studentId: string, periodId: string) {
  return `${studentId}:${periodId}`;
}

function getRecordKey(studentId: string, date: string, periodId: string) {
  return `${studentId}:${date}:${periodId}`;
}

function isPhoneAttendanceCheckable(status: PhoneAttendanceStatus | null) {
  return status !== null && PHONE_ATTENDANCE_CHECKABLE_STATUSES.has(status);
}

type AttendanceLookup = Map<string, PhoneAttendanceCell>;

function getAttendanceCell(
  attendanceLookup: AttendanceLookup,
  studentId: string,
  periodId: string,
  attendanceIntegrationEnabled: boolean,
): PhoneAttendanceCell {
  if (!attendanceIntegrationEnabled) {
    return {
      studentId,
      status: null,
      reason: null,
      checkable: true,
    };
  }

  return (
    attendanceLookup.get(getAttendanceKey(studentId, periodId)) ?? {
      studentId,
      status: null,
      reason: null,
      checkable: false,
    }
  );
}

function serializeMockRecord(
  record: MockPhoneSubmissionRecord,
  student: StudentListItem,
  period: PeriodRecord,
  attendanceCell: PhoneAttendanceCell,
): PhoneCheckRecord {
  return {
    id: record.id,
    divisionId: record.divisionId,
    studentId: record.studentId,
    studentName: student.name,
    studentNumber: student.studentNumber,
    periodId: record.periodId,
    periodName: period.name,
    date: record.date,
    status: record.status as PhoneCheckStatus,
    rentalNote: record.rentalNote,
    attendanceStatus: attendanceCell.status,
    attendanceReason: attendanceCell.reason,
    attendanceCheckable: attendanceCell.checkable,
    recordedById: record.recordedById,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function serializeDbRecord(
  record: {
    id: string;
    divisionId: string;
    studentId: string;
    periodId: string;
    date: Date;
    status: string;
    rentalNote: string | null;
    recordedById: string;
    createdAt: Date;
    updatedAt: Date;
  },
  student: StudentListItem,
  period: PeriodRecord,
  attendanceCell: PhoneAttendanceCell,
): PhoneCheckRecord {
  return {
    id: record.id,
    divisionId: record.divisionId,
    studentId: record.studentId,
    studentName: student.name,
    studentNumber: student.studentNumber,
    periodId: record.periodId,
    periodName: period.name,
    date: record.date.toISOString().slice(0, 10),
    status: record.status as PhoneCheckStatus,
    rentalNote: record.rentalNote,
    attendanceStatus: attendanceCell.status,
    attendanceReason: attendanceCell.reason,
    attendanceCheckable: attendanceCell.checkable,
    recordedById: record.recordedById,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function buildPeriodSnapshot(
  period: PeriodRecord,
  records: PhoneCheckRecord[],
  students: StudentListItem[],
  attendanceLookup: AttendanceLookup,
  attendanceIntegrationEnabled: boolean,
): PhonePeriodSnapshot {
  const attendance = students.map((student) =>
    getAttendanceCell(
      attendanceLookup,
      student.id,
      String(period.id),
      attendanceIntegrationEnabled,
    ),
  );
  const checkableStudentIds = new Set(
    attendance.filter((cell) => cell.checkable).map((cell) => cell.studentId),
  );
  const periodRecords = records.filter(
    (r) => r.periodId === String(period.id) && checkableStudentIds.has(r.studentId),
  );
  const submittedCount = periodRecords.filter((r) => r.status === "SUBMITTED").length;
  const notSubmittedCount = periodRecords.filter((r) => r.status === "NOT_SUBMITTED").length;
  const rentedCount = periodRecords.filter((r) => r.status === "RENTED").length;
  const uncheckedCount = Math.max(checkableStudentIds.size - periodRecords.length, 0);
  const attendanceUnprocessedCount = attendance.filter((cell) => cell.status === null).length;
  const attendanceBlockedCount = attendance.filter(
    (cell) => cell.status !== null && !cell.checkable,
  ).length;

  return {
    periodId: String(period.id),
    periodName: period.name,
    periodLabel: period.label ?? null,
    displayOrder: period.displayOrder,
    startTime: period.startTime,
    endTime: period.endTime,
    attendance,
    records: periodRecords,
    submittedCount,
    notSubmittedCount,
    rentedCount,
    uncheckedCount,
    checkableStudentCount: checkableStudentIds.size,
    attendanceUnprocessedCount,
    attendanceBlockedCount,
    totalStudents: students.length,
  };
}

function buildAttendanceLookup(
  records: Array<{
    studentId: string;
    periodId: string;
    status: string;
    reason: string | null;
  }>,
): AttendanceLookup {
  const lookup: AttendanceLookup = new Map();

  for (const record of records) {
    const status = record.status as PhoneAttendanceStatus;
    lookup.set(getAttendanceKey(record.studentId, record.periodId), {
      studentId: record.studentId,
      status,
      reason: record.reason,
      checkable: isPhoneAttendanceCheckable(status),
    });
  }

  return lookup;
}

function getPeriodRange(periods: PeriodRecord[], startPeriodId: string, endPeriodId: string) {
  const startIndex = periods.findIndex((period) => period.id === startPeriodId);
  const endIndex = periods.findIndex((period) => period.id === endPeriodId);

  if (startIndex === -1 || endIndex === -1) {
    throw notFound("교시 정보를 찾을 수 없습니다.");
  }

  const [fromIndex, toIndex] =
    startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

  return periods.slice(fromIndex, toIndex + 1);
}

async function getAttendanceIntegrationEnabled(divisionSlug: string) {
  const settings = await getDivisionFeatureSettings(divisionSlug);
  return settings.featureFlags.attendanceManagement;
}

export async function getPhoneDaySnapshot(
  divisionSlug: string,
  date: string,
): Promise<PhoneDaySnapshot> {
  const normalizedDate = normalizePhoneDate(date);
  const [allStudents, allPeriods, attendanceIntegrationEnabled] = await Promise.all([
    listStudents(divisionSlug),
    getPeriods(divisionSlug),
    getAttendanceIntegrationEnabled(divisionSlug),
  ]);
  const students = allStudents.filter((s) => s.status === "ACTIVE" || s.status === "ON_LEAVE");
  const activePeriods = allPeriods.filter((p) => p.isActive);

  if (isMockMode()) {
    const state = await readMockState();
    const dayRecords = (state.phoneSubmissionsByDivision[divisionSlug] ?? []).filter(
      (r) => r.date === normalizedDate,
    );
    const attendanceLookup = attendanceIntegrationEnabled
      ? buildAttendanceLookup(
          (state.attendanceByDivision[divisionSlug] ?? []).filter(
            (record) => record.date === normalizedDate,
          ),
        )
      : new Map();

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const periodMap = new Map(activePeriods.map((p) => [String(p.id), p]));

    const allRecords: PhoneCheckRecord[] = dayRecords
      .map((r) => {
        const student = studentMap.get(r.studentId);
        const period = periodMap.get(r.periodId);
        const attendanceCell = getAttendanceCell(
          attendanceLookup,
          r.studentId,
          r.periodId,
          attendanceIntegrationEnabled,
        );
        return student && period ? serializeMockRecord(r, student, period, attendanceCell) : null;
      })
      .filter((item): item is PhoneCheckRecord => item !== null);

    const periods = activePeriods.map((period) =>
      buildPeriodSnapshot(period, allRecords, students, attendanceLookup, attendanceIntegrationEnabled),
    );

    return { date: normalizedDate, attendanceIntegrationEnabled, periods, students };
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const targetDate = parsePhoneDate(normalizedDate);

  const [dbRecords, attendanceRecords] = await Promise.all([
    prisma.phoneSubmission.findMany({
      where: { divisionId: division.id, date: targetDate },
      orderBy: { createdAt: "asc" },
    }),
    attendanceIntegrationEnabled
      ? prisma.attendance.findMany({
          where: {
            date: targetDate,
            student: {
              divisionId: division.id,
            },
          },
          select: {
            studentId: true,
            periodId: true,
            status: true,
            reason: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const attendanceLookup = buildAttendanceLookup(attendanceRecords);
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const periodMap = new Map(activePeriods.map((p) => [p.id, p]));

  const allRecords: PhoneCheckRecord[] = dbRecords
    .map((r) => {
      const student = studentMap.get(r.studentId);
      const period = periodMap.get(r.periodId);
      const attendanceCell = getAttendanceCell(
        attendanceLookup,
        r.studentId,
        r.periodId,
        attendanceIntegrationEnabled,
      );
      return student && period ? serializeDbRecord(r, student, period, attendanceCell) : null;
    })
    .filter((item): item is PhoneCheckRecord => item !== null);

  const periods = activePeriods.map((period) =>
    buildPeriodSnapshot(period, allRecords, students, attendanceLookup, attendanceIntegrationEnabled),
  );

  return { date: normalizedDate, attendanceIntegrationEnabled, periods, students };
}

export async function upsertPhoneCheckBatch(
  divisionSlug: string,
  actor: PhoneActor,
  input: PhoneSubmissionBatchSchemaInput,
): Promise<PhoneDaySnapshot> {
  const date = normalizePhoneDate(input.date);
  const { periodId, records } = input;
  const [allStudents, periods, attendanceIntegrationEnabled] = await Promise.all([
    listStudents(divisionSlug),
    getPeriods(divisionSlug),
    getAttendanceIntegrationEnabled(divisionSlug),
  ]);
  const activeStudentIds = new Set(
    allStudents
      .filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE")
      .map((student) => student.id),
  );

  if (!periods.some((period) => period.id === periodId && period.isActive)) {
    throw notFound("교시 정보를 찾을 수 없습니다.");
  }

  for (const record of records) {
    if (!activeStudentIds.has(record.studentId)) {
      throw badRequest("휴대폰 체크 대상이 아닌 학생이 포함되어 있습니다.");
    }
  }

  if (isMockMode()) {
    const division = getMockDivisionBySlug(divisionSlug);
    if (!division) throw notFound("지점 정보를 찾을 수 없습니다.");

    await updateMockState((state) => {
      const existing = state.phoneSubmissionsByDivision[divisionSlug] ?? [];
      const attendanceLookup = attendanceIntegrationEnabled
        ? buildAttendanceLookup(
            (state.attendanceByDivision[divisionSlug] ?? []).filter(
              (record) => record.date === date && record.periodId === periodId,
            ),
          )
        : new Map();
      const now = new Date().toISOString();

      for (const r of records) {
        const attendanceCell = getAttendanceCell(
          attendanceLookup,
          r.studentId,
          periodId,
          attendanceIntegrationEnabled,
        );
        const idx = existing.findIndex(
          (e) => e.studentId === r.studentId && e.date === date && e.periodId === periodId,
        );

        if (r.status !== null && !attendanceCell.checkable) {
          throw badRequest("출석 또는 지각으로 처리된 학생만 휴대폰 상태를 체크할 수 있습니다.");
        }

        if (r.status === null) {
          if (idx !== -1) {
            existing.splice(idx, 1);
          }
          continue;
        }

        if (idx === -1) {
          existing.push({
            id: `mock-phone-${divisionSlug}-${r.studentId}-${date}-${periodId}-${Date.now()}`,
            divisionId: division.id,
            studentId: r.studentId,
            periodId,
            date,
            status: r.status,
            rentalNote: r.rentalNote?.trim() || null,
            recordedById: actor.id,
            createdAt: now,
            updatedAt: now,
          } satisfies MockPhoneSubmissionRecord);
        } else {
          existing[idx] = {
            ...existing[idx],
            status: r.status,
            rentalNote: r.rentalNote?.trim() || null,
            recordedById: actor.id,
            updatedAt: now,
          };
        }
      }

      state.phoneSubmissionsByDivision[divisionSlug] = existing;
      return null;
    });

    revalidateDivisionOperationalViews(divisionSlug, {
      studentIds: records.map((record) => record.studentId),
    });
    return getPhoneDaySnapshot(divisionSlug, date);
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const targetDate = parsePhoneDate(date);
  const studentIds = Array.from(new Set(records.map((record) => record.studentId)));
  const attendanceRecords = attendanceIntegrationEnabled
    ? await prisma.attendance.findMany({
        where: {
          date: targetDate,
          periodId,
          studentId: {
            in: studentIds,
          },
          student: {
            divisionId: division.id,
          },
        },
        select: {
          studentId: true,
          periodId: true,
          status: true,
          reason: true,
        },
      })
    : [];
  const attendanceLookup = buildAttendanceLookup(attendanceRecords);

  for (const record of records) {
    const attendanceCell = getAttendanceCell(
      attendanceLookup,
      record.studentId,
      periodId,
      attendanceIntegrationEnabled,
    );

    if (record.status !== null && !attendanceCell.checkable) {
      throw badRequest("출석 또는 지각으로 처리된 학생만 휴대폰 상태를 체크할 수 있습니다.");
    }
  }

  await prisma.$transaction(
    records.map((r) => {
      if (r.status === null) {
        return prisma.phoneSubmission.deleteMany({
          where: {
            studentId: r.studentId,
            date: targetDate,
            periodId,
          },
        });
      }

      return prisma.phoneSubmission.upsert({
        where: {
          studentId_date_periodId: {
            studentId: r.studentId,
            date: targetDate,
            periodId,
          },
        },
        create: {
          divisionId: division.id,
          studentId: r.studentId,
          periodId,
          date: targetDate,
          status: r.status,
          rentalNote: r.rentalNote?.trim() || null,
          recordedById: actor.id,
        },
        update: {
          status: r.status,
          rentalNote: r.rentalNote?.trim() || null,
          recordedById: actor.id,
        },
      });
    }),
  );

  revalidateDivisionOperationalViews(divisionSlug, {
    studentIds,
  });
  return getPhoneDaySnapshot(divisionSlug, date);
}

export async function applyPhoneBulkRental(
  divisionSlug: string,
  actor: PhoneActor,
  input: PhoneBulkRentalSchemaInput,
): Promise<{ snapshot: PhoneDaySnapshot; result: PhoneBulkRentalResult }> {
  const date = normalizePhoneDate(input.date);
  const rentalNote = input.rentalNote?.trim() || null;
  const overwriteExisting = input.overwriteExisting ?? false;
  const uniqueStudentIds = Array.from(new Set(input.studentIds));
  const [allStudents, allPeriods, attendanceIntegrationEnabled] = await Promise.all([
    listStudents(divisionSlug),
    getPeriods(divisionSlug),
    getAttendanceIntegrationEnabled(divisionSlug),
  ]);
  const students = allStudents.filter(
    (student) => student.status === "ACTIVE" || student.status === "ON_LEAVE",
  );
  const activeStudentIds = new Set(students.map((student) => student.id));

  for (const studentId of uniqueStudentIds) {
    if (!activeStudentIds.has(studentId)) {
      throw badRequest("휴대폰 대여 대상이 아닌 학생이 포함되어 있습니다.");
    }
  }

  const targetPeriods = getPeriodRange(allPeriods, input.startPeriodId, input.endPeriodId);
  if (targetPeriods.some((period) => !period.isActive)) {
    throw badRequest("비활성 교시는 일괄 대여할 수 없습니다.");
  }

  const targetPeriodIds = targetPeriods.map((period) => period.id);
  const targetCellCount = uniqueStudentIds.length * targetPeriods.length;
  const result: PhoneBulkRentalResult = {
    appliedCount: 0,
    updatedExistingCount: 0,
    skippedAttendanceCount: 0,
    skippedExistingCount: 0,
    targetCellCount,
  };

  if (isMockMode()) {
    const division = getMockDivisionBySlug(divisionSlug);
    if (!division) throw notFound("지점 정보를 찾을 수 없습니다.");

    await updateMockState((state) => {
      const existing = state.phoneSubmissionsByDivision[divisionSlug] ?? [];
      const existingByKey = new Map(
        existing.map((record, index) => [
          getRecordKey(record.studentId, record.date, record.periodId),
          { record, index },
        ]),
      );
      const attendanceLookup = attendanceIntegrationEnabled
        ? buildAttendanceLookup(
            (state.attendanceByDivision[divisionSlug] ?? []).filter(
              (record) => record.date === date && targetPeriodIds.includes(record.periodId),
            ),
          )
        : new Map();
      const now = new Date().toISOString();

      for (const studentId of uniqueStudentIds) {
        for (const period of targetPeriods) {
          const attendanceCell = getAttendanceCell(
            attendanceLookup,
            studentId,
            period.id,
            attendanceIntegrationEnabled,
          );

          if (!attendanceCell.checkable) {
            result.skippedAttendanceCount += 1;
            continue;
          }

          const key = getRecordKey(studentId, date, period.id);
          const existingEntry = existingByKey.get(key);

          if (
            existingEntry &&
            existingEntry.record.status !== "RENTED" &&
            !overwriteExisting
          ) {
            result.skippedExistingCount += 1;
            continue;
          }

          if (existingEntry) {
            existing[existingEntry.index] = {
              ...existingEntry.record,
              status: "RENTED",
              rentalNote,
              recordedById: actor.id,
              updatedAt: now,
            };
            result.updatedExistingCount += 1;
            continue;
          }

          existing.push({
            id: `mock-phone-rental-${divisionSlug}-${studentId}-${date}-${period.id}-${Date.now()}`,
            divisionId: division.id,
            studentId,
            periodId: period.id,
            date,
            status: "RENTED",
            rentalNote,
            recordedById: actor.id,
            createdAt: now,
            updatedAt: now,
          } satisfies MockPhoneSubmissionRecord);
          result.appliedCount += 1;
        }
      }

      state.phoneSubmissionsByDivision[divisionSlug] = existing;
      return null;
    });

    revalidateDivisionOperationalViews(divisionSlug, {
      studentIds: uniqueStudentIds,
    });
    return {
      snapshot: await getPhoneDaySnapshot(divisionSlug, date),
      result,
    };
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const targetDate = parsePhoneDate(date);
  const [existingRecords, attendanceRecords] = await Promise.all([
    prisma.phoneSubmission.findMany({
      where: {
        divisionId: division.id,
        date: targetDate,
        studentId: {
          in: uniqueStudentIds,
        },
        periodId: {
          in: targetPeriodIds,
        },
      },
      select: {
        studentId: true,
        periodId: true,
        status: true,
      },
    }),
    attendanceIntegrationEnabled
      ? prisma.attendance.findMany({
          where: {
            date: targetDate,
            studentId: {
              in: uniqueStudentIds,
            },
            periodId: {
              in: targetPeriodIds,
            },
            student: {
              divisionId: division.id,
            },
          },
          select: {
            studentId: true,
            periodId: true,
            status: true,
            reason: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const existingByKey = new Map(
    existingRecords.map((record) => [
      getAttendanceKey(record.studentId, record.periodId),
      record,
    ]),
  );
  const attendanceLookup = buildAttendanceLookup(attendanceRecords);
  const upsertTargets: Array<{ studentId: string; periodId: string }> = [];

  for (const studentId of uniqueStudentIds) {
    for (const period of targetPeriods) {
      const attendanceCell = getAttendanceCell(
        attendanceLookup,
        studentId,
        period.id,
        attendanceIntegrationEnabled,
      );

      if (!attendanceCell.checkable) {
        result.skippedAttendanceCount += 1;
        continue;
      }

      const key = getAttendanceKey(studentId, period.id);
      const existingRecord = existingByKey.get(key);

      if (existingRecord && existingRecord.status !== "RENTED" && !overwriteExisting) {
        result.skippedExistingCount += 1;
        continue;
      }

      if (existingRecord) {
        result.updatedExistingCount += 1;
      } else {
        result.appliedCount += 1;
      }

      upsertTargets.push({ studentId, periodId: period.id });
    }
  }

  if (upsertTargets.length > 0) {
    await prisma.$transaction(
      upsertTargets.map((target) =>
        prisma.phoneSubmission.upsert({
          where: {
            studentId_date_periodId: {
              studentId: target.studentId,
              date: targetDate,
              periodId: target.periodId,
            },
          },
          create: {
            divisionId: division.id,
            studentId: target.studentId,
            periodId: target.periodId,
            date: targetDate,
            status: "RENTED",
            rentalNote,
            recordedById: actor.id,
          },
          update: {
            status: "RENTED",
            rentalNote,
            recordedById: actor.id,
          },
        }),
      ),
    );
  }

  revalidateDivisionOperationalViews(divisionSlug, {
    studentIds: uniqueStudentIds,
  });

  return {
    snapshot: await getPhoneDaySnapshot(divisionSlug, date),
    result,
  };
}

export async function listPhoneRecords(
  divisionSlug: string,
  options?: {
    dateFrom?: string;
    dateTo?: string;
    studentId?: string;
    status?: PhoneCheckStatus;
  },
): Promise<PhoneCheckRecord[]> {
  const normalizedFrom = options?.dateFrom ? normalizePhoneDate(options.dateFrom) : undefined;
  const normalizedTo = options?.dateTo ? normalizePhoneDate(options.dateTo) : undefined;
  const [students, allPeriods, attendanceIntegrationEnabled] = await Promise.all([
    listStudents(divisionSlug),
    getPeriods(divisionSlug),
    getAttendanceIntegrationEnabled(divisionSlug),
  ]);
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const periodMap = new Map(allPeriods.map((p) => [String(p.id), p]));

  if (isMockMode()) {
    const state = await readMockState();
    let records = state.phoneSubmissionsByDivision[divisionSlug] ?? [];
    if (normalizedFrom) records = records.filter((r) => r.date >= normalizedFrom);
    if (normalizedTo) records = records.filter((r) => r.date <= normalizedTo);
    if (options?.studentId) records = records.filter((r) => r.studentId === options.studentId);
    if (options?.status) records = records.filter((r) => r.status === options.status);

    const attendanceByRecordKey = new Map<string, PhoneAttendanceCell>();
    if (attendanceIntegrationEnabled && records.length > 0) {
      const targetKeys = new Set(
        records.map((record) => getRecordKey(record.studentId, record.date, record.periodId)),
      );

      for (const record of state.attendanceByDivision[divisionSlug] ?? []) {
        const key = getRecordKey(record.studentId, record.date, record.periodId);
        if (!targetKeys.has(key)) {
          continue;
        }

        const status = record.status as PhoneAttendanceStatus;
        attendanceByRecordKey.set(key, {
          studentId: record.studentId,
          status,
          reason: record.reason,
          checkable: isPhoneAttendanceCheckable(status),
        });
      }
    }

    return records
      .map((r) => {
        const student = studentMap.get(r.studentId);
        const period = periodMap.get(r.periodId);
        const attendanceCell = attendanceIntegrationEnabled
          ? attendanceByRecordKey.get(getRecordKey(r.studentId, r.date, r.periodId)) ?? {
              studentId: r.studentId,
              status: null,
              reason: null,
              checkable: false,
            }
          : {
              studentId: r.studentId,
              status: null,
              reason: null,
              checkable: true,
            };
        return student && period ? serializeMockRecord(r, student, period, attendanceCell) : null;
      })
      .filter((item): item is PhoneCheckRecord => item !== null)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  const where: Record<string, unknown> = { divisionId: division.id };
  if (normalizedFrom) {
    where.date = { ...((where.date as object) ?? {}), gte: parsePhoneDate(normalizedFrom) };
  }
  if (normalizedTo) {
    where.date = { ...((where.date as object) ?? {}), lte: parsePhoneDate(normalizedTo) };
  }
  if (options?.studentId) where.studentId = options.studentId;
  if (options?.status) where.status = options.status;

  const dbRecords = await prisma.phoneSubmission.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "asc" }],
  });

  const attendanceByRecordKey = new Map<string, PhoneAttendanceCell>();
  if (attendanceIntegrationEnabled && dbRecords.length > 0) {
    const studentIds = Array.from(new Set(dbRecords.map((record) => record.studentId)));
    const periodIds = Array.from(new Set(dbRecords.map((record) => record.periodId)));
    const dateValues = Array.from(
      new Map(dbRecords.map((record) => [record.date.toISOString().slice(0, 10), record.date])).values(),
    );
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        date: {
          in: dateValues,
        },
        studentId: {
          in: studentIds,
        },
        periodId: {
          in: periodIds,
        },
        student: {
          divisionId: division.id,
        },
      },
      select: {
        studentId: true,
        periodId: true,
        date: true,
        status: true,
        reason: true,
      },
    });

    for (const record of attendanceRecords) {
      const status = record.status as PhoneAttendanceStatus;
      attendanceByRecordKey.set(
        getRecordKey(record.studentId, record.date.toISOString().slice(0, 10), record.periodId),
        {
          studentId: record.studentId,
          status,
          reason: record.reason,
          checkable: isPhoneAttendanceCheckable(status),
        },
      );
    }
  }

  return dbRecords
    .map((r) => {
      const student = studentMap.get(r.studentId);
      const period = periodMap.get(r.periodId);
      const dateKey = r.date.toISOString().slice(0, 10);
      const attendanceCell = attendanceIntegrationEnabled
        ? attendanceByRecordKey.get(getRecordKey(r.studentId, dateKey, r.periodId)) ?? {
            studentId: r.studentId,
            status: null,
            reason: null,
            checkable: false,
          }
        : {
            studentId: r.studentId,
            status: null,
            reason: null,
            checkable: true,
          };
      return student && period ? serializeDbRecord(r, student, period, attendanceCell) : null;
    })
    .filter((item): item is PhoneCheckRecord => item !== null);
}
