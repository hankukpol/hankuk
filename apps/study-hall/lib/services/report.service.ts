import { unstable_cache } from "next/cache";

import type { DivisionFeatureFlags } from "@/lib/division-features";
import { isMockMode } from "@/lib/mock-data";
import { normalizeYmMonth, normalizeYmdDate } from "@/lib/date-utils";
import { readMockState } from "@/lib/mock-store";
import {
  getLatestExamSummariesForStudents,
  getLatestExamSummaryForStudent,
} from "@/lib/services/exam.service";
import { listInterviews } from "@/lib/services/interview.service";
import { getPeriods } from "@/lib/services/period.service";
import { listPayments } from "@/lib/services/payment.service";
import { listPointRecords, type PointRecordItem } from "@/lib/services/point.service";
import {
  getDivisionFeatureSettings,
  getDivisionTheme,
} from "@/lib/services/settings.service";
import { listStudents, type StudentListItem } from "@/lib/services/student.service";

type AttendanceStatus =
  | "PRESENT"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE";

export type ReportPeriod = "daily" | "weekly" | "monthly";

export type ReportSelection =
  | {
      period: "daily";
      date: string;
    }
  | {
      period: "weekly";
      date: string;
    }
  | {
      period: "monthly";
      month: string;
    };

export type ReportTrendPoint = {
  label: string;
  dateKey: string;
  attendanceRate: number;
  tardyCount: number;
  absentCount: number;
};

export type ReportDailyPeriodRow = {
  periodId: string;
  periodName: string;
  label: string | null;
  attendanceRate: number;
  counts: {
    present: number;
    tardy: number;
    absent: number;
    excused: number;
    holiday: number;
    halfHoliday: number;
    notApplicable: number;
    unprocessed: number;
  };
};

export type ReportStudentRow = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  seatLabel: string | null;
  attendanceRate: number;
  expectedCount: number;
  presentCount: number;
  tardyCount: number;
  absentCount: number;
  excusedCount: number;
  holidayCount: number;
  halfHolidayCount: number;
  unprocessedCount: number;
  pointDelta: number;
  netPoints: number;
  warningStage: string;
  latestExamLabel: string | null;
  latestExamTotal: number | null;
  latestExamRank: number | null;
};

export type ReportPointMover = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  pointDelta: number;
};

export type ReportData = {
  division: {
    slug: string;
    name: string;
    fullName: string;
    color: string;
  };
  featureFlags: DivisionFeatureFlags;
  period: ReportPeriod;
  title: string;
  subtitle: string;
  rangeLabel: string;
  range: {
    dateFrom: string;
    dateTo: string;
    month: string | null;
  };
  trend: ReportTrendPoint[];
  studentRows: ReportStudentRow[];
  dailyPeriodRows: ReportDailyPeriodRow[];
  pointMovers: {
    top: ReportPointMover[];
    bottom: ReportPointMover[];
  };
};

export type ActivityActionType =
  | "POINT"
  | "ATTENDANCE_EDIT"
  | "STUDENT_STATUS"
  | "INTERVIEW";

export type ActivityLogItem = {
  id: string;
  occurredAt: string;
  actionType: ActivityActionType;
  actionLabel: string;
  actorId: string;
  actorName: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  detail: string;
};

export type ActivityLogData = {
  dateFrom: string;
  dateTo: string;
  actorId: string | null;
  actionType: ActivityActionType | null;
  availableActionTypes: ActivityActionType[];
  items: ActivityLogItem[];
  actorOptions: Array<{
    id: string;
    name: string;
  }>;
};

type RawAttendanceRecord = {
  studentId: string;
  periodId: string;
  date: string;
  status: AttendanceStatus;
  reason: string | null;
};

