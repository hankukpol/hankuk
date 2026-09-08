import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
import {
  clampStudyTimeDateRange,
  maskStudentName,
  splitStudyMinutes,
} from "@/lib/study-time-meta";
import { getPeriods } from "@/lib/services/period.service";
import { listStudents } from "@/lib/services/student.service";

export type StudentStudyTimeStats = {
  month: string; // "YYYY-MM"
  totalMinutes: number;
  totalHours: number;
  totalMinutesRemainder: number;
  byDate: { date: string; minutes: number }[];
  byPeriod: { periodId: string; periodName: string; avgMinutes: number }[];
};

export type DivisionStudyTimeRankingRow = {
  rank: number;
  studentId: string;
  studentName: string;
  studentNumber: string;
  totalMinutes: number;
  totalHours: number;
  totalMinutesRemainder: number;
  studyDays: number;
  dailyAverageMinutes: number;
  dailyAverageHours: number;
  dailyAverageMinutesRemainder: number;
};

export type DivisionStudyTimeRanking = {
  month: string;
  studentCount: number;
  rows: DivisionStudyTimeRankingRow[];
};

export type StudentStudyTimeRankingRow = {
  rank: number;
  maskedName: string;
  totalMinutes: number;
  totalHours: number;
  totalMinutesRemainder: number;
  studyDays: number;
  dailyAverageMinutes: number;
  dailyAverageHours: number;
  dailyAverageMinutesRemainder: number;
  isMe: boolean;
};

export type StudentStudyTimeRanking = {
  month: string;
  studentCount: number;
  rows: StudentStudyTimeRankingRow[];
  myRank: StudentStudyTimeRankingRow | null;
};

type RawStudyTimeRecord = {
  studentId: string;
  date: string;
  periodId: string;
  checkInTime: string | null;
  status: string;
};

/**
 * Calculate study minutes from checkInTime to period end on the given date.
 * endTime is "HH:MM" in KST (UTC+9).
 */
