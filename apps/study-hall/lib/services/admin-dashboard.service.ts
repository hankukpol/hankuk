import { unstable_cache } from "next/cache";

import { isMockMode } from "@/lib/mock-data";
import type { DivisionFeatureFlags } from "@/lib/division-features";
import { listPointRecords, type PointRecordItem } from "@/lib/services/point.service";
import { listPayments } from "@/lib/services/payment.service";
import { getDivisionSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { listStudents } from "@/lib/services/student.service";
import { getAttendanceSnapshots, type AttendanceSnapshot } from "@/lib/services/attendance.service";
import {
  detectRepeatedAbsent,
  detectRepeatedTardy,
} from "@/lib/services/attendance-pattern.service";
import { listExamSchedules, type ExamScheduleItem } from "@/lib/services/exam-schedule.service";
import { listInterviews } from "@/lib/services/interview.service";
import { listLeavePermissions } from "@/lib/services/leave.service";
import { getPrismaClient } from "@/lib/service-helpers";

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type AdminDashboardData = {
  division: {
    slug: string;
    name: string;
    fullName: string;
    color: string;
  };
  featureFlags: DivisionFeatureFlags;
  summary: {
    todayDate: string;
    attendanceRate: number;
    attendedCount: number;
    expectedCount: number;
    deltaFromYesterday: number;
    riskStudentCount: number;
    uncheckedPeriodCount: number;
    weeklyTardyAbsentCount: number;
    weeklyTardyCount: number;
    weeklyAbsentCount: number;
  };
  periodRows: Array<{
    periodId: string;
    periodName: string;
    label: string | null;
    attendanceRate: number;
    isUnchecked: boolean;
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
  }>;
  riskStudents: Array<{
    id: string;
    name: string;
    studentNumber: string;
    phone: string | null;
    seatLabel: string | null;
    netPoints: number;
    warningStage: string;
  }>;
  attentionStudents: Array<{
    studentId: string;
    studentName: string;
    studentNumber: string;
    seatLabel: string | null;
    phone: string | null;
    type: "TARDY" | "ABSENT";
    count: number;
    message: string;
  }>;
  recentPoints: PointRecordItem[];
  periodSchedules: Array<{
    periodId: string;
    periodName: string;
    startTime: string;
    endTime: string;
  }>;
  studentOverview: {
    activeCount: number;
    onLeaveCount: number;
  };
  paymentStats: {
    thisMonthTotal: number;
    thisMonthCount: number;
    recentPayments: Array<{
      studentName: string;
      studentNumber: string;
      amount: number;
      paymentDate: string;
      paymentTypeName: string;
      method: string | null;
    }>;
  };
  expiringStudents: Array<{
    id: string;
    name: string;
    studentNumber: string;
    studyTrack: string | null;
    phone: string | null;
    seatLabel: string | null;
    courseEndDate: string;
    daysRemaining: number;
  }>;
  upcomingExamSchedules: ExamScheduleItem[];
  newStudents: Array<{
    id: string;
    name: string;
    studentNumber: string;
    studyTrack: string | null;
    phone: string | null;
    seatLabel: string | null;
    enrolledAt: string;
    daysAgo: number;
  }>;
  todayLeaveStudents: Array<{
    id: string;
    studentId: string;
    studentName: string;
    studentNumber: string;
    seatLabel: string | null;
    type: string;
    status: string;
  }>;
  interviewNeededStudents: Array<{
    id: string;
    name: string;
    studentNumber: string;
    seatLabel: string | null;
    phone: string | null;
    netPoints: number;
    warningStage: string;
    lastInterviewDate: string | null;
  }>;
  expirationWarningDays: number;
};

function getKstDate(offsetDays = 0) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return kstDateFormatter.format(base);
}

function getKstDateFromString(date: string, offsetDays: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  target.setUTCDate(target.getUTCDate() + offsetDays);
  return target.toISOString().slice(0, 10);
}

function getPreviousDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  target.setUTCDate(target.getUTCDate() - 1);
  return target.toISOString().slice(0, 10);
}

function getWeekStart(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  const weekday = target.getUTCDay();
  const diffToMonday = weekday === 0 ? 6 : weekday - 1;
  target.setUTCDate(target.getUTCDate() - diffToMonday);
  return target.toISOString().slice(0, 10);
}

