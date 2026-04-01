import { unstable_cache } from "next/cache";

import type { DivisionFeatureFlags } from "@/lib/division-features";
import { DEFAULT_DIVISION_FEATURE_FLAGS } from "@/lib/division-features";
import { parseUtcDateFromYmd } from "@/lib/date-utils";
import { isMockMode } from "@/lib/mock-data";
import { getPrismaClient } from "@/lib/service-helpers";
import { getAttendanceSnapshot } from "@/lib/services/attendance.service";
import {
  getDivisionFeatureSettings,
  getDivisionSettings,
} from "@/lib/services/settings.service";
import { listStudents } from "@/lib/services/student.service";
import {
  listManagedAdminAssignments,
  listManagedDivisions,
} from "@/lib/services/super-admin.service";

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type DivisionOverviewSummary = {
  slug: string;
  name: string;
  fullName: string;
  color: string;
  isActive: boolean;
  featureFlags: DivisionFeatureFlags;
  studentCount: number;
  activeStudentCount: number;
  riskStudentCount: number;
  withdrawalRiskCount: number;
  expiringCount: number;
  urgentExpiringCount: number;
  attendanceRate: number;
  attendedCount: number;
  expectedCount: number;
  uncheckedPeriodCount: number;
  adminCount: number;
  assistantCount: number;
};

type OverviewStudentMetric = {
  id: string;
  status: "ACTIVE" | "ON_LEAVE";
  courseEndDate: string | null;
  netPoints: number;
};

type DivisionOverviewMetrics = Omit<
  DivisionOverviewSummary,
  "name" | "fullName" | "color" | "isActive"
>;

type RawDivisionOverviewMetrics = Omit<DivisionOverviewMetrics, "featureFlags">;

function getKstToday() {
  return kstDateFormatter.format(new Date());
}

function toNetPoints(points: number | null | undefined) {
  return Math.abs(Math.min(points ?? 0, 0));
}

function toDateOnlyString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function getDayDiff(baseDate: Date, targetDate: string | null) {
  if (!targetDate) {
    return null;
  }

  return Math.floor((parseUtcDateFromYmd(targetDate).getTime() - baseDate.getTime()) / 86400000);
}

async function getMockDivisionOverviewMetrics(slug: string, today: string) {
  const [students, snapshot] = await Promise.all([
    listStudents(slug),
    getAttendanceSnapshot(slug, today).catch(() => null),
  ]);

  return {
    students: students
      .filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE")
      .map((student) => ({
        id: student.id,
        status: student.status as OverviewStudentMetric["status"],
        courseEndDate: student.courseEndDate,
        netPoints: student.netPoints,
      })) satisfies OverviewStudentMetric[],
    attendance: snapshot
      ? {
          periods: snapshot.periods
            .filter((period) => period.isActive && period.isMandatory)
            .map((period) => ({ id: period.id })),
          records: snapshot.records.map((record) => ({
            periodId: record.periodId,
            status: record.status,
          })),
        }
      : null,
  };
}