function formatPointDelta(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeDate(value?: string | null) {
  if (!value) {
    return getKstToday();
  }

  return normalizeYmdDate(value, "날짜");
}

function normalizeMonth(value?: string | null) {
  if (!value) {
    return getKstToday().slice(0, 7);
  }

  return normalizeYmMonth(value);
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function enumerateDates(dateFrom: string, dateTo: string) {
  const dates: string[] = [];
  const cursor = parseDateKey(dateFrom);
  const end = parseDateKey(dateTo);

  while (cursor <= end) {
    dates.push(formatDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function getWeekRange(date: string) {
  const current = parseDateKey(date);
  const weekday = current.getUTCDay();
  const diffToMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = new Date(current);
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);

  return {
    dateFrom: formatDateKey(monday),
    dateTo: date,
  };
}

function getMonthRange(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthValue - 1, 1));
  const last = new Date(Date.UTC(year, monthValue, 0));
  const today = getKstToday();

  return {
    dateFrom: formatDateKey(first),
    dateTo: month === today.slice(0, 7) ? today : formatDateKey(last),
  };
}

function buildReportRange(selection: ReportSelection) {
  if (selection.period === "daily") {
    return {
      dateFrom: selection.date,
      dateTo: selection.date,
      month: selection.date.slice(0, 7),
    };
  }

  if (selection.period === "weekly") {
    const range = getWeekRange(selection.date);
    return {
      ...range,
      month: range.dateFrom.slice(0, 7),
    };
  }

  const range = getMonthRange(selection.month);
  return {
    ...range,
    month: selection.month,
  };
}

export function resolveReportSelection(searchParams?: {
  period?: string;
  date?: string;
  month?: string;
}) {
  const period = searchParams?.period;

  if (period === "weekly") {
    return {
      period: "weekly",
      date: normalizeDate(searchParams?.date),
    } satisfies ReportSelection;
  }

  if (period === "monthly") {
    return {
      period: "monthly",
      month: normalizeMonth(searchParams?.month),
    } satisfies ReportSelection;
  }

  return {
    period: "daily",
    date: normalizeDate(searchParams?.date),
  } satisfies ReportSelection;
}

async function listAttendanceRangeRecords(
  divisionSlug: string,
  dateFrom: string,
  dateTo: string,
) {
  if (isMockMode()) {
    const state = await readMockState();

    return (state.attendanceByDivision[divisionSlug] ?? [])
      .filter((record) => record.date >= dateFrom && record.date <= dateTo)
      .map((record) => ({
        studentId: record.studentId,
        periodId: record.periodId,
        date: record.date,
        status: record.status as AttendanceStatus,
        reason: record.reason,
      })) satisfies RawAttendanceRecord[];
  }

  const { prisma } = await import("@/lib/prisma");

  const start = parseDateKey(dateFrom);
  const end = parseDateKey(dateTo);
  end.setUTCDate(end.getUTCDate() + 1);

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
    },
    select: {
      studentId: true,
      periodId: true,
      date: true,
      status: true,
      reason: true,
    },
  });

  return records.map((record) => ({
    studentId: record.studentId,
    periodId: record.periodId,
    date: record.date.toISOString().slice(0, 10),
    status: record.status,
    reason: record.reason,
  })) satisfies RawAttendanceRecord[];
}

function createStatusCounts() {
  return {
    present: 0,
    tardy: 0,
    absent: 0,
    excused: 0,
    holiday: 0,
    halfHoliday: 0,
    notApplicable: 0,
    unprocessed: 0,
  };
}

function addAttendanceCount(
  counts: ReturnType<typeof createStatusCounts>,
  status: AttendanceStatus,
) {
  switch (status) {
    case "PRESENT":
      counts.present += 1;
      break;
    case "TARDY":
      counts.tardy += 1;
      break;
    case "ABSENT":
      counts.absent += 1;
      break;
    case "EXCUSED":
      counts.excused += 1;
      break;
    case "HOLIDAY":
      counts.holiday += 1;
      break;
    case "HALF_HOLIDAY":
      counts.halfHoliday += 1;
      break;
    case "NOT_APPLICABLE":
      counts.notApplicable += 1;
      break;
  }
}

function toAttendanceRate(counts: ReturnType<typeof createStatusCounts>, expectedCount: number) {
  const attended = counts.present + counts.tardy + counts.holiday + counts.halfHoliday;
  return expectedCount > 0 ? Number(((attended / expectedCount) * 100).toFixed(1)) : 0;
}

async function buildExamSummaryMap(
  divisionSlug: string,
  students: StudentListItem[],
) {
  return getLatestExamSummariesForStudents(
    divisionSlug,
    students.map((student) => student.id),
  );
}

