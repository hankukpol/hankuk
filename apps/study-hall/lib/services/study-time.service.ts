import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { getPrismaClient, getDivisionBySlugOrThrow } from "@/lib/service-helpers";
import { getPeriods } from "@/lib/services/period.service";

export type StudentStudyTimeStats = {
  month: string; // "YYYY-MM"
  totalMinutes: number;
  totalHours: number;
  totalMinutesRemainder: number;
  byDate: { date: string; minutes: number }[];
  byPeriod: { periodId: string; periodName: string; avgMinutes: number }[];
};

/**
 * Calculate study minutes from checkInTime to period end on the given date.
 * endTime is "HH:MM" in KST (UTC+9).
 */
function calcStudyMinutes(
  checkInTimeIso: string | null,
  date: string,
  periodEndTime: string,
): number {
  if (!checkInTimeIso) return 0;
  const checkIn = new Date(checkInTimeIso);
  const [hh, mm] = periodEndTime.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  // KST end → UTC
  const end = new Date(Date.UTC(y, mo - 1, d, hh - 9, mm, 0, 0));
  return Math.max(0, Math.floor((end.getTime() - checkIn.getTime()) / 60_000));
}

export async function getStudentStudyTimeStats(
  divisionSlug: string,
  studentId: string,
  month: string, // "YYYY-MM"
): Promise<StudentStudyTimeStats> {
  const periods = await getPeriods(divisionSlug);
  const periodMap = new Map(periods.map((p) => [p.id, p]));

  const dateFrom = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dateTo = `${month}-${String(lastDay).padStart(2, "0")}`;

  type RawRecord = {
    date: string;
    periodId: string;
    checkInTime: string | null;
    status: string;
  };

  let rawRecords: RawRecord[] = [];

  if (isMockMode()) {
    const state = await readMockState();
    const records = state.attendanceByDivision[divisionSlug] ?? [];
    rawRecords = records
      .filter(
        (r) =>
          r.studentId === studentId &&
          r.date >= dateFrom &&
          r.date <= dateTo &&
          (r.status === "PRESENT" || r.status === "TARDY") &&
          r.checkInTime != null,
      )
      .map((r) => ({
        date: r.date,
        periodId: r.periodId,
        checkInTime: r.checkInTime ?? null,
        status: r.status,
      }));
  } else {
    const division = await getDivisionBySlugOrThrow(divisionSlug);
    const prisma = await getPrismaClient();
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1)); // exclusive

    const records = await prisma.attendance.findMany({
      where: {
        studentId,
        student: { divisionId: division.id },
        date: { gte: from, lt: to },
        status: { in: ["PRESENT", "TARDY"] },
        checkInTime: { not: null },
      },
      select: {
        date: true,
        periodId: true,
        checkInTime: true,
        status: true,
      },
    });

    rawRecords = records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      periodId: r.periodId,
      checkInTime: r.checkInTime ? r.checkInTime.toISOString() : null,
      status: r.status,
    }));
  }

  // Aggregate by date
  const byDateMap = new Map<string, number>();
  // Aggregate by period: sum minutes and count
  const byPeriodMinutes = new Map<string, number>();
  const byPeriodCount = new Map<string, number>();

  let totalMinutes = 0;

  for (const r of rawRecords) {
    const period = periodMap.get(r.periodId);
    if (!period) continue;
    const minutes = calcStudyMinutes(r.checkInTime, r.date, period.endTime);
    totalMinutes += minutes;

    byDateMap.set(r.date, (byDateMap.get(r.date) ?? 0) + minutes);
    byPeriodMinutes.set(r.periodId, (byPeriodMinutes.get(r.periodId) ?? 0) + minutes);
    byPeriodCount.set(r.periodId, (byPeriodCount.get(r.periodId) ?? 0) + 1);
  }

  const byDate = Array.from(byDateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, minutes]) => ({ date, minutes }));

  const byPeriod = periods
    .filter((p) => p.isActive)
    .map((p) => {
      const sum = byPeriodMinutes.get(p.id) ?? 0;
      const count = byPeriodCount.get(p.id) ?? 0;
      return {
        periodId: p.id,
        periodName: p.name,
        avgMinutes: count > 0 ? Math.round(sum / count) : 0,
      };
    });

  return {
    month,
    totalMinutes,
    totalHours: Math.floor(totalMinutes / 60),
    totalMinutesRemainder: totalMinutes % 60,
    byDate,
    byPeriod,
  };
}

export async function getStudentMonthlyStudyMinutes(
  divisionSlug: string,
  studentId: string,
  month: string,
): Promise<number> {
  const stats = await getStudentStudyTimeStats(divisionSlug, studentId, month);
  return stats.totalMinutes;
}
