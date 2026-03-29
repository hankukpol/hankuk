import { cache } from "react";

import {
  readMockState,
  updateMockState,
  type MockAttendanceRecord,
  type MockAttendanceStatus,
  type MockPointRecordRecord,
} from "@/lib/mock-store";
import { normalizeYmdDate } from "@/lib/date-utils";
import { badRequest, notFound } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import { getPrismaClient } from "@/lib/service-helpers";
import { getPeriods } from "@/lib/services/period.service";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { getDivisionStudents } from "@/lib/services/student.service";

type AttendanceStatus =
  | "PRESENT"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE";

type AttendanceInputRecord = {
  studentId: string;
  status: AttendanceStatus;
  reason?: string | null;
};

type AttendanceActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
};

export type AttendanceSnapshot = {
  date: string;
  students: Awaited<ReturnType<typeof getDivisionStudents>>;
  periods: Array<{
    id: string;
    name: string;
    label: string | null;
    startTime: string;
    endTime: string;
    isMandatory: boolean;
    isActive: boolean;
    displayOrder: number;
  }>;
  records: Array<{
    id: string;
    studentId: string;
    periodId: string;
    date: string;
    status: AttendanceStatus;
    reason: string | null;
    checkInTime: string | null;
  }>;
};

export type AttendanceStats = {
  dateFrom: string;
  dateTo: string;
  totals: Record<Lowercase<AttendanceStatus> | "unprocessed", number>;
  attendanceRate: number;
  periods: Array<{
    periodId: string;
    periodName: string;
    counts: Record<Lowercase<AttendanceStatus> | "unprocessed", number>;
    attendanceRate: number;
  }>;
};

export type StudentAttendanceHistoryItem = {
  id: string;
  studentId: string;
  date: string;
  periodId: string;
  periodName: string;
  periodLabel: string | null;
  status: AttendanceStatus;
  reason: string | null;
};

function normalizeDate(input: string) {
  return normalizeYmdDate(input, "날짜");
}

function toUtcDateRange(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(year, month - 1, day + 1));
  return { start, end };
}

function toKstDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getDateDiffInDays(fromDate: string, toDate: string) {
  return Math.round((parseDateKey(toDate).getTime() - parseDateKey(fromDate).getTime()) / 86_400_000);
}

function createEmptyCounts() {
  return {
    present: 0,
    tardy: 0,
    absent: 0,
    excused: 0,
    holiday: 0,
    half_holiday: 0,
    not_applicable: 0,
    unprocessed: 0,
  };
}

function statusKey(status: AttendanceStatus) {
  return status.toLowerCase() as Lowercase<AttendanceStatus>;
}

function buildRecordId(record: Pick<MockAttendanceRecord, "studentId" | "periodId" | "date">) {
  return `mock-attendance-${record.studentId}-${record.periodId}-${record.date}`;
}

/**
 * PRESENT → period start time on the given date (KST, as UTC)
 * TARDY   → now (server time)
 * Others  → null
 */
function resolveCheckInTime(
  status: AttendanceStatus,
  date: string,
  periodStartTime: string,
  now: Date,
): Date | null {
  if (status === "PRESENT") {
    const [hh, mm] = periodStartTime.split(":").map(Number);
    const [y, m, d] = date.split("-").map(Number);
    // KST = UTC+9, store as UTC
    return new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0, 0));
  }
  if (status === "TARDY") {
    return now;
  }
  return null;
}

function serializePeriods(
  periods: Array<{
    id: string;
    name: string;
    label: string | null;
    startTime: string;
    endTime: string;
    isMandatory: boolean;
    isActive: boolean;
    displayOrder: number;
  }>,
) {
  return periods.map((period) => ({
    id: period.id,
    name: period.name,
    label: period.label,
    startTime: period.startTime,
    endTime: period.endTime,
    isMandatory: period.isMandatory,
    isActive: period.isActive,
    displayOrder: period.displayOrder,
  }));
}

type AttendanceContext = {
  students: Awaited<ReturnType<typeof getDivisionStudents>>;
  periods: Awaited<ReturnType<typeof getPeriods>>;
};