function buildStudentRows(
  students: StudentListItem[],
  mandatoryPeriods: Array<{ id: string }>,
  dates: string[],
  attendanceRecords: RawAttendanceRecord[],
  pointRecords: PointRecordItem[],
  examSummaryMap: Map<string, Awaited<ReturnType<typeof getLatestExamSummaryForStudent>>>,
) {
  const recordMap = new Map<string, RawAttendanceRecord[]>();

  for (const record of attendanceRecords) {
    const key = `${record.studentId}:${record.date}`;
    const current = recordMap.get(key) ?? [];
    current.push(record);
    recordMap.set(key, current);
  }

  const pointDeltaByStudent = new Map<string, number>();
  for (const record of pointRecords) {
    pointDeltaByStudent.set(
      record.studentId,
      (pointDeltaByStudent.get(record.studentId) ?? 0) + record.points,
    );
  }

  return students
    .map((student) => {
      const counts = createStatusCounts();
      let expectedCount = 0;

      for (const date of dates) {
        const dayRecords = recordMap.get(`${student.id}:${date}`) ?? [];
        const byPeriodId = new Map(dayRecords.map((record) => [record.periodId, record]));

        for (const period of mandatoryPeriods) {
          const record = byPeriodId.get(period.id);

          if (!record) {
            counts.unprocessed += 1;
            expectedCount += 1;
            continue;
          }

          addAttendanceCount(counts, record.status);

          if (record.status !== "NOT_APPLICABLE") {
            expectedCount += 1;
          }
        }
      }

      const examSummary = examSummaryMap.get(student.id) ?? null;

      return {
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.studentNumber,
        seatLabel: student.seatLabel,
        attendanceRate: toAttendanceRate(counts, expectedCount),
        expectedCount,
        presentCount: counts.present,
        tardyCount: counts.tardy,
        absentCount: counts.absent,
        excusedCount: counts.excused,
        holidayCount: counts.holiday,
        halfHolidayCount: counts.halfHoliday,
        unprocessedCount: counts.unprocessed,
        pointDelta: pointDeltaByStudent.get(student.id) ?? 0,
        netPoints: student.netPoints,
        warningStage: student.warningStage,
        latestExamLabel: examSummary
          ? `${examSummary.examTypeName} ${examSummary.examRound}회`
          : null,
        latestExamTotal: examSummary?.totalScore ?? null,
        latestExamRank: examSummary?.rankInClass ?? null,
      } satisfies ReportStudentRow;
    })
    .sort((left, right) => {
      return (
        right.attendanceRate - left.attendanceRate ||
        right.netPoints - left.netPoints ||
        (right.latestExamTotal ?? -1) - (left.latestExamTotal ?? -1) ||
        left.studentNumber.localeCompare(right.studentNumber, "ko")
      );
    });
}

function buildPointMovers(studentRows: ReportStudentRow[]) {
  const ranked = [...studentRows].sort(
    (left, right) =>
      right.pointDelta - left.pointDelta ||
      left.studentNumber.localeCompare(right.studentNumber, "ko"),
  );

  const toMover = (row: ReportStudentRow) => ({
    studentId: row.studentId,
    studentName: row.studentName,
    studentNumber: row.studentNumber,
    pointDelta: row.pointDelta,
  });

  return {
    top: ranked.filter((row) => row.pointDelta > 0).slice(0, 5).map(toMover),
    bottom: [...ranked]
      .reverse()
      .filter((row) => row.pointDelta < 0)
      .slice(0, 5)
      .map(toMover),
  };
}

function buildDailyPeriodRows(
  date: string,
  periods: Array<{
    id: string;
    name: string;
    label: string | null;
    isMandatory: boolean;
    isActive: boolean;
    displayOrder: number;
  }>,
  activeStudentCount: number,
  attendanceRecords: RawAttendanceRecord[],
) {
  return periods
    .filter((period) => period.isActive)
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((period) => {
      const counts = createStatusCounts();
      const records = attendanceRecords.filter(
        (record) => record.date === date && record.periodId === period.id,
      );

      for (const record of records) {
        addAttendanceCount(counts, record.status);
      }

      const processed =
        counts.present +
        counts.tardy +
        counts.absent +
        counts.excused +
        counts.holiday +
        counts.halfHoliday +
        counts.notApplicable;
      counts.unprocessed = Math.max(activeStudentCount - processed, 0);

      const expected = Math.max(activeStudentCount - counts.notApplicable, 0);

      return {
        periodId: period.id,
        periodName: period.name,
        label: period.label,
        attendanceRate: toAttendanceRate(counts, expected),
        counts,
      } satisfies ReportDailyPeriodRow;
    });
}