function createCounts() {
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

function indexRecordsByPeriod(records: AttendanceSnapshot["records"]) {
  const map = new Map<string, AttendanceSnapshot["records"]>();
  for (const record of records) {
    const list = map.get(record.periodId);
    if (list) {
      list.push(record);
    } else {
      map.set(record.periodId, [record]);
    }
  }
  return map;
}

function countRecords(records: AttendanceSnapshot["records"]) {
  const counts = createCounts();
  for (const record of records) {
    switch (record.status) {
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
  return counts;
}

function buildRateSummary(
  snapshot: AttendanceSnapshot,
  activeStudentCount: number,
  recordsByPeriod: Map<string, AttendanceSnapshot["records"]>,
) {
  const mandatoryPeriods = snapshot.periods.filter((period) => period.isActive && period.isMandatory);
  let attendedCount = 0;
  let expectedCount = 0;

  for (const period of mandatoryPeriods) {
    const counts = countRecords(recordsByPeriod.get(period.id) ?? []);
    attendedCount += counts.present + counts.tardy + counts.holiday + counts.halfHoliday;
    expectedCount += Math.max(activeStudentCount - counts.notApplicable, 0);
  }

  return {
    attendedCount,
    expectedCount,
    attendanceRate:
      expectedCount > 0 ? Number(((attendedCount / expectedCount) * 100).toFixed(1)) : 0,
  };
}

function buildPeriodRows(
  snapshot: AttendanceSnapshot,
  activeStudentCount: number,
  recordsByPeriod: Map<string, AttendanceSnapshot["records"]>,
) {
  return snapshot.periods
    .filter((period) => period.isActive)
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((period) => {
      const counts = countRecords(recordsByPeriod.get(period.id) ?? []);

      const processed =
        counts.present +
        counts.tardy +
        counts.absent +
        counts.excused +
        counts.holiday +
        counts.halfHoliday +
        counts.notApplicable;
      counts.unprocessed = Math.max(activeStudentCount - processed, 0);

      const attended = counts.present + counts.tardy + counts.holiday + counts.halfHoliday;
      const expected = Math.max(activeStudentCount - counts.notApplicable, 0);
      const attendanceRate = expected > 0 ? Number(((attended / expected) * 100).toFixed(1)) : 0;

      return {
        periodId: period.id,
        periodName: period.name,
        label: period.label,
        attendanceRate,
        isUnchecked: period.isMandatory && counts.unprocessed > 0,
        counts,
      };
    });
}

function countWeeklyIssues(
  snapshots: AttendanceSnapshot[],
) {
  let tardyCount = 0;
  let absentCount = 0;

  for (const snapshot of snapshots) {
    for (const record of snapshot.records) {
      if (record.status === "TARDY") {
        tardyCount += 1;
      }

      if (record.status === "ABSENT") {
        absentCount += 1;
      }
    }
  }

  return {
    weeklyTardyCount: tardyCount,
    weeklyAbsentCount: absentCount,
    weeklyTardyAbsentCount: tardyCount + absentCount,
  };
}

function getSnapshotOrThrow(snapshotMap: Map<string, AttendanceSnapshot>, date: string) {
  const snapshot = snapshotMap.get(date);

  if (!snapshot) {
    throw new Error(`출석 스냅샷을 찾을 수 없습니다: ${date}`);
  }

  return snapshot;
}

type RecentInterviewGroup = {
  studentId: string;
  _max: {
    date: Date | null;
  };
};

async function listRecentInterviewGroups(
  divisionSlug: string,
  sinceDate: string,
): Promise<RecentInterviewGroup[]> {
  if (isMockMode()) {
    const interviews = await listInterviews(divisionSlug);
    const latestByStudent = new Map<string, string>();

    for (const interview of interviews) {
      if (interview.date < sinceDate) {
        continue;
      }

      const current = latestByStudent.get(interview.studentId);
      if (!current || interview.date > current) {
        latestByStudent.set(interview.studentId, interview.date);
      }
    }

    return Array.from(latestByStudent.entries()).map(([studentId, date]) => ({
      studentId,
      _max: {
        date: new Date(`${date}T00:00:00Z`),
      },
    }));
  }

  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
    select: { id: true },
  });

  if (!division?.id) {
    return [];
  }

  return prisma.interview.groupBy({
    by: ["studentId"],
    where: {
      student: { divisionId: division.id },
      date: { gte: new Date(`${sinceDate}T00:00:00Z`) },
    },
    _max: { date: true },
  });
}

async function getAdminDashboardDataUncached(divisionSlug: string): Promise<AdminDashboardData> {
  const today = getKstDate();
  const yesterday = getPreviousDate(today);
  const weekStart = getWeekStart(today);
  const weekDates: string[] = [];
  let cursor = weekStart;

  while (cursor <= today) {
    weekDates.push(cursor);
    cursor = getKstDateFromString(cursor, 1);
  }

  const snapshotDates = Array.from(new Set([today, yesterday, ...weekDates]));
  const firstDayOfMonth = today.slice(0, 7) + "-01";

  const thirtyDaysAgo = getKstDateFromString(today, -30);

  const [division, settings] = await Promise.all([
    getDivisionTheme(divisionSlug),
    getDivisionSettings(divisionSlug),
  ]);

  const attendanceManagementEnabled = settings.featureFlags.attendanceManagement;
  const studentManagementEnabled = settings.featureFlags.studentManagement;
  const pointManagementEnabled = settings.featureFlags.pointManagement;
  const leaveManagementEnabled = settings.featureFlags.leaveManagement;
  const warningManagementEnabled = settings.featureFlags.warningManagement;
  const interviewManagementEnabled = settings.featureFlags.interviewManagement;
  const examScheduleManagementEnabled = settings.featureFlags.examScheduleManagement;
  const paymentManagementEnabled = settings.featureFlags.paymentManagement;

  const [students, snapshots, recentPoints, thisMonthPayments, todayLeaves, interviewGroups, examSchedules, repeatedTardy, repeatedAbsent] = await Promise.all([
    listStudents(divisionSlug),
    attendanceManagementEnabled
      ? getAttendanceSnapshots(divisionSlug, snapshotDates)
      : Promise.resolve([] as AttendanceSnapshot[]),
    pointManagementEnabled
      ? listPointRecords(divisionSlug, { limit: 5 })
      : Promise.resolve([] as PointRecordItem[]),
    paymentManagementEnabled
      ? listPayments(divisionSlug, { dateFrom: firstDayOfMonth, dateTo: today }).catch(() => [] as Awaited<ReturnType<typeof listPayments>>)
      : Promise.resolve([] as Awaited<ReturnType<typeof listPayments>>),
    leaveManagementEnabled
      ? listLeavePermissions(divisionSlug, { month: today.slice(0, 7) }).catch(() => [] as Awaited<ReturnType<typeof listLeavePermissions>>)
      : Promise.resolve([] as Awaited<ReturnType<typeof listLeavePermissions>>),
    interviewManagementEnabled
      ? listRecentInterviewGroups(divisionSlug, thirtyDaysAgo).catch(
          () => [] as RecentInterviewGroup[],
        )
      : Promise.resolve([] as RecentInterviewGroup[]),
    examScheduleManagementEnabled
      ? listExamSchedules(divisionSlug, { onlyActive: true }).catch(() => [] as Awaited<ReturnType<typeof listExamSchedules>>)
      : Promise.resolve([] as Awaited<ReturnType<typeof listExamSchedules>>),
    attendanceManagementEnabled
      ? detectRepeatedTardy(divisionSlug).catch(() => [] as Awaited<ReturnType<typeof detectRepeatedTardy>>)
      : Promise.resolve([] as Awaited<ReturnType<typeof detectRepeatedTardy>>),
    attendanceManagementEnabled
      ? detectRepeatedAbsent(divisionSlug).catch(() => [] as Awaited<ReturnType<typeof detectRepeatedAbsent>>)
      : Promise.resolve([] as Awaited<ReturnType<typeof detectRepeatedAbsent>>),
  ]);
  const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.date, snapshot]));
  const todaySnapshot = attendanceManagementEnabled ? getSnapshotOrThrow(snapshotMap, today) : null;
  const yesterdaySnapshot = attendanceManagementEnabled ? getSnapshotOrThrow(snapshotMap, yesterday) : null;

  const activeStudents = students.filter(
    (student) => student.status === "ACTIVE" || student.status === "ON_LEAVE",
  );
  const weeklySnapshots = attendanceManagementEnabled
    ? weekDates.map((date) => getSnapshotOrThrow(snapshotMap, date))
    : [];

  const todayRecordsByPeriod = todaySnapshot
    ? indexRecordsByPeriod(todaySnapshot.records)
    : new Map<string, AttendanceSnapshot["records"]>();
  const yesterdayRecordsByPeriod = yesterdaySnapshot
    ? indexRecordsByPeriod(yesterdaySnapshot.records)
    : new Map<string, AttendanceSnapshot["records"]>();
  const emptyRateSummary = { attendedCount: 0, expectedCount: 0, attendanceRate: 0 };
  const todaySummary = todaySnapshot
    ? buildRateSummary(todaySnapshot, activeStudents.length, todayRecordsByPeriod)
    : emptyRateSummary;
  const yesterdaySummary = yesterdaySnapshot
    ? buildRateSummary(yesterdaySnapshot, activeStudents.length, yesterdayRecordsByPeriod)
    : emptyRateSummary;
  const periodRows = todaySnapshot
    ? buildPeriodRows(todaySnapshot, activeStudents.length, todayRecordsByPeriod)
    : [];
  const weeklyIssues = attendanceManagementEnabled
    ? countWeeklyIssues(weeklySnapshots)
    : {
        weeklyTardyCount: 0,
        weeklyAbsentCount: 0,
        weeklyTardyAbsentCount: 0,
      };
  const attentionStudentMap = new Map(
    [...repeatedAbsent, ...repeatedTardy].map((student) => [student.studentId, student]),
  );
  const riskStudents = warningManagementEnabled
    ? students
        .filter((student) => student.netPoints >= settings.warnLevel1)
        .sort((left, right) => right.netPoints - left.netPoints)
        .map((student) => ({
          id: student.id,
          name: student.name,
          studentNumber: student.studentNumber,
          phone: student.phone,
          seatLabel: student.seatLabel,
          netPoints: student.netPoints,
          warningStage: student.warningStage,
        }))
    : [];

  // ── 학생 현황 ──────────────────────────────────────────────────────────────
  const studentOverview = studentManagementEnabled
    ? {
        activeCount: students.filter((s) => s.status === "ACTIVE").length,
        onLeaveCount: students.filter((s) => s.status === "ON_LEAVE").length,
      }
    : {
        activeCount: 0,
        onLeaveCount: 0,
      };

  // ── 수납 현황 ──────────────────────────────────────────────────────────────
  const thisMonthTotal = thisMonthPayments.reduce((sum, p) => sum + p.amount, 0);
  const paymentStats = paymentManagementEnabled
    ? {
        thisMonthTotal,
        thisMonthCount: thisMonthPayments.length,
        recentPayments: [...thisMonthPayments]
          .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
          .slice(0, 5)
          .map((p) => ({
            studentName: p.studentName,
            studentNumber: p.studentNumber,
            amount: p.amount,
            paymentDate: p.paymentDate,
            paymentTypeName: p.paymentTypeName,
            method: p.method,
          })),
      }
    : {
        thisMonthTotal: 0,
        thisMonthCount: 0,
        recentPayments: [],
      };

  // ── 수강 만료 임박 ─────────────────────────────────────────────────────────
  const todayMs = new Date(today + "T00:00:00Z").getTime();
  const expiringStudents = studentManagementEnabled
    ? activeStudents
        .filter((s) => s.courseEndDate !== null)
        .map((s) => {
          const endMs = new Date(s.courseEndDate! + "T00:00:00Z").getTime();
          const daysRemaining = Math.round((endMs - todayMs) / 86400000);
          return { ...s, daysRemaining };
        })
        .filter((s) => s.daysRemaining >= -3 && s.daysRemaining <= settings.expirationWarningDays)
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .map((s) => ({
          id: s.id,
          name: s.name,
          studentNumber: s.studentNumber,
          studyTrack: s.studyTrack,
          phone: s.phone,
          seatLabel: s.seatLabel,
          courseEndDate: s.courseEndDate!,
          daysRemaining: s.daysRemaining,
        }))
    : [];

  // ── 신규 입실 ──────────────────────────────────────────────────────────────
  const tenDaysAgoMs = todayMs - 10 * 86400000;
  const newStudents = studentManagementEnabled
    ? students
        .filter((s) => s.status === "ACTIVE" || s.status === "ON_LEAVE")
        .map((s) => {
          const enrolledMs = new Date(s.enrolledAt).getTime();
          const daysAgo = Math.round((todayMs - enrolledMs) / 86400000);
          return { ...s, daysAgo };
        })
        .filter((s) => s.daysAgo >= 0 && new Date(s.enrolledAt).getTime() >= tenDaysAgoMs)
        .sort((a, b) => a.daysAgo - b.daysAgo)
        .map((s) => ({
          id: s.id,
          name: s.name,
          studentNumber: s.studentNumber,
          studyTrack: s.studyTrack,
          phone: s.phone,
          seatLabel: s.seatLabel,
          enrolledAt: s.enrolledAt,
          daysAgo: s.daysAgo,
        }))
    : [];

  // ── 오늘 외출/휴가 학생 ────────────────────────────────────────────────────
  const studentSeatMap = new Map(students.map((s) => [s.id, s.seatLabel]));
  const todayLeaveStudents = leaveManagementEnabled
    ? todayLeaves
        .filter((l) => l.date === today && l.status !== "REJECTED")
        .map((l) => ({
          id: l.id,
          studentId: l.studentId,
          studentName: l.studentName,
          studentNumber: l.studentNumber,
          seatLabel: studentSeatMap.get(l.studentId) ?? null,
          type: l.type,
          status: l.status,
        }))
    : [];

  // ── 면담 필요 학생 (면담 기준 벌점 이상 + 30일 내 면담 없음) ─────────────
  const latestInterviewByStudent = new Map<string, string>(
    (interviewGroups ?? [])
      .filter((g) => g._max.date != null)
      .map((g) => [g.studentId, g._max.date!.toISOString().slice(0, 10)]),
  );
  const interviewNeededStudents = interviewManagementEnabled
    ? students
        .filter((s) => s.status === "ACTIVE" && s.netPoints >= settings.warnInterview)
        .filter((s) => {
          const lastDate = latestInterviewByStudent.get(s.id) ?? null;
          if (!lastDate) return true;
          return lastDate < thirtyDaysAgo;
        })
        .map((s) => ({
          id: s.id,
          name: s.name,
          studentNumber: s.studentNumber,
          seatLabel: s.seatLabel,
          phone: s.phone,
          netPoints: s.netPoints,
          warningStage: s.warningStage,
          lastInterviewDate: latestInterviewByStudent.get(s.id) ?? null,
        }))
        .sort((a, b) => b.netPoints - a.netPoints)
    : [];

  return {
    division: {
      slug: divisionSlug,
      name: division.name,
      fullName: division.fullName,
      color: division.color,
    },
    featureFlags: settings.featureFlags,
    summary: {
      todayDate: today,
      attendanceRate: todaySummary.attendanceRate,
      attendedCount: todaySummary.attendedCount,
      expectedCount: todaySummary.expectedCount,
      deltaFromYesterday: Number(
        (todaySummary.attendanceRate - yesterdaySummary.attendanceRate).toFixed(1),
      ),
      riskStudentCount: riskStudents.length,
      uncheckedPeriodCount: periodRows.filter((row) => row.isUnchecked).length,
      weeklyTardyAbsentCount: weeklyIssues.weeklyTardyAbsentCount,
      weeklyTardyCount: weeklyIssues.weeklyTardyCount,
      weeklyAbsentCount: weeklyIssues.weeklyAbsentCount,
    },
    periodRows,
    periodSchedules: todaySnapshot
      ? todaySnapshot.periods
          .filter((p) => p.isActive && p.startTime && p.endTime)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((p) => ({
            periodId: p.id,
            periodName: p.name,
            startTime: p.startTime,
            endTime: p.endTime,
          }))
      : [],
    riskStudents,
    attentionStudents: attendanceManagementEnabled
      ? Array.from(attentionStudentMap.values()).sort(
          (left, right) =>
            right.count - left.count ||
            left.studentNumber.localeCompare(right.studentNumber, "ko"),
        )
      : [],
    recentPoints,
    studentOverview,
    paymentStats,
    expiringStudents,
    newStudents,
    upcomingExamSchedules: examScheduleManagementEnabled ? examSchedules ?? [] : [],
    todayLeaveStudents,
    interviewNeededStudents,
    expirationWarningDays: settings.expirationWarningDays,
  };
}

const getAdminDashboardDataCached = unstable_cache(
  async (divisionSlug: string) => getAdminDashboardDataUncached(divisionSlug),
  ["admin-dashboard-data"],
  { revalidate: 60, tags: ["admin-dashboard"] },
);

export async function getAdminDashboardData(
  divisionSlug: string,
  options?: { forceFresh?: boolean },
): Promise<AdminDashboardData> {
  if (options?.forceFresh || isMockMode()) {
    return getAdminDashboardDataUncached(divisionSlug);
  }

  return getAdminDashboardDataCached(divisionSlug);
}