/** 좌석이 배정된(ACTIVE/ON_LEAVE) 학생만 반환 — 출석 체크 대상 */
async function getSeatedStudents(divisionSlug: string) {
  const all = await getDivisionStudents(divisionSlug);
  return all.filter((student) => student.seatId !== null);
}

async function getAttendanceContext(divisionSlug: string): Promise<AttendanceContext> {
  const [students, periods] = await Promise.all([
    getSeatedStudents(divisionSlug),
    getPeriods(divisionSlug),
  ]);

  return {
    students,
    periods,
  };
}

function buildAttendanceSnapshot(
  date: string,
  context: AttendanceContext,
  records: AttendanceSnapshot["records"],
  periodId?: string,
): AttendanceSnapshot {
  const periods = periodId
    ? context.periods.filter((period) => period.id === periodId)
    : context.periods;

  return {
    date,
    students: context.students,
    periods: serializePeriods(periods),
    records,
  };
}

const getDivisionOrThrow = cache(async function getDivisionOrThrow(divisionSlug: string) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
  });

  if (!division) {
    throw notFound(`Division not found for slug: ${divisionSlug}`);
  }

  return division;
});

async function ensureAssistantAllowed(
  divisionSlug: string,
  actor: AttendanceActor,
  targetDate: string,
) {
  if (actor.role !== "ASSISTANT") {
    return;
  }

  const today = toKstDateString();

  if (targetDate === today) {
    return;
  }

  const settings = await getDivisionSettings(divisionSlug);
  const allowPastEdit = settings.assistantPastEditAllowed;
  const allowedDays = Math.max(0, settings.assistantPastEditDays);

  if (targetDate > today) {
    throw badRequest("미래 날짜의 출석은 수정할 수 없습니다.");
  }

  if (!allowPastEdit) {
    throw badRequest("조교는 당일 출석만 수정할 수 있습니다.");
  }

  if (getDateDiffInDays(targetDate, today) > allowedDays) {
    throw badRequest(`조교는 최근 ${allowedDays}일 이내의 출석만 수정할 수 있습니다.`);
  }
}

export async function getAttendanceSnapshot(
  divisionSlug: string,
  date: string,
  periodId?: string,
): Promise<AttendanceSnapshot> {
  const [snapshot] = await getAttendanceSnapshots(divisionSlug, [date], periodId);

  if (!snapshot) {
    throw notFound("출석 스냅샷을 찾을 수 없습니다.");
  }

  return snapshot;
}

export async function getAttendanceSnapshots(
  divisionSlug: string,
  dates: string[],
  periodId?: string,
): Promise<AttendanceSnapshot[]> {
  const normalizedDates = Array.from(new Set(dates.map(normalizeDate)));

  if (normalizedDates.length === 0) {
    return [];
  }

  const context = await getAttendanceContext(divisionSlug);

  if (isMockMode()) {
    const state = await readMockState();
    const dateSet = new Set(normalizedDates);
    const recordsByDate = new Map(
      normalizedDates.map((dateKey) => [dateKey, [] as AttendanceSnapshot["records"]]),
    );

    for (const record of state.attendanceByDivision[divisionSlug] ?? []) {
      if (!dateSet.has(record.date) || (periodId && record.periodId !== periodId)) {
        continue;
      }

      recordsByDate.get(record.date)?.push(record);
    }

    return normalizedDates.map((dateKey) =>
      buildAttendanceSnapshot(dateKey, context, recordsByDate.get(dateKey) ?? [], periodId),
    );
  }

  const prisma = await getPrismaClient();
  const sortedDates = [...normalizedDates].sort((left, right) => left.localeCompare(right));
  const { start } = toUtcDateRange(sortedDates[0]);
  const { end } = toUtcDateRange(sortedDates[sortedDates.length - 1]);
  const dateSet = new Set(normalizedDates);
  const recordsByDate = new Map(
    normalizedDates.map((dateKey) => [dateKey, [] as AttendanceSnapshot["records"]]),
  );
  const records = await prisma.attendance.findMany({
    where: {
      date: {
        gte: start,
        lt: end,
      },
      student: {
        division: {
          slug: divisionSlug,
        },
      },
      ...(periodId ? { periodId } : {}),
    },
    select: {
      id: true,
      studentId: true,
      periodId: true,
      date: true,
      status: true,
      reason: true,
      checkInTime: true,
    },
  });

  for (const record of records) {
    const dateKey = record.date.toISOString().slice(0, 10);

    if (!dateSet.has(dateKey)) {
      continue;
    }

    recordsByDate.get(dateKey)?.push({
      id: record.id,
      studentId: record.studentId,
      periodId: record.periodId,
      date: dateKey,
      status: record.status,
      reason: record.reason,
      checkInTime: record.checkInTime ? record.checkInTime.toISOString() : null,
    });
  }

  return normalizedDates.map((dateKey) =>
    buildAttendanceSnapshot(dateKey, context, recordsByDate.get(dateKey) ?? [], periodId),
  );
}