function buildTrendForPeriodRows(rows: ReportDailyPeriodRow[]) {
  return rows.map((row) => ({
    label: row.periodName,
    dateKey: row.periodId,
    attendanceRate: row.attendanceRate,
    tardyCount: row.counts.tardy,
    absentCount: row.counts.absent,
  })) satisfies ReportTrendPoint[];
}

function buildTrendForDates(
  dates: string[],
  mandatoryPeriods: Array<{ id: string }>,
  activeStudentCount: number,
  attendanceRecords: RawAttendanceRecord[],
) {
  return dates.map((date) => {
    const counts = createStatusCounts();
    const records = attendanceRecords.filter((record) => record.date === date);

    for (const record of records) {
      if (!mandatoryPeriods.some((period) => period.id === record.periodId)) {
        continue;
      }

      addAttendanceCount(counts, record.status);
    }

    const expected =
      activeStudentCount * mandatoryPeriods.length - counts.notApplicable;

    return {
      label: new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
      }).format(parseDateKey(date)),
      dateKey: date,
      attendanceRate: toAttendanceRate(counts, expected),
      tardyCount: counts.tardy,
      absentCount: counts.absent + counts.excused,
    } satisfies ReportTrendPoint;
  });
}

function buildTitles(selection: ReportSelection, range: ReturnType<typeof buildReportRange>) {
  if (selection.period === "daily") {
    return {
      title: "일간 보고서",
      subtitle: "선택한 날짜의 교시별 출석 현황과 학생별 상태를 확인합니다.",
      rangeLabel: selection.date,
    };
  }

  if (selection.period === "weekly") {
    return {
      title: "주간 보고서",
      subtitle: "이번 주 누적 출석률과 상벌점 변동 상·하위 학생을 확인합니다.",
      rangeLabel: `${range.dateFrom} ~ ${range.dateTo}`,
    };
  }

  return {
    title: "월간 보고서",
    subtitle: "월간 출석 추이와 학생별 출석률·상벌점 종합 순위를 확인합니다.",
    rangeLabel: selection.month,
  };
}

function buildAvailableActivityActionTypes(featureFlags: DivisionFeatureFlags) {
  return [
    featureFlags.pointManagement ? "POINT" : null,
    featureFlags.attendanceManagement ? "ATTENDANCE_EDIT" : null,
    featureFlags.studentManagement ? "STUDENT_STATUS" : null,
    featureFlags.interviewManagement ? "INTERVIEW" : null,
  ].filter(Boolean) as ActivityActionType[];
}

function getDefaultActivityRange() {
  const dateTo = getKstToday();
  const dateFrom = enumerateDates(addDays(dateTo, -29), dateTo)[0] ?? addDays(dateTo, -29);
  return { dateFrom, dateTo };
}

function addDays(date: string, offsetDays: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return next.toISOString().slice(0, 10);
}

export function resolveActivityLogSelection(searchParams?: {
  activityDateFrom?: string;
  activityDateTo?: string;
  activityActorId?: string;
  activityActionType?: string;
}) {
  const defaults = getDefaultActivityRange();
  const dateFrom = normalizeDate(searchParams?.activityDateFrom ?? defaults.dateFrom);
  const dateTo = normalizeDate(searchParams?.activityDateTo ?? defaults.dateTo);
  const actorId = searchParams?.activityActorId?.trim() || null;
  const actionType =
    searchParams?.activityActionType &&
    ["POINT", "ATTENDANCE_EDIT", "STUDENT_STATUS", "INTERVIEW"].includes(
      searchParams.activityActionType,
    )
      ? (searchParams.activityActionType as ActivityActionType)
      : null;

  return {
    dateFrom: dateFrom <= dateTo ? dateFrom : dateTo,
    dateTo: dateTo >= dateFrom ? dateTo : dateFrom,
    actorId,
    actionType,
  };
}