function createStudyMinutesCalculator() {
  // All students in a date/period share the same KST end timestamp.
  const endTimes = new Map<string, number>();
  return function calcStudyMinutes(
    checkInTimeIso: string | null,
    date: string,
    periodEndTime: string,
  ): number {
    if (!checkInTimeIso) return 0;
    const key = `${date}:${periodEndTime}`;
    let end = endTimes.get(key);
    if (end === undefined) {
      const [hh, mm] = periodEndTime.split(":").map(Number);
      const [y, mo, d] = date.split("-").map(Number);
      end = Date.UTC(y, mo - 1, d, hh - 9, mm, 0, 0);
      endTimes.set(key, end);
    }
    return Math.max(0, Math.floor((end - new Date(checkInTimeIso).getTime()) / 60_000));
  };
}

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    year,
    monthNumber,
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, "0")}`,
    from: new Date(Date.UTC(year, monthNumber - 1, 1)),
    to: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

async function listMonthlyStudyTimeRecords(
  divisionSlug: string,
  month: string,
  studentIds?: string[],
): Promise<RawStudyTimeRecord[]> {
  const range = getMonthRange(month);
  const clampedRange = clampStudyTimeDateRange(range.dateFrom, range.dateTo);

  if (!clampedRange) {
    return [];
  }

  const { dateFrom, dateTo } = clampedRange;
  const [fromYear, fromMonth, fromDay] = dateFrom.split("-").map(Number);
  const from = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const to = range.to;

  if (isMockMode()) {
    const state = await readMockState();
    const studentIdSet = studentIds ? new Set(studentIds) : null;

    return (state.attendanceByDivision[divisionSlug] ?? [])
      .filter((record) => {
        if (record.date < dateFrom || record.date > dateTo) {
          return false;
        }

        if (record.status !== "PRESENT" && record.status !== "TARDY") {
          return false;
        }

        if (!record.checkInTime) {
          return false;
        }

        return !studentIdSet || studentIdSet.has(record.studentId);
      })
      .map((record) => ({
        studentId: record.studentId,
        date: record.date,
        periodId: record.periodId,
        checkInTime: record.checkInTime ?? null,
        status: record.status,
      }));
  }

  const prisma = await getPrismaClient();
  const records = await prisma.attendance.findMany({
    where: {
      date: { gte: from, lt: to },
      status: { in: ["PRESENT", "TARDY"] },
      checkInTime: { not: null },
      student: {
        division: {
          slug: divisionSlug,
        },
      },
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    },
    select: {
      studentId: true,
      date: true,
      periodId: true,
      checkInTime: true,
      status: true,
    },
  });

  return records.map((record) => ({
    studentId: record.studentId,
    date: record.date.toISOString().slice(0, 10),
    periodId: record.periodId,
    checkInTime: record.checkInTime ? record.checkInTime.toISOString() : null,
    status: record.status,
  }));
}

export async function getStudentStudyTimeStats(
  divisionSlug: string,
  studentId: string,
  month: string, // "YYYY-MM"
): Promise<StudentStudyTimeStats> {
  const [periods, rawRecords] = await Promise.all([
    getPeriods(divisionSlug),
    listMonthlyStudyTimeRecords(divisionSlug, month, [studentId]),
  ]);
  const periodMap = new Map(periods.map((p) => [p.id, p]));
  const calcStudyMinutes = createStudyMinutesCalculator();

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

export async function getDivisionStudyTimeRanking(
  divisionSlug: string,
  month: string,
): Promise<DivisionStudyTimeRanking> {
  const [periods, students, rawRecords] = await Promise.all([
    getPeriods(divisionSlug),
    listStudents(divisionSlug),
    listMonthlyStudyTimeRecords(divisionSlug, month),
  ]);

  const activeStudents = students.filter(
    (student) => student.status === "ACTIVE" || student.status === "ON_LEAVE",
  );
  const periodMap = new Map(periods.map((period) => [period.id, period]));
  const calcStudyMinutes = createStudyMinutesCalculator();
  const studentSummaryMap = new Map(
    activeStudents.map((student) => [
      student.id,
      {
        student,
        totalMinutes: 0,
        studyDates: new Set<string>(),
      },
    ]),
  );

  for (const record of rawRecords) {
    const summary = studentSummaryMap.get(record.studentId);
    const period = periodMap.get(record.periodId);

    if (!summary || !period) {
      continue;
    }

    const minutes = calcStudyMinutes(record.checkInTime, record.date, period.endTime);
    summary.totalMinutes += minutes;

    if (minutes > 0) {
      summary.studyDates.add(record.date);
    }
  }

  const rankedRowsBase = activeStudents
    .map((student) => {
      const summary = studentSummaryMap.get(student.id);
      const totalMinutes = summary?.totalMinutes ?? 0;
      const studyDays = summary?.studyDates.size ?? 0;
      const dailyAverageMinutes = studyDays > 0 ? Math.round(totalMinutes / studyDays) : 0;
      const totalParts = splitStudyMinutes(totalMinutes);
      const avgParts = splitStudyMinutes(dailyAverageMinutes);

      return {
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.studentNumber,
        totalMinutes,
        totalHours: totalParts.hours,
        totalMinutesRemainder: totalParts.minutes,
        studyDays,
        dailyAverageMinutes,
        dailyAverageHours: avgParts.hours,
        dailyAverageMinutesRemainder: avgParts.minutes,
      };
    })
    .sort((left, right) => {
      if (right.totalMinutes !== left.totalMinutes) {
        return right.totalMinutes - left.totalMinutes;
      }

      if (right.studyDays !== left.studyDays) {
        return right.studyDays - left.studyDays;
      }

      return left.studentNumber.localeCompare(right.studentNumber, "ko");
    });

  const rankByMinutes = new Map<number, number>();
  rankedRowsBase.forEach((row, index) => {
    if (!rankByMinutes.has(row.totalMinutes)) {
      rankByMinutes.set(row.totalMinutes, index + 1);
    }
  });

  const rows: DivisionStudyTimeRankingRow[] = rankedRowsBase.map((row) => ({
    rank: rankByMinutes.get(row.totalMinutes) ?? 0,
    ...row,
  }));

  return {
    month,
    studentCount: rows.length,
    rows,
  };
}

export async function getStudentStudyTimeRanking(
  divisionSlug: string,
  studentId: string,
  month: string,
): Promise<StudentStudyTimeRanking> {
  const ranking = await getDivisionStudyTimeRanking(divisionSlug, month);
  const rows = ranking.rows.map((row) => ({
    rank: row.rank,
    maskedName: maskStudentName(row.studentName),
    totalMinutes: row.totalMinutes,
    totalHours: row.totalHours,
    totalMinutesRemainder: row.totalMinutesRemainder,
    studyDays: row.studyDays,
    dailyAverageMinutes: row.dailyAverageMinutes,
    dailyAverageHours: row.dailyAverageHours,
    dailyAverageMinutesRemainder: row.dailyAverageMinutesRemainder,
    isMe: row.studentId === studentId,
  }));
  const myRank = rows.find((row) => row.isMe) ?? null;

  return {
    month: ranking.month,
    studentCount: ranking.studentCount,
    rows,
    myRank,
  };
}

export async function getStudentMonthlyStudyMinutes(
  divisionSlug: string,
  studentId: string,
  month: string,
): Promise<number> {
  const [periods, records] = await Promise.all([
    getPeriods(divisionSlug),
    listMonthlyStudyTimeRecords(divisionSlug, month, [studentId]),
  ]);
  const periodMap = new Map(periods.map((period) => [period.id, period]));
  const calcStudyMinutes = createStudyMinutesCalculator();
  let totalMinutes = 0;
  for (const record of records) {
    const period = periodMap.get(record.periodId);
    if (period) totalMinutes += calcStudyMinutes(record.checkInTime, record.date, period.endTime);
  }
  return totalMinutes;
}