export async function listStudentAttendanceHistory(
  divisionSlug: string,
  studentId: string,
): Promise<StudentAttendanceHistoryItem[]> {
  const periods = await getPeriods(divisionSlug);
  const periodMap = new Map(periods.map((period) => [period.id, period]));

  if (isMockMode()) {
    const state = await readMockState();

    return [...(state.attendanceByDivision[divisionSlug] ?? [])]
      .filter((record) => record.studentId === studentId)
      .sort((left, right) => {
        const dateDiff = right.date.localeCompare(left.date);

        if (dateDiff !== 0) {
          return dateDiff;
        }

        return (
          (periodMap.get(left.periodId)?.displayOrder ?? Number.MAX_SAFE_INTEGER) -
          (periodMap.get(right.periodId)?.displayOrder ?? Number.MAX_SAFE_INTEGER)
        );
      })
      .map((record) => ({
        id: record.id,
        studentId: record.studentId,
        date: record.date,
        periodId: record.periodId,
        periodName: periodMap.get(record.periodId)?.name ?? record.periodId,
        periodLabel: periodMap.get(record.periodId)?.label ?? null,
        status: record.status,
        reason: record.reason,
      }));
  }

  const prisma = await getPrismaClient();
  const records = await prisma.attendance.findMany({
    where: {
      studentId,
      student: {
        division: {
          slug: divisionSlug,
        },
      },
    },
    select: {
      id: true,
      studentId: true,
      periodId: true,
      date: true,
      status: true,
      reason: true,
    },
    orderBy: [{ date: "desc" }],
  });

  return records
    .map((record) => ({
      id: record.id,
      studentId: record.studentId,
      date: record.date.toISOString().slice(0, 10),
      periodId: record.periodId,
      periodName: periodMap.get(record.periodId)?.name ?? record.periodId,
      periodLabel: periodMap.get(record.periodId)?.label ?? null,
      status: record.status,
      reason: record.reason,
    }))
    .sort((left, right) => {
      const dateDiff = right.date.localeCompare(left.date);

      if (dateDiff !== 0) {
        return dateDiff;
      }

      return (
        (periodMap.get(left.periodId)?.displayOrder ?? Number.MAX_SAFE_INTEGER) -
        (periodMap.get(right.periodId)?.displayOrder ?? Number.MAX_SAFE_INTEGER)
      );
    });
}