async function listAttendanceEditLogs(
  divisionSlug: string,
  dateFrom: string,
  dateTo: string,
): Promise<ActivityLogItem[]> {
  const studentMap = new Map((await listStudents(divisionSlug)).map((student) => [student.id, student]));

  if (isMockMode()) {
    const state = await readMockState();
    const adminNameById = new Map(state.admins.map((admin) => [admin.id, admin.name]));

    return (state.attendanceByDivision[divisionSlug] ?? [])
      .filter((record) => record.updatedAt !== record.createdAt)
      .filter((record) => {
        const updatedDate = record.updatedAt.slice(0, 10);
        return updatedDate >= dateFrom && updatedDate <= dateTo;
      })
      .map((record) => {
        const student = studentMap.get(record.studentId);

        if (!student) {
          return null;
        }

        return {
          id: `attendance-edit-${record.id}`,
          occurredAt: record.updatedAt,
          actionType: "ATTENDANCE_EDIT",
          actionLabel: "출석 수정",
          actorId: record.recordedById ?? "system",
          actorName: record.recordedById ? adminNameById.get(record.recordedById) ?? "담당자" : "시스템",
          studentId: student.id,
          studentName: student.name,
          studentNumber: student.studentNumber,
          detail: `${record.date} · ${record.status}${record.reason ? ` · ${record.reason}` : ""}`,
        } satisfies ActivityLogItem;
      })
      .filter(Boolean) as ActivityLogItem[];
  }

  const { prisma } = await import("@/lib/prisma");

  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${addDays(dateTo, 1)}T00:00:00.000Z`);
  const records = await prisma.attendance.findMany({
    where: {
      updatedAt: {
        gte: start,
        lt: end,
      },
      student: {
        division: {
          slug: divisionSlug,
        },
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
      recordedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return records
    .filter((record) => record.updatedAt.getTime() !== record.createdAt.getTime())
    .map((record) => ({
      id: `attendance-edit-${record.id}`,
      occurredAt: record.updatedAt.toISOString(),
      actionType: "ATTENDANCE_EDIT",
      actionLabel: "출석 수정",
      actorId: record.recordedBy?.id ?? "system",
      actorName: record.recordedBy?.name ?? "시스템",
      studentId: record.student.id,
      studentName: record.student.name,
      studentNumber: record.student.studentNumber,
      detail: `${record.date.toISOString().slice(0, 10)} · ${record.status}${record.reason ? ` · ${record.reason}` : ""}`,
    })) satisfies ActivityLogItem[];
}

async function listStudentStatusLogs(
  divisionSlug: string,
  dateFrom: string,
  dateTo: string,
): Promise<ActivityLogItem[]> {
  const students = await listStudents(divisionSlug);

  return students
    .filter((student) => student.status !== "ACTIVE")
    .filter((student) => {
      const updatedDate = student.updatedAt.slice(0, 10);
      return updatedDate >= dateFrom && updatedDate <= dateTo;
    })
    .map((student) => ({
      id: `student-status-${student.id}-${student.updatedAt}`,
      occurredAt: student.updatedAt,
      actionType: "STUDENT_STATUS",
      actionLabel: "학생 상태 변경",
      actorId: "system",
      actorName: "시스템",
      studentId: student.id,
      studentName: student.name,
      studentNumber: student.studentNumber,
      detail:
        student.status === "WITHDRAWN"
          ? `퇴실 처리${student.withdrawnNote ? ` · ${student.withdrawnNote}` : ""}`
          : student.status === "GRADUATED"
            ? "수료 처리"
            : "일시중단 상태",
    })) satisfies ActivityLogItem[];
}

export async function getActivityLogData(
  divisionSlug: string,
  options?: {
    dateFrom?: string;
    dateTo?: string;
    actorId?: string | null;
    actionType?: ActivityActionType | null;
  },
): Promise<ActivityLogData> {
  const featureFlags = (await getDivisionFeatureSettings(divisionSlug)).featureFlags;
  const selection = resolveActivityLogSelection({
    activityDateFrom: options?.dateFrom,
    activityDateTo: options?.dateTo,
    activityActorId: options?.actorId ?? undefined,
    activityActionType: options?.actionType ?? undefined,
  });
  const availableActionTypes = buildAvailableActivityActionTypes(featureFlags);
  const [pointRecords, interviews, attendanceEdits, studentStatusLogs] = await Promise.all([
    featureFlags.pointManagement ? listPointRecords(divisionSlug) : Promise.resolve([]),
    featureFlags.interviewManagement ? listInterviews(divisionSlug) : Promise.resolve([]),
    featureFlags.attendanceManagement
      ? listAttendanceEditLogs(divisionSlug, selection.dateFrom, selection.dateTo)
      : Promise.resolve([]),
    featureFlags.studentManagement
      ? listStudentStatusLogs(divisionSlug, selection.dateFrom, selection.dateTo)
      : Promise.resolve([]),
  ]);

  const pointLogs = pointRecords
    .filter((record) => {
      const createdDate = record.createdAt.slice(0, 10);
      return createdDate >= selection.dateFrom && createdDate <= selection.dateTo;
    })
    .map((record) => ({
      id: `point-${record.id}`,
      occurredAt: record.createdAt,
      actionType: "POINT",
      actionLabel: "상벌점 부여",
      actorId: record.recordedById,
      actorName: record.recordedByName,
      studentId: record.studentId,
      studentName: record.studentName,
      studentNumber: record.studentNumber,
      detail: `${record.ruleName || "직접 입력"} · ${formatPointDelta(record.points)}점${record.notes ? ` · ${record.notes}` : ""}`,
    })) satisfies ActivityLogItem[];

  const interviewLogs = interviews
    .filter((record) => {
      const createdDate = record.createdAt.slice(0, 10);
      return createdDate >= selection.dateFrom && createdDate <= selection.dateTo;
    })
    .map((record) => ({
      id: `interview-${record.id}`,
      occurredAt: record.createdAt,
      actionType: "INTERVIEW",
      actionLabel: "면담 생성",
      actorId: record.createdById,
      actorName: record.createdByName,
      studentId: record.studentId,
      studentName: record.studentName,
      studentNumber: record.studentNumber,
      detail: `${record.reason}${record.result ? ` · ${record.result}` : ""}`,
    })) satisfies ActivityLogItem[];

  const merged = [...pointLogs, ...attendanceEdits, ...studentStatusLogs, ...interviewLogs]
    .filter((item) => !selection.actorId || item.actorId === selection.actorId)
    .filter((item) => !selection.actionType || item.actionType === selection.actionType)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  const actorOptions = Array.from(
    new Map(merged.map((item) => [item.actorId, { id: item.actorId, name: item.actorName }])).values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "ko"));

  return {
    dateFrom: selection.dateFrom,
    dateTo: selection.dateTo,
    actorId: selection.actorId,
    actionType: selection.actionType,
    availableActionTypes,
    items: merged,
    actorOptions,
  };
}

function serializeReportSelection(selection: ReportSelection) {
  return selection.period === "monthly"
    ? `${selection.period}:${selection.month}`
    : `${selection.period}:${selection.date}`;
}

function deserializeReportSelection(cacheKey: string): ReportSelection {
  const [period, value] = cacheKey.split(":", 2);

  if (period === "monthly") {
    return {
      period,
      month: value,
    };
  }

  if (period === "daily" || period === "weekly") {
    return {
      period,
      date: value,
    };
  }

  throw new Error("Unsupported cached report selection");
}

async function getReportDataUncached(
  divisionSlug: string,
  selection: ReportSelection,
): Promise<ReportData> {
  const featureFlags = (await getDivisionFeatureSettings(divisionSlug)).featureFlags;
  const range = buildReportRange(selection);
  const [division, students, periods, attendanceRecords, pointRecords] = await Promise.all([
    getDivisionTheme(divisionSlug),
    listStudents(divisionSlug),
    getPeriods(divisionSlug),
    featureFlags.attendanceManagement
      ? listAttendanceRangeRecords(divisionSlug, range.dateFrom, range.dateTo)
      : Promise.resolve([]),
    featureFlags.pointManagement
      ? listPointRecords(divisionSlug, {
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
        })
      : Promise.resolve([]),
  ]);
  const activeStudents = students.filter(
    (student) => student.status === "ACTIVE" || student.status === "ON_LEAVE",
  );
  const mandatoryPeriods = periods.filter((period) => period.isActive && period.isMandatory);
  const [dates, examSummaryMap] = await Promise.all([
    Promise.resolve(enumerateDates(range.dateFrom, range.dateTo)),
    featureFlags.examManagement
      ? buildExamSummaryMap(divisionSlug, activeStudents)
      : Promise.resolve(new Map()),
  ]);
  const studentRows = buildStudentRows(
    activeStudents,
    mandatoryPeriods,
    dates,
    attendanceRecords,
    pointRecords,
    examSummaryMap,
  );
  const dailyPeriodRows = featureFlags.attendanceManagement
    ? buildDailyPeriodRows(range.dateTo, periods, activeStudents.length, attendanceRecords)
    : [];
  const trend =
    !featureFlags.attendanceManagement
      ? []
      : selection.period === "daily"
      ? buildTrendForPeriodRows(dailyPeriodRows)
      : buildTrendForDates(dates, mandatoryPeriods, activeStudents.length, attendanceRecords);
  const titles = buildTitles(selection, range);

  return {
    division: {
      slug: divisionSlug,
      name: division.name,
      fullName: division.fullName,
      color: division.color,
    },
    featureFlags,
    period: selection.period,
    title: titles.title,
    subtitle: titles.subtitle,
    rangeLabel: titles.rangeLabel,
    range,
    trend,
    studentRows,
    dailyPeriodRows,
    pointMovers: buildPointMovers(studentRows),
  };
}

const getReportDataCached = unstable_cache(
  async (divisionSlug: string, selectionCacheKey: string) =>
    getReportDataUncached(divisionSlug, deserializeReportSelection(selectionCacheKey)),
  ["report-data"],
  { revalidate: 120, tags: ["report-data"] },
);

export async function getReportData(
  divisionSlug: string,
  selection: ReportSelection,
  options?: { forceFresh?: boolean },
): Promise<ReportData> {
  if (options?.forceFresh || isMockMode()) {
    return getReportDataUncached(divisionSlug, selection);
  }

  return getReportDataCached(divisionSlug, serializeReportSelection(selection));
}

export async function getPaymentExportRows(
  divisionSlug: string,
  dateFrom: string,
  dateTo: string,
) {
  return listPayments(divisionSlug, { dateFrom, dateTo });
}

export async function getPointExportRows(
  divisionSlug: string,
  dateFrom: string,
  dateTo: string,
) {
  return listPointRecords(divisionSlug, { dateFrom, dateTo });
}

export async function getMonthlyExportRows(
  divisionSlug: string,
  month: string,
) {
  const data = await getReportData(divisionSlug, {
    period: "monthly",
    month,
  });

  return data.studentRows;
}

export async function getAttendanceExportRows(
  divisionSlug: string,
  dateFrom: string,
  dateTo: string,
) {
  const [students, periods, records] = await Promise.all([
    listStudents(divisionSlug),
    getPeriods(divisionSlug),
    listAttendanceRangeRecords(divisionSlug, dateFrom, dateTo),
  ]);

  const studentMap = new Map(students.map((student) => [student.id, student]));
  const periodMap = new Map(periods.map((period) => [period.id, period]));

  return records
    .map((record) => {
      const student = studentMap.get(record.studentId);
      const period = periodMap.get(record.periodId);

      if (!student || !period) {
        return null;
      }

      return {
        date: record.date,
        periodName: period.name,
        periodLabel: period.label,
        studentNumber: student.studentNumber,
        studentName: student.name,
        seatLabel: student.seatLabel,
        status: record.status,
        reason: record.reason,
      };
    })
    .filter(Boolean);
}

export function buildPaymentExportFilename(range: { dateFrom: string; dateTo: string }) {
  return `payments-${range.dateFrom}-${range.dateTo}.xlsx`;
}

export function buildPointsExportFilename(range: { dateFrom: string; dateTo: string }) {
  return `points-${range.dateFrom}-${range.dateTo}.xlsx`;
}

export function buildAttendanceExportFilename(range: { dateFrom: string; dateTo: string }) {
  return `attendance-${range.dateFrom}-${range.dateTo}.xlsx`;
}

export function buildMonthlyExportFilename(month: string) {
  return `monthly-report-${month}.xlsx`;
}

export function buildActivityExportFilename(range: { dateFrom: string; dateTo: string }) {
  return `activity-log-${range.dateFrom}-${range.dateTo}.xlsx`;
}
