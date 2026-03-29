import type { DivisionFeatureFlags } from "@/lib/division-features";
import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { listAnnouncements, type AnnouncementItem } from "@/lib/services/announcement.service";
import { getNextExamSchedule, type ExamScheduleItem } from "@/lib/services/exam-schedule.service";
import { getLatestExamSummaryForStudent } from "@/lib/services/exam.service";
import { type PointRecordItem, listPointRecords } from "@/lib/services/point.service";
import { getPeriods } from "@/lib/services/period.service";
import { getDivisionSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail, type StudentDetail } from "@/lib/services/student.service";
import { getStudentMonthlyStudyMinutes } from "@/lib/services/study-time.service";

type AttendanceStatus =
  | "PRESENT"
  | "TARDY"
  | "ABSENT"
  | "EXCUSED"
  | "HOLIDAY"
  | "HALF_HOLIDAY"
  | "NOT_APPLICABLE";

export type StudentAttendanceCellStatus = AttendanceStatus | "UNPROCESSED" | "UPCOMING" | "OFF";

export type StudentDashboardData = {
  division: {
    slug: string;
    name: string;
    fullName: string;
    color: string;
  };
  featureFlags: DivisionFeatureFlags;
  student: StudentDetail;
  summary: {
    monthlyAttendanceRate: number;
    monthlyAttendedCount: number;
    monthlyExpectedCount: number;
    weeklyAttendedCount: number;
    weeklyExpectedCount: number;
    monthlyStudyMinutes: number;
    monthlyStudyHours: number;
    monthlyStudyMinutesRemainder: number;
  };
  weeklyAttendance: {
    dates: Array<{
      date: string;
      label: string;
      shortLabel: string;
      isToday: boolean;
      isOperatingDay: boolean;
    }>;
    rows: Array<{
      periodId: string;
      periodName: string;
      label: string | null;
      startTime: string;
      endTime: string;
      isMandatory: boolean;
      cells: Array<{
        date: string;
        status: StudentAttendanceCellStatus;
        label: string;
        reason: string | null;
      }>;
    }>;
  };
  recentPoints: PointRecordItem[];
  latestExam: {
    id: string;
    examTypeName: string;
    examRound: number;
    examDate: string | null;
    totalScore: number | null;
    rankInClass: number | null;
    notes: string | null;
  } | null;
  upcomingExamSchedule: ExamScheduleItem | null;
  pinnedAnnouncements: AnnouncementItem[];
  recentAnnouncements: AnnouncementItem[];
  enrollment: {
    courseStartDate: string | null;
    courseEndDate: string;
    daysRemaining: number;
    expirationWarningDays: number;
  } | null;
};

type StudentAttendanceRecord = {
  periodId: string;
  date: string;
  status: AttendanceStatus;
  reason: string | null;
};

type OperatingDays = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", boolean>;

const PRESENT_LIKE_STATUSES = new Set<AttendanceStatus>([
  "PRESENT",
  "TARDY",
  "HOLIDAY",
  "HALF_HOLIDAY",
]);

const DEFAULT_OPERATING_DAYS: OperatingDays = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: false,
};

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

function getKstToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
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

function getWeekDates(today: string) {
  const current = parseDateKey(today);
  const weekday = current.getUTCDay();
  const diffToMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = new Date(current);
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);

  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(monday);
    next.setUTCDate(next.getUTCDate() + index);
    return formatDateKey(next);
  });
}

function getWeekdayKey(date: string): keyof OperatingDays {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][parseDateKey(date).getUTCDay()] as keyof OperatingDays;
}

function getDateTimeInKst(date: string, time: string) {
  return new Date(`${date}T${time}:00+09:00`);
}

function hasPeriodStarted(date: string, startTime: string, now: Date) {
  return now >= getDateTimeInKst(date, startTime);
}

function hasPeriodEnded(date: string, endTime: string, now: Date) {
  return now >= getDateTimeInKst(date, endTime);
}

function normalizeOperatingDays(value: unknown): OperatingDays {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_OPERATING_DAYS;
  }

  const incoming = value as Record<string, unknown>;

  return {
    mon: typeof incoming.mon === "boolean" ? incoming.mon : DEFAULT_OPERATING_DAYS.mon,
    tue: typeof incoming.tue === "boolean" ? incoming.tue : DEFAULT_OPERATING_DAYS.tue,
    wed: typeof incoming.wed === "boolean" ? incoming.wed : DEFAULT_OPERATING_DAYS.wed,
    thu: typeof incoming.thu === "boolean" ? incoming.thu : DEFAULT_OPERATING_DAYS.thu,
    fri: typeof incoming.fri === "boolean" ? incoming.fri : DEFAULT_OPERATING_DAYS.fri,
    sat: typeof incoming.sat === "boolean" ? incoming.sat : DEFAULT_OPERATING_DAYS.sat,
    sun: typeof incoming.sun === "boolean" ? incoming.sun : DEFAULT_OPERATING_DAYS.sun,
  };
}