async function checkAndGrantPerfectAttendancePoints(
  divisionSlug: string,
  date: string,
  actorId: string,
): Promise<{ grantedCount: number }> {
  const settings = await getDivisionSettings(divisionSlug);

  if (!settings.perfectAttendancePtsEnabled || settings.perfectAttendancePts <= 0) {
    return { grantedCount: 0 };
  }

  const periods = await getPeriods(divisionSlug);
  const mandatoryActivePeriods = periods.filter(
    (period) => period.isMandatory && period.isActive,
  );

  if (mandatoryActivePeriods.length === 0) {
    return { grantedCount: 0 };
  }

  const mandatoryPeriodIds = new Set(mandatoryActivePeriods.map((period) => period.id));
  const students = await getSeatedStudents(divisionSlug);
  const dupCheckNotes = `[자동] 개근 상점 (${date})`;

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const allRecords = state.attendanceByDivision[divisionSlug] ?? [];
      const dayRecords = allRecords.filter((record) => record.date === date);

      // 학생별 필수 교시 출석 맵
      const studentPresentMap = new Map<string, Set<string>>();
      for (const record of dayRecords) {
        if (!mandatoryPeriodIds.has(record.periodId)) continue;
        if (record.status !== "PRESENT") continue;

        if (!studentPresentMap.has(record.studentId)) {
          studentPresentMap.set(record.studentId, new Set());
        }
        studentPresentMap.get(record.studentId)!.add(record.periodId);
      }

      // 이미 부여된 학생 확인
      const existingPointRecords = state.pointRecordsByDivision[divisionSlug] ?? [];
      const alreadyGranted = new Set(
        existingPointRecords
          .filter((record) => record.notes === dupCheckNotes)
          .map((record) => record.studentId),
      );

      // 자격 학생 필터
      const qualifiedStudents = students.filter((student) => {
        if (alreadyGranted.has(student.id)) return false;
        const presentPeriods = studentPresentMap.get(student.id);
        return presentPeriods !== undefined && presentPeriods.size === mandatoryPeriodIds.size;
      });

      if (qualifiedStudents.length === 0) {
        return { grantedCount: 0 };
      }

      const now = new Date().toISOString();
      const newRecords: MockPointRecordRecord[] = qualifiedStudents.map((student, index) => ({
        id: `mock-perfect-att-${divisionSlug}-${date}-${student.id}-${index}`,
        studentId: student.id,
        ruleId: null,
        points: settings.perfectAttendancePts,
        date: new Date(date + "T00:00:00Z").toISOString(),
        notes: dupCheckNotes,
        recordedById: actorId,
        createdAt: now,
      }));

      state.pointRecordsByDivision[divisionSlug] = [
        ...newRecords,
        ...existingPointRecords,
      ];

      return { grantedCount: newRecords.length };
    });
  }

  const prisma = await getPrismaClient();
  const division = await getDivisionOrThrow(divisionSlug);
  const { start } = toUtcDateRange(date);

  // 해당 날짜 전체 출결 기록 조회
  const dayRecords = await prisma.attendance.findMany({
    where: {
      date: start,
      student: { divisionId: division.id },
    },
    select: {
      studentId: true,
      periodId: true,
      status: true,
    },
  });

  // 학생별 필수 교시 출석 맵
  const studentPresentMap = new Map<string, Set<string>>();
  for (const record of dayRecords) {
    if (!mandatoryPeriodIds.has(record.periodId)) continue;
    if (record.status !== "PRESENT") continue;

    if (!studentPresentMap.has(record.studentId)) {
      studentPresentMap.set(record.studentId, new Set());
    }
    studentPresentMap.get(record.studentId)!.add(record.periodId);
  }

  // 자격 학생 후보 (모든 필수 교시 출석)
  const candidateStudentIds = students
    .filter((student) => {
      const presentPeriods = studentPresentMap.get(student.id);
      return presentPeriods !== undefined && presentPeriods.size === mandatoryPeriodIds.size;
    })
    .map((student) => student.id);

  if (candidateStudentIds.length === 0) {
    return { grantedCount: 0 };
  }

  // 이미 부여된 학생 확인
  const alreadyGrantedRecords = await prisma.pointRecord.findMany({
    where: {
      studentId: { in: candidateStudentIds },
      notes: dupCheckNotes,
    },
    select: { studentId: true },
  });

  const alreadyGranted = new Set(alreadyGrantedRecords.map((record) => record.studentId));
  const finalStudentIds = candidateStudentIds.filter((id) => !alreadyGranted.has(id));

  if (finalStudentIds.length === 0) {
    return { grantedCount: 0 };
  }

  await prisma.pointRecord.createMany({
    data: finalStudentIds.map((studentId) => ({
      studentId,
      ruleId: null,
      points: settings.perfectAttendancePts,
      date: start,
      notes: dupCheckNotes,
      recordedById: actorId,
    })),
  });

  return { grantedCount: finalStudentIds.length };
}