async function getDbDivisionOverviewMetrics(divisionId: string, today: string) {
  const prisma = await getPrismaClient();
  const start = parseUtcDateFromYmd(today);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  // students와 periods는 서로 의존관계 없으므로 병렬 조회
  const [students, periods] = await Promise.all([
    prisma.student.findMany({
      where: {
        divisionId,
        status: { in: ["ACTIVE", "ON_LEAVE"] },
      },
      select: { id: true, status: true, courseEndDate: true },
    }),
    prisma.period.findMany({
      where: { divisionId, isActive: true, isMandatory: true },
      select: { id: true },
    }),
  ]);

  const studentIds = students.map((s) => s.id);
  const periodIds = periods.map((p) => p.id);

  // pointTotals와 attendanceRecords 모두 studentIds/periodIds에 의존 → 병렬 조회
  const [pointTotals, attendanceRecords] = await Promise.all([
    studentIds.length > 0
      ? prisma.pointRecord.groupBy({
          by: ["studentId"],
          where: { studentId: { in: studentIds } },
          _sum: { points: true },
        })
      : Promise.resolve([]),
    studentIds.length > 0 && periodIds.length > 0
      ? prisma.attendance.findMany({
          where: {
            date: { gte: start, lt: end },
            studentId: { in: studentIds },
            periodId: { in: periodIds },
          },
          select: { periodId: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const pointTotalByStudentId = new Map(
    pointTotals.map((record) => [record.studentId, toNetPoints(record._sum.points)]),
  );

  return {
    students: students.map((student) => ({
      id: student.id,
      status: student.status as OverviewStudentMetric["status"],
      courseEndDate: toDateOnlyString(student.courseEndDate),
      netPoints: pointTotalByStudentId.get(student.id) ?? 0,
    })) satisfies OverviewStudentMetric[],
    attendance: {
      periods,
      records: attendanceRecords,
    },
  };
}

async function getDivisionSummary(
  division: Awaited<ReturnType<typeof listManagedDivisions>>[number],
  allAdmins: Awaited<ReturnType<typeof listManagedAdminAssignments>>,
  today: string,
): Promise<DivisionOverviewMetrics> {
  const [metrics, settings] = await Promise.all([
    isMockMode()
      ? getMockDivisionOverviewMetrics(division.slug, today)
      : getDbDivisionOverviewMetrics(division.id, today),
    getDivisionSettings(division.slug),
  ]);
  const { students, attendance } = metrics;
  const todayDate = parseUtcDateFromYmd(today);

  // 학생 통계
  const activeStudents = students.filter((student) => student.status === "ACTIVE");
  const onLeaveStudents = students.filter((student) => student.status === "ON_LEAVE");
  const activeStudentCount = activeStudents.length;
  const studentCount = activeStudentCount + onLeaveStudents.length;

  const allActiveStudents = [...activeStudents, ...onLeaveStudents];

  const riskStudentCount = allActiveStudents.filter(
    (student) => student.netPoints >= settings.warnLevel1,
  ).length;

  const withdrawalRiskCount = allActiveStudents.filter(
    (student) => student.netPoints >= settings.warnWithdraw,
  ).length;

  const expiringCount = allActiveStudents.filter((s) => {
    const diff = getDayDiff(todayDate, s.courseEndDate);
    if (diff === null) return false;
    return diff >= -3 && diff <= settings.expirationWarningDays;
  }).length;

  const urgentExpiringCount = allActiveStudents.filter((s) => {
    const diff = getDayDiff(todayDate, s.courseEndDate);
    if (diff === null) return false;
    return diff >= -3 && diff <= 3;
  }).length;

  // 출석 통계
  let attendanceRate = 0;
  let attendedCount = 0;
  let expectedCount = 0;
  let uncheckedPeriodCount = 0;

  if (attendance) {
    const mandatoryPeriods = attendance.periods;

    const recordsByPeriod = new Map<string, typeof attendance.records>();
    for (const record of attendance.records) {
      const list = recordsByPeriod.get(record.periodId);
      if (list) {
        list.push(record);
      } else {
        recordsByPeriod.set(record.periodId, [record]);
      }
    }

    for (const period of mandatoryPeriods) {
      const records = recordsByPeriod.get(period.id) ?? [];
      let periodAttended = 0;
      let periodExpected = 0;
      let notApplicable = 0;
      let applicableCount = 0;

      for (const record of records) {
        if (record.status === "NOT_APPLICABLE") {
          notApplicable += 1;
        } else if (
          record.status === "PRESENT" ||
          record.status === "TARDY" ||
          record.status === "HOLIDAY" ||
          record.status === "HALF_HOLIDAY"
        ) {
          periodAttended += 1;
          applicableCount += 1;
        } else {
          applicableCount += 1;
        }
      }

      periodExpected = Math.max(activeStudentCount - notApplicable, 0);
      attendedCount += periodAttended;
      expectedCount += periodExpected;

      const isUnchecked = periodExpected > 0 && applicableCount === 0;
      if (isUnchecked) uncheckedPeriodCount += 1;
    }

    attendanceRate =
      expectedCount > 0 ? Number(((attendedCount / expectedCount) * 100).toFixed(1)) : 0;
  }

  // 직원 수
  const divisionAdmins = allAdmins.filter(
    (admin) => admin.divisionSlug === division.slug && admin.isActive,
  );
  const adminCount = divisionAdmins.filter((a) => a.role === "ADMIN").length;
  const assistantCount = divisionAdmins.filter((a) => a.role === "ASSISTANT").length;

  return applyOverviewFeatureFlags(
    {
      slug: division.slug,
      studentCount,
      activeStudentCount,
      riskStudentCount,
      withdrawalRiskCount,
      expiringCount,
      urgentExpiringCount,
      attendanceRate,
      attendedCount,
      expectedCount,
      uncheckedPeriodCount,
      adminCount,
      assistantCount,
    },
    settings.featureFlags,
  );
}

function applyOverviewFeatureFlags(
  summary: RawDivisionOverviewMetrics,
  featureFlags: DivisionFeatureFlags,
): DivisionOverviewMetrics {
  return {
    slug: summary.slug,
    featureFlags,
    studentCount: featureFlags.studentManagement ? summary.studentCount : 0,
    activeStudentCount: featureFlags.studentManagement ? summary.activeStudentCount : 0,
    riskStudentCount: featureFlags.warningManagement ? summary.riskStudentCount : 0,
    withdrawalRiskCount: featureFlags.warningManagement ? summary.withdrawalRiskCount : 0,
    expiringCount: featureFlags.studentManagement ? summary.expiringCount : 0,
    urgentExpiringCount: featureFlags.studentManagement ? summary.urgentExpiringCount : 0,
    attendanceRate: featureFlags.attendanceManagement ? summary.attendanceRate : 0,
    attendedCount: featureFlags.attendanceManagement ? summary.attendedCount : 0,
    expectedCount: featureFlags.attendanceManagement ? summary.expectedCount : 0,
    uncheckedPeriodCount: featureFlags.attendanceManagement ? summary.uncheckedPeriodCount : 0,
    adminCount: featureFlags.staffManagement ? summary.adminCount : 0,
    assistantCount: featureFlags.staffManagement ? summary.assistantCount : 0,
  };
}

async function getSuperAdminOverviewUncached(): Promise<DivisionOverviewSummary[]> {
  const today = getKstToday();
  const [divisions, allAdmins] = await Promise.all([
    listManagedDivisions(),
    listManagedAdminAssignments(),
  ]);

  const summaries = await Promise.all(
    divisions.map(async (division) => {
      const summary = await getDivisionSummary(division, allAdmins, today).catch(() => ({
        slug: division.slug,
        featureFlags: { ...DEFAULT_DIVISION_FEATURE_FLAGS },
        studentCount: 0,
        activeStudentCount: 0,
        riskStudentCount: 0,
        withdrawalRiskCount: 0,
        expiringCount: 0,
        urgentExpiringCount: 0,
        attendanceRate: 0,
        attendedCount: 0,
        expectedCount: 0,
        uncheckedPeriodCount: 0,
        adminCount: 0,
        assistantCount: 0,
      }));

      return {
        ...summary,
        name: division.name,
        fullName: division.fullName,
        color: division.color,
        isActive: division.isActive,
      };
    }),
  );

  return summaries;
}

const getSuperAdminOverviewCached = unstable_cache(
  async () => getSuperAdminOverviewUncached(),
  ["super-admin-overview"],
  { revalidate: 30, tags: ["super-admin-overview"] },
);

export async function getSuperAdminOverview(
  options?: { forceFresh?: boolean },
): Promise<DivisionOverviewSummary[]> {
  if (options?.forceFresh || isMockMode()) {
    return getSuperAdminOverviewUncached();
  }

  return getSuperAdminOverviewCached();
}

// ─── 학생 수 추이 ────────────────────────────────────────────────────────────

export type StudentCountTrendPoint = {
  weekLabel: string;
  weekStart: string;
  divisions: Array<{
    slug: string;
    name: string;
    color: string;
    activeCount: number;
  }>;
};

type TrendStudent = {
  enrolledAt: Date;
  withdrawnAt: Date | null;
  status: string;
  updatedAt: Date;
};

function getMondaysDescending(count: number): Date[] {
  const now = new Date();
  // KST 기준 오늘
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
  // 이번 주 월요일
  const dayOfWeek = today.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() + mondayOffset);

  const mondays: Date[] = [];
  for (let i = 0; i < count; i++) {
    const monday = new Date(thisMonday);
    monday.setUTCDate(thisMonday.getUTCDate() - i * 7);
    mondays.push(monday);
  }

  return mondays.reverse();
}

function countActiveAtDate(students: TrendStudent[], weekEnd: Date): number {
  let count = 0;
  for (const s of students) {
    if (s.enrolledAt > weekEnd) continue;
    if (s.status === "WITHDRAWN" || s.status === "GRADUATED") {
      const exitDate = s.withdrawnAt ?? s.updatedAt;
      if (exitDate <= weekEnd) continue;
    }
    count++;
  }
  return count;
}

async function getStudentCountTrendUncached(weekCount: number): Promise<StudentCountTrendPoint[]> {
  const divisions = await listManagedDivisions();
  const mondays = getMondaysDescending(weekCount);
  const activeDivisions = divisions.filter((division) => division.isActive);
  const divisionFeatures = await Promise.all(
    activeDivisions.map(async (division) => ({
      division,
      featureFlags: (await getDivisionFeatureSettings(division.slug)).featureFlags,
    })),
  );

  const divisionStudents = await Promise.all(
    divisionFeatures
      .filter(({ featureFlags }) => featureFlags.studentManagement)
      .map(async (division) => {
        let students: TrendStudent[];

        if (isMockMode()) {
          const list = await listStudents(division.division.slug);
          students = list.map((s) => ({
            enrolledAt: s.enrolledAt ? new Date(s.enrolledAt) : new Date(),
            withdrawnAt: s.withdrawnAt ? new Date(s.withdrawnAt) : null,
            status: s.status,
            updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
          }));
        } else {
          const prisma = await getPrismaClient();
          students = await prisma.student.findMany({
            where: { divisionId: division.division.id },
            select: { enrolledAt: true, withdrawnAt: true, status: true, updatedAt: true },
          });
        }

        return { division: division.division, students };
      }),
  );

  return mondays.map((monday) => {
    // 주의 마지막(일요일 23:59:59)
    const weekEnd = new Date(monday);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    return {
      weekLabel: `${monday.getUTCMonth() + 1}/${monday.getUTCDate()}`,
      weekStart: monday.toISOString().slice(0, 10),
      divisions: divisionStudents.map(({ division, students }) => ({
        slug: division.slug,
        name: division.name,
        color: division.color,
        activeCount: countActiveAtDate(students, weekEnd),
      })),
    };
  });
}

const getStudentCountTrendCached = unstable_cache(
  async (weekCount: number) => getStudentCountTrendUncached(weekCount),
  ["super-admin-student-trend"],
  { revalidate: 300, tags: ["super-admin-student-trend"] },
);

export async function getStudentCountTrend(
  weekCount = 8,
  options?: { forceFresh?: boolean },
): Promise<StudentCountTrendPoint[]> {
  const normalizedWeekCount = Math.min(weekCount, 24);

  if (options?.forceFresh || isMockMode()) {
    return getStudentCountTrendUncached(normalizedWeekCount);
  }

  return getStudentCountTrendCached(normalizedWeekCount);
}

// ─── 수납 현황 ───────────────────────────────────────────────────────────────

export type TuitionDivisionStatus = {
  slug: string;
  name: string;
  color: string;
  expected: number;
  collected: number;
  unpaidCount: number;
  collectionRate: number;
  activeStudentCount: number;
};

export type TuitionStatusSummary = {
  totalExpected: number;
  totalCollected: number;
  collectionRate: number;
  unpaidCount: number;
  divisions: TuitionDivisionStatus[];
};

async function getTuitionStatusUncached(month?: string): Promise<TuitionStatusSummary> {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const targetYear = month ? Number(month.slice(0, 4)) : kstNow.getUTCFullYear();
  const targetMonth = month ? Number(month.slice(5, 7)) - 1 : kstNow.getUTCMonth();

  const monthStart = new Date(Date.UTC(targetYear, targetMonth, 1));
  const monthEnd = new Date(Date.UTC(targetYear, targetMonth + 1, 1));

  const divisions = await listManagedDivisions();
  const activeDivisions = divisions.filter((division) => division.isActive);
  const divisionFeatures = await Promise.all(
    activeDivisions.map(async (division) => ({
      division,
      featureFlags: (await getDivisionFeatureSettings(division.slug)).featureFlags,
    })),
  );

  const divisionStatuses: TuitionDivisionStatus[] = [];

  for (const { division } of divisionFeatures.filter(
    ({ featureFlags }) => featureFlags.paymentManagement,
  )) {
    let expected = 0;
    let collected = 0;
    let unpaidCount = 0;
    let activeStudentCount = 0;

    if (isMockMode()) {
      const students = await listStudents(division.slug);
      const activeStudents = students.filter(
        (s) =>
          (s.status === "ACTIVE" || s.status === "ON_LEAVE") &&
          !s.tuitionExempt &&
          (s.tuitionAmount ?? 0) > 0,
      );
      activeStudentCount = activeStudents.length;
      expected = activeStudents.reduce((sum, s) => sum + (s.tuitionAmount ?? 0), 0);
      // Mock: 랜덤하게 70~90% 수납된 것으로 가정
      collected = Math.round(expected * (0.7 + Math.random() * 0.2));
      unpaidCount = Math.max(0, Math.round(activeStudentCount * 0.15));
    } else {
      const prisma = await getPrismaClient();
      const [students, payments] = await Promise.all([
        prisma.student.findMany({
          where: {
            divisionId: division.id,
            status: { in: ["ACTIVE", "ON_LEAVE"] },
            tuitionExempt: false,
            tuitionAmount: { gt: 0 },
          },
          select: { id: true, tuitionAmount: true },
        }),
        prisma.payment.findMany({
          where: {
            student: { divisionId: division.id },
            paymentDate: { gte: monthStart, lt: monthEnd },
          },
          select: { studentId: true, amount: true },
        }),
      ]);

      activeStudentCount = students.length;
      expected = students.reduce((sum, s) => sum + (s.tuitionAmount ?? 0), 0);
      collected = payments.reduce((sum, p) => sum + p.amount, 0);

      const paidStudentIds = new Set(payments.map((p) => p.studentId));
      unpaidCount = students.filter((s) => !paidStudentIds.has(s.id)).length;
    }

    const collectionRate = expected > 0 ? Number(((collected / expected) * 100).toFixed(1)) : 0;

    divisionStatuses.push({
      slug: division.slug,
      name: division.name,
      color: division.color,
      expected,
      collected,
      unpaidCount,
      collectionRate,
      activeStudentCount,
    });
  }

  const totalExpected = divisionStatuses.reduce((s, d) => s + d.expected, 0);
  const totalCollected = divisionStatuses.reduce((s, d) => s + d.collected, 0);
  const totalUnpaidCount = divisionStatuses.reduce((s, d) => s + d.unpaidCount, 0);

  return {
    totalExpected,
    totalCollected,
    collectionRate: totalExpected > 0 ? Number(((totalCollected / totalExpected) * 100).toFixed(1)) : 0,
    unpaidCount: totalUnpaidCount,
    divisions: divisionStatuses,
  };
}

const getTuitionStatusCached = unstable_cache(
  async (month?: string) => getTuitionStatusUncached(month),
  ["super-admin-tuition-status"],
  { revalidate: 120, tags: ["super-admin-tuition-status"] },
);

export async function getTuitionStatus(
  month?: string,
  options?: { forceFresh?: boolean },
): Promise<TuitionStatusSummary> {
  if (options?.forceFresh || isMockMode()) {
    return getTuitionStatusUncached(month);
  }

  return getTuitionStatusCached(month);
}