function buildAttendanceRecordMap(records: StudentAttendanceRecord[]) {
  return new Map(records.map((record) => [`${record.date}:${record.periodId}`, record]));
}

function buildAttendanceCellStatus(
  record: StudentAttendanceRecord | undefined,
  date: string,
  startTime: string,
  isOperatingDay: boolean,
  now: Date,
): StudentAttendanceCellStatus {
  if (!isOperatingDay) {
    return "OFF";
  }

  if (!hasPeriodStarted(date, startTime, now)) {
    return "UPCOMING";
  }

  if (!record) {
    return "UNPROCESSED";
  }

  return record.status;
}

function getAttendanceCellLabel(status: StudentAttendanceCellStatus) {
  switch (status) {
    case "PRESENT":
      return "출석";
    case "TARDY":
      return "지각";
    case "ABSENT":
      return "결석";
    case "EXCUSED":
      return "사유";
    case "HOLIDAY":
      return "외출";
    case "HALF_HOLIDAY":
      return "반휴";
    case "NOT_APPLICABLE":
      return "제외";
    case "UPCOMING":
      return "예정";
    case "OFF":
      return "휴무";
    default:
      return "미처리";
  }
}

function calculateAttendanceSummary(options: {
  dates: string[];
  periods: Array<{
    id: string;
    endTime: string;
    isMandatory: boolean;
    isActive: boolean;
  }>;
  recordMap: Map<string, StudentAttendanceRecord>;
  operatingDays: OperatingDays;
  now: Date;
}) {
  let expectedCount = 0;
  let attendedCount = 0;

  for (const date of options.dates) {
    if (!options.operatingDays[getWeekdayKey(date)]) {
      continue;
    }

    for (const period of options.periods) {
      if (!period.isActive || !period.isMandatory || !hasPeriodEnded(date, period.endTime, options.now)) {
        continue;
      }

      expectedCount += 1;

      const record = options.recordMap.get(`${date}:${period.id}`);

      if (record && PRESENT_LIKE_STATUSES.has(record.status)) {
        attendedCount += 1;
      }
    }
  }

  return {
    expectedCount,
    attendedCount,
    rate: expectedCount > 0 ? Number(((attendedCount / expectedCount) * 100).toFixed(1)) : 0,
  };
}

async function getStudentAttendanceRecords(
  divisionSlug: string,
  studentId: string,
  dateFrom: string,
  dateTo: string,
) {
  if (isMockMode()) {
    const state = await readMockState();

    return (state.attendanceByDivision[divisionSlug] ?? [])
      .filter(
        (record) =>
          record.studentId === studentId &&
          record.date >= dateFrom &&
          record.date <= dateTo,
      )
      .map((record) => ({
        periodId: record.periodId,
        date: record.date,
        status: record.status,
        reason: record.reason,
      })) satisfies StudentAttendanceRecord[];
  }

  const prisma = await getPrismaClient();
  const from = parseDateKey(dateFrom);
  const to = parseDateKey(dateTo);
  to.setUTCDate(to.getUTCDate() + 1);

  const records = await prisma.attendance.findMany({
    where: {
      studentId,
      date: {
        gte: from,
        lt: to,
      },
      student: {
        division: {
          slug: divisionSlug,
        },
      },
    },
    select: {
      periodId: true,
      date: true,
      status: true,
      reason: true,
    },
  });

  return records.map((record) => ({
    periodId: record.periodId,
    date: record.date.toISOString().slice(0, 10),
    status: record.status,
    reason: record.reason,
  })) satisfies StudentAttendanceRecord[];
}