export async function upsertAttendanceBatch(
  divisionSlug: string,
  actor: AttendanceActor,
  input: {
    periodId: string;
    date: string;
    records: AttendanceInputRecord[];
  },
) {
  const normalizedDate = normalizeDate(input.date);
  await ensureAssistantAllowed(divisionSlug, actor, normalizedDate);

  const [students, periods] = await Promise.all([
    getSeatedStudents(divisionSlug),
    getPeriods(divisionSlug),
  ]);

  const period = periods.find((item) => item.id === input.periodId);
  if (!period) {
    throw notFound("교시 정보를 찾을 수 없습니다.");
  }

  const studentIds = new Set(students.map((student) => student.id));
  for (const record of input.records) {
    if (!studentIds.has(record.studentId)) {
      throw badRequest("직렬에 속하지 않은 학생이 포함되어 있습니다.");
    }
  }

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const current = state.attendanceByDivision[divisionSlug] ?? [];
      const touchedMap = new Map(current.map((record) => [buildRecordId(record), record]));
      const now = new Date();

      for (const record of input.records) {
        const id = buildRecordId({
          studentId: record.studentId,
          periodId: input.periodId,
          date: normalizedDate,
        });

        const checkInTime = resolveCheckInTime(
          record.status,
          normalizedDate,
          period.startTime,
          now,
        );

        touchedMap.set(id, {
          id,
          studentId: record.studentId,
          periodId: input.periodId,
          date: normalizedDate,
          status: record.status as MockAttendanceStatus,
          reason: record.reason?.trim() ? record.reason.trim() : null,
          checkInTime: checkInTime ? checkInTime.toISOString() : null,
          recordedById: actor.id,
          createdAt: touchedMap.get(id)?.createdAt ?? now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }

      const nextRecords = Array.from(touchedMap.values());
      state.attendanceByDivision[divisionSlug] = nextRecords;

      const snapshot = {
        date: normalizedDate,
        students,
        periods: serializePeriods([period]),
        records: nextRecords
          .filter((record) => record.date === normalizedDate && record.periodId === input.periodId)
          .map((record) => ({
            id: record.id,
            studentId: record.studentId,
            periodId: record.periodId,
            date: record.date,
            status: record.status,
            reason: record.reason,
            checkInTime: record.checkInTime ?? null,
          })),
      };

      try {
        await checkAndGrantPerfectAttendancePoints(divisionSlug, normalizedDate, actor.id);
      } catch (error) {
        console.error("[PerfectAttendancePoints]", error);
      }

      return snapshot;
    });
  }

  const prisma = await getPrismaClient();
  const division = await getDivisionOrThrow(divisionSlug);
  const { start } = toUtcDateRange(normalizedDate);
  const now = new Date();

  await prisma.$transaction(
    input.records.map((record) => {
      const checkInTime = resolveCheckInTime(
        record.status,
        normalizedDate,
        period.startTime,
        now,
      );

      return prisma.attendance.upsert({
        where: {
          studentId_periodId_date: {
            studentId: record.studentId,
            periodId: input.periodId,
            date: start,
          },
        },
        update: {
          status: record.status,
          reason: record.reason?.trim() ? record.reason.trim() : null,
          checkInTime,
          recordedById: actor.id,
        },
        create: {
          studentId: record.studentId,
          periodId: input.periodId,
          date: start,
          status: record.status,
          reason: record.reason?.trim() ? record.reason.trim() : null,
          checkInTime,
          recordedById: actor.id,
        },
      });
    }),
  );

  const updated = await prisma.attendance.findMany({
    where: {
      date: start,
      periodId: input.periodId,
      student: {
        divisionId: division.id,
      },
    },
  });

  const snapshot = {
    date: normalizedDate,
    students,
    periods: serializePeriods([period]),
    records: updated.map((record) => ({
      id: record.id,
      studentId: record.studentId,
      periodId: record.periodId,
      date: normalizedDate,
      status: record.status,
      reason: record.reason,
      checkInTime: record.checkInTime ? record.checkInTime.toISOString() : null,
    })),
  };

  try {
    await checkAndGrantPerfectAttendancePoints(divisionSlug, normalizedDate, actor.id);
  } catch (error) {
    console.error("[PerfectAttendancePoints]", error);
  }

  return snapshot;
}