export async function getStudentDashboardData(
  divisionSlug: string,
  studentId: string,
): Promise<StudentDashboardData> {
  const now = new Date();
  const today = getKstToday(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const weekDates = getWeekDates(today);

  const currentMonth = today.slice(0, 7);

  const [student, settings, division, monthlyStudyMinutes] = await Promise.all([
    getStudentDetail(divisionSlug, studentId),
    getDivisionSettings(divisionSlug),
    getDivisionTheme(divisionSlug),
    getStudentMonthlyStudyMinutes(divisionSlug, studentId, currentMonth),
  ]);

  const attendanceManagementEnabled = settings.featureFlags.attendanceManagement;

  const [periods, attendanceRecords] = await Promise.all([
    attendanceManagementEnabled ? getPeriods(divisionSlug) : Promise.resolve([]),
    attendanceManagementEnabled
      ? getStudentAttendanceRecords(divisionSlug, studentId, monthStart, today)
      : Promise.resolve([]),
  ]);

  const [announcements, visibleRecentPoints, visibleLatestExam, visibleUpcomingExamSchedule] =
    await Promise.all([
      settings.featureFlags.announcements ? listAnnouncements(divisionSlug) : Promise.resolve([]),
      settings.featureFlags.pointManagement
        ? listPointRecords(divisionSlug, { studentId, limit: 5 })
        : Promise.resolve([]),
      settings.featureFlags.examManagement
        ? getLatestExamSummaryForStudent(divisionSlug, studentId)
        : Promise.resolve(null),
      settings.featureFlags.examScheduleManagement
        ? getNextExamSchedule(divisionSlug)
        : Promise.resolve(null),
    ]);

  const attendanceRecordMap = buildAttendanceRecordMap(attendanceRecords);
  const operatingDays = normalizeOperatingDays(settings.operatingDays);
  const activePeriods = periods.filter((period) => period.isActive);
  const mandatoryPeriods = activePeriods.filter((period) => period.isMandatory);

  const monthlySummary = calculateAttendanceSummary({
    dates: enumerateDates(monthStart, today),
    periods: mandatoryPeriods,
    recordMap: attendanceRecordMap,
    operatingDays,
    now,
  });

  const weeklySummary = calculateAttendanceSummary({
    dates: weekDates,
    periods: mandatoryPeriods,
    recordMap: attendanceRecordMap,
    operatingDays,
    now,
  });

  return {
    division: {
      slug: divisionSlug,
      name: division.name,
      fullName: division.fullName,
      color: division.color,
    },
    featureFlags: settings.featureFlags,
    student,
    summary: {
      monthlyAttendanceRate: monthlySummary.rate,
      monthlyAttendedCount: monthlySummary.attendedCount,
      monthlyExpectedCount: monthlySummary.expectedCount,
      weeklyAttendedCount: weeklySummary.attendedCount,
      weeklyExpectedCount: weeklySummary.expectedCount,
      monthlyStudyMinutes,
      monthlyStudyHours: Math.floor(monthlyStudyMinutes / 60),
      monthlyStudyMinutesRemainder: monthlyStudyMinutes % 60,
    },
    weeklyAttendance: {
      dates: weekDates.map((date) => ({
        date,
        label: new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "numeric",
          day: "numeric",
          weekday: "short",
        }).format(parseDateKey(date)),
        shortLabel: new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          weekday: "short",
        }).format(parseDateKey(date)),
        isToday: date === today,
        isOperatingDay: operatingDays[getWeekdayKey(date)],
      })),
      rows: activePeriods.map((period) => ({
        periodId: period.id,
        periodName: period.name,
        label: period.label,
        startTime: period.startTime,
        endTime: period.endTime,
        isMandatory: period.isMandatory,
        cells: weekDates.map((date) => {
          const record = attendanceRecordMap.get(`${date}:${period.id}`);
          const status = buildAttendanceCellStatus(
            record,
            date,
            period.startTime,
            operatingDays[getWeekdayKey(date)],
            now,
          );

          return {
            date,
            status,
            label: getAttendanceCellLabel(status),
            reason: record?.reason ?? null,
          };
        }),
      })),
    },
    recentPoints: visibleRecentPoints,
    latestExam: visibleLatestExam,
    upcomingExamSchedule: visibleUpcomingExamSchedule,
    pinnedAnnouncements: announcements.filter((announcement) => announcement.isPinned),
    recentAnnouncements: announcements.slice(0, 4),
    enrollment: (() => {
      const endDate = student.courseEndDate;
      if (!endDate) return null;

      const endMs = new Date(endDate + "T00:00:00+09:00").getTime();
      const todayMs = new Date(today + "T00:00:00+09:00").getTime();
      const daysRemaining = Math.round((endMs - todayMs) / 86400000);

      return {
        courseStartDate: student.courseStartDate,
        courseEndDate: endDate,
        daysRemaining,
        expirationWarningDays: settings.expirationWarningDays,
      };
    })(),
  };
}