function enumerateDates(dateFrom: string, dateTo: string) {
  const dates: string[] = [];
  const [fromYear, fromMonth, fromDay] = dateFrom.split("-").map(Number);
  const [toYear, toMonth, toDay] = dateTo.split("-").map(Number);

  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const end = new Date(Date.UTC(toYear, toMonth - 1, toDay));

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export async function getAttendanceStats(
  divisionSlug: string,
  dateFrom: string,
  dateTo: string,
): Promise<AttendanceStats> {
  const normalizedFrom = normalizeDate(dateFrom);
  const normalizedTo = normalizeDate(dateTo);
  const context = await getAttendanceContext(divisionSlug);
  const students = context.students;
  const periods = context.periods;
  const dates = enumerateDates(normalizedFrom, normalizedTo);
  const mandatoryPeriods = periods.filter((period) => period.isMandatory && period.isActive);

  let records: AttendanceSnapshot["records"] = [];

  if (isMockMode()) {
    const state = await readMockState();
    records = (state.attendanceByDivision[divisionSlug] ?? []).filter((record) => {
      return record.date >= normalizedFrom && record.date <= normalizedTo;
    });
  } else {
    const prisma = await getPrismaClient();
    const { start } = toUtcDateRange(normalizedFrom);
    const { end } = toUtcDateRange(normalizedTo);

    const dbRecords = await prisma.attendance.findMany({
      where: {
        date: {
          gte: start,
          lt: end,
        },
        student: {
          division: {
            slug: divisionSlug,
          },
        },
      },
      select: {
        id: true,
        studentId: true,
        periodId: true,
        date: true,
        status: true,
        reason: true,
        checkInTime: true,
      },
    });

    records = dbRecords.map((record) => ({
      id: record.id,
      studentId: record.studentId,
      periodId: record.periodId,
      date: record.date.toISOString().slice(0, 10),
      status: record.status,
      reason: record.reason,
      checkInTime: record.checkInTime ? record.checkInTime.toISOString() : null,
    }));
  }

  const totals = createEmptyCounts();
  const periodSummaries = periods.map((period) => ({
    periodId: period.id,
    periodName: period.name,
    isMandatory: period.isMandatory && period.isActive,
    counts: createEmptyCounts(),
    attendanceRate: 0,
  }));

  for (const record of records) {
    totals[statusKey(record.status)] += 1;

    const summary = periodSummaries.find((item) => item.periodId === record.periodId);
    if (summary) {
      summary.counts[statusKey(record.status)] += 1;
    }
  }

  for (const summary of periodSummaries) {
    const expectedPerPeriod = summary.isMandatory ? students.length * dates.length : 0;
    const processed = Object.entries(summary.counts)
      .filter(([key]) => key !== "unprocessed")
      .reduce((sum, [, value]) => sum + value, 0);
    summary.counts.unprocessed = Math.max(expectedPerPeriod - processed, 0);

    const presentLike =
      summary.counts.present +
      summary.counts.tardy +
      summary.counts.holiday +
      summary.counts.half_holiday;
    const expected = summary.isMandatory
      ? expectedPerPeriod - summary.counts.not_applicable
      : processed;

    summary.attendanceRate = expected > 0 ? Number(((presentLike / expected) * 100).toFixed(1)) : 0;
  }

  const processedTotal = Object.entries(totals)
    .filter(([key]) => key !== "unprocessed")
    .reduce((sum, [, value]) => sum + value, 0);

  totals.unprocessed = Math.max(students.length * mandatoryPeriods.length * dates.length - processedTotal, 0);

  const presentLikeTotal = totals.present + totals.tardy + totals.holiday + totals.half_holiday;
  const expectedTotal = students.length * mandatoryPeriods.length * dates.length - totals.not_applicable;
  const attendanceRate =
    expectedTotal > 0 ? Number(((presentLikeTotal / expectedTotal) * 100).toFixed(1)) : 0;

  return {
    dateFrom: normalizedFrom,
    dateTo: normalizedTo,
    totals,
    attendanceRate,
    periods: periodSummaries.map((summary) => ({
      periodId: summary.periodId,
      periodName: summary.periodName,
      counts: summary.counts,
      attendanceRate: summary.attendanceRate,
    })),
  };
}
