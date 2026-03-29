import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AttendType, DropoutReason, ExamType, StudentStatus } from "@prisma/client";
import { ATTENDANCE_STATUS_RULES } from "../src/lib/constants";
import { getAttendanceCalendar, getDropoutMonitor, getWeeklyResults } from "../src/lib/analytics/service";
import { getMockRankingSessions } from "../src/lib/exam-session-rules";
import { countsAsAttendance } from "../src/lib/scores/calculation";
import { getTuesdayWeekKey, getTuesdayWeekStart } from "../src/lib/analytics/week";
import { getPrisma } from "../src/lib/prisma";

type MonitorRow = Awaited<ReturnType<typeof getDropoutMonitor>>["rows"][number];

type SyntheticEntry = {
  examDate: Date;
  weekKey: string;
  monthKey: string;
  attendType: AttendType | null;
  isOccurred: boolean;
  isCounted: boolean;
  grantsPerfectAttendance: boolean;
};

type SyntheticWeek = {
  weekKey: string;
  startDate: Date;
  endDate: Date;
  monthKey: string;
};

type SyntheticSnapshot = {
  weekKey: string;
  weekAbsenceCount: number;
  monthAbsenceCount: number;
  status: StudentStatus;
  recoveryDate: Date | null;
  dropoutReason: DropoutReason | null;
};

function loadEnvFile(filePath: string) {
  try {
    const raw = readFileSync(filePath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env files.
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function percentage(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

function nextMonthFirstDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function expectedStatus(row: MonitorRow) {
  if (row.recoveryDate && new Date(row.recoveryDate).getTime() > Date.now()) {
    return StudentStatus.DROPOUT;
  }

  if (
    row.currentWeekAbsenceCount >= ATTENDANCE_STATUS_RULES.weeklyDropoutAbsences ||
    row.currentMonthAbsenceCount >= ATTENDANCE_STATUS_RULES.monthlyDropoutAbsences
  ) {
    return StudentStatus.DROPOUT;
  }

  if (row.currentWeekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning2Absences) {
    return StudentStatus.WARNING_2;
  }

  if (row.currentWeekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning1Absences) {
    return StudentStatus.WARNING_1;
  }

  return StudentStatus.NORMAL;
}

function evaluateSyntheticStatus(input: {
  entries: SyntheticEntry[];
  weeks: SyntheticWeek[];
  currentWeekKey: string | null;
  currentMonthKey: string | null;
  today: Date;
}) {
  const countedEntries = input.entries
    .filter((entry) => entry.isOccurred && entry.isCounted)
    .sort((left, right) => left.examDate.getTime() - right.examDate.getTime());

  const weekAbsences = new Map<string, number>();
  const monthAbsences = new Map<string, number>();
  const monthPerfectAttendance = new Map<string, boolean>();

  for (const entry of countedEntries) {
    const wasAbsent = entry.attendType === AttendType.ABSENT;
    const breaksPerfectAttendance =
      entry.attendType === AttendType.EXCUSED && !entry.grantsPerfectAttendance;

    if (!monthPerfectAttendance.has(entry.monthKey)) {
      monthPerfectAttendance.set(entry.monthKey, true);
    }

    if (wasAbsent) {
      weekAbsences.set(entry.weekKey, (weekAbsences.get(entry.weekKey) ?? 0) + 1);
      monthAbsences.set(entry.monthKey, (monthAbsences.get(entry.monthKey) ?? 0) + 1);
    }

    if (wasAbsent || breaksPerfectAttendance) {
      monthPerfectAttendance.set(entry.monthKey, false);
    }
  }

  let activeDropoutUntil: Date | null = null;
  let activeDropoutReason: DropoutReason | null = null;
  const weeklySnapshots: SyntheticSnapshot[] = [];

  for (const week of [...input.weeks].sort((left, right) => left.weekKey.localeCompare(right.weekKey))) {
    const entriesThroughWeek = countedEntries.filter((entry) => entry.examDate.getTime() <= week.endDate.getTime());
    const entriesForWeek = entriesThroughWeek.filter((entry) => entry.weekKey === week.weekKey);
    const latestWeekEntry = entriesForWeek.at(-1) ?? null;
    const snapshotMonthKey = latestWeekEntry?.monthKey ?? week.monthKey;
    const weekAbsenceCount = entriesForWeek.filter((entry) => entry.attendType === AttendType.ABSENT).length;
    const monthAbsenceCount = entriesThroughWeek.filter(
      (entry) => entry.attendType === AttendType.ABSENT && entry.monthKey === snapshotMonthKey,
    ).length;

    if (activeDropoutUntil && week.startDate.getTime() >= activeDropoutUntil.getTime()) {
      activeDropoutUntil = null;
      activeDropoutReason = null;
    }

    let status: StudentStatus = StudentStatus.NORMAL;
    let recoveryDate: Date | null = null;
    let dropoutReason: DropoutReason | null = null;

    if (activeDropoutUntil) {
      status = StudentStatus.DROPOUT;
      recoveryDate = activeDropoutUntil;
      dropoutReason = activeDropoutReason;
    } else if (
      weekAbsenceCount >= ATTENDANCE_STATUS_RULES.weeklyDropoutAbsences ||
      monthAbsenceCount >= ATTENDANCE_STATUS_RULES.monthlyDropoutAbsences
    ) {
      status = StudentStatus.DROPOUT;
      recoveryDate = nextMonthFirstDay(latestWeekEntry?.examDate ?? week.endDate);
      dropoutReason =
        weekAbsenceCount >= ATTENDANCE_STATUS_RULES.weeklyDropoutAbsences
          ? DropoutReason.WEEKLY_3
          : DropoutReason.MONTHLY_8;
      activeDropoutUntil = recoveryDate;
      activeDropoutReason = dropoutReason;
    } else if (weekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning2Absences) {
      status = StudentStatus.WARNING_2;
    } else if (weekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning1Absences) {
      status = StudentStatus.WARNING_1;
    }

    weeklySnapshots.push({
      weekKey: week.weekKey,
      weekAbsenceCount,
      monthAbsenceCount,
      status,
      recoveryDate,
      dropoutReason,
    });
  }

  if (activeDropoutUntil && input.today.getTime() >= activeDropoutUntil.getTime()) {
    activeDropoutUntil = null;
    activeDropoutReason = null;
  }

  const currentWeekAbsenceCount = input.currentWeekKey ? (weekAbsences.get(input.currentWeekKey) ?? 0) : 0;
  const currentMonthAbsenceCount = input.currentMonthKey ? (monthAbsences.get(input.currentMonthKey) ?? 0) : 0;

  let overallStatus: StudentStatus = StudentStatus.NORMAL;
  let recoveryDate: Date | null = null;

  if (activeDropoutUntil) {
    overallStatus = StudentStatus.DROPOUT;
    recoveryDate = activeDropoutUntil;
  } else if (
    currentWeekAbsenceCount >= ATTENDANCE_STATUS_RULES.weeklyDropoutAbsences ||
    currentMonthAbsenceCount >= ATTENDANCE_STATUS_RULES.monthlyDropoutAbsences
  ) {
    overallStatus = StudentStatus.DROPOUT;
    recoveryDate = countedEntries.length > 0 ? nextMonthFirstDay(countedEntries[countedEntries.length - 1].examDate) : null;
  } else if (currentWeekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning2Absences) {
    overallStatus = StudentStatus.WARNING_2;
  } else if (currentWeekAbsenceCount === ATTENDANCE_STATUS_RULES.weeklyWarning1Absences) {
    overallStatus = StudentStatus.WARNING_1;
  }

  return {
    weekAbsences,
    monthAbsences,
    monthPerfectAttendance,
    currentWeekAbsenceCount,
    currentMonthAbsenceCount,
    overallStatus,
    recoveryDate,
    weeklySnapshots,
  };
}

function createWeek(date: Date): SyntheticWeek {
  const startDate = getTuesdayWeekStart(date);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return {
    weekKey: getTuesdayWeekKey(date),
    startDate,
    endDate,
    monthKey: monthKey(date),
  };
}

function verifySyntheticRegressionCases() {
  const currentWeek = createWeek(new Date("2026-03-10T09:00:00+09:00"));
  const futureIgnored = evaluateSyntheticStatus({
    entries: [
      {
        examDate: new Date("2026-03-10T09:00:00+09:00"),
        weekKey: currentWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.NORMAL,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
      {
        examDate: new Date("2026-03-11T09:00:00+09:00"),
        weekKey: currentWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.NORMAL,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
      {
        examDate: new Date("2026-03-13T09:00:00+09:00"),
        weekKey: currentWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: false,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
      {
        examDate: new Date("2026-03-16T09:00:00+09:00"),
        weekKey: currentWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: false,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
    ],
    weeks: [currentWeek],
    currentWeekKey: currentWeek.weekKey,
    currentMonthKey: "2026-03",
    today: new Date("2026-03-12T12:00:00+09:00"),
  });

  assert.equal(futureIgnored.currentWeekAbsenceCount, 0, "Future sessions should not count as absences.");
  assert.equal(futureIgnored.currentMonthAbsenceCount, 0, "Future sessions should not affect monthly absences.");
  assert.equal(futureIgnored.overallStatus, StudentStatus.NORMAL, "Future sessions should keep the student normal.");

  const pendingInputIgnored = evaluateSyntheticStatus({
    entries: [
      {
        examDate: new Date("2026-03-10T09:00:00+09:00"),
        weekKey: currentWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.NORMAL,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
      {
        examDate: new Date("2026-03-11T09:00:00+09:00"),
        weekKey: currentWeek.weekKey,
        monthKey: "2026-03",
        attendType: null,
        isOccurred: true,
        isCounted: false,
        grantsPerfectAttendance: false,
      },
    ],
    weeks: [currentWeek],
    currentWeekKey: currentWeek.weekKey,
    currentMonthKey: "2026-03",
    today: new Date("2026-03-12T12:00:00+09:00"),
  });
  assert.equal(
    pendingInputIgnored.currentWeekAbsenceCount,
    0,
    "Score-input pending sessions should not count as weekly absences.",
  );
  assert.equal(
    pendingInputIgnored.currentMonthAbsenceCount,
    0,
    "Score-input pending sessions should not affect monthly absences.",
  );
  assert.equal(
    pendingInputIgnored.overallStatus,
    StudentStatus.NORMAL,
    "Score-input pending sessions should keep the student normal.",
  );

  const warningWeek = createWeek(new Date("2026-03-17T09:00:00+09:00"));
  const warning1 = evaluateSyntheticStatus({
    entries: [
      {
        examDate: new Date("2026-03-17T09:00:00+09:00"),
        weekKey: warningWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
    ],
    weeks: [warningWeek],
    currentWeekKey: warningWeek.weekKey,
    currentMonthKey: "2026-03",
    today: new Date("2026-03-17T23:00:00+09:00"),
  });
  assert.equal(warning1.overallStatus, StudentStatus.WARNING_1, "1 absence should be warning 1.");

  const warning2 = evaluateSyntheticStatus({
    entries: [
      {
        examDate: new Date("2026-03-17T09:00:00+09:00"),
        weekKey: warningWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
      {
        examDate: new Date("2026-03-18T09:00:00+09:00"),
        weekKey: warningWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
    ],
    weeks: [warningWeek],
    currentWeekKey: warningWeek.weekKey,
    currentMonthKey: "2026-03",
    today: new Date("2026-03-18T23:00:00+09:00"),
  });
  assert.equal(warning2.overallStatus, StudentStatus.WARNING_2, "2 absences should be warning 2.");

  const dropoutWeek = createWeek(new Date("2026-03-24T09:00:00+09:00"));
  const weeklyDropout = evaluateSyntheticStatus({
    entries: [
      {
        examDate: new Date("2026-03-24T09:00:00+09:00"),
        weekKey: dropoutWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
      {
        examDate: new Date("2026-03-25T09:00:00+09:00"),
        weekKey: dropoutWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
      {
        examDate: new Date("2026-03-26T09:00:00+09:00"),
        weekKey: dropoutWeek.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      },
    ],
    weeks: [dropoutWeek],
    currentWeekKey: dropoutWeek.weekKey,
    currentMonthKey: "2026-03",
    today: new Date("2026-03-26T23:00:00+09:00"),
  });
  assert.equal(weeklyDropout.overallStatus, StudentStatus.DROPOUT, "3 absences in a week should be dropout.");

  const monthWeek1 = createWeek(new Date("2026-03-03T09:00:00+09:00"));
  const monthWeek2 = createWeek(new Date("2026-03-10T09:00:00+09:00"));
  const monthlyDropout = evaluateSyntheticStatus({
    entries: [
      ...[3, 4, 5, 6].map((day) => ({
        examDate: new Date(`2026-03-${String(day).padStart(2, "0")}T09:00:00+09:00`),
        weekKey: monthWeek1.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      })),
      ...[10, 11, 12, 13].map((day) => ({
        examDate: new Date(`2026-03-${String(day).padStart(2, "0")}T09:00:00+09:00`),
        weekKey: monthWeek2.weekKey,
        monthKey: "2026-03",
        attendType: AttendType.ABSENT,
        isOccurred: true,
        isCounted: true,
        grantsPerfectAttendance: false,
      })),
    ],
    weeks: [monthWeek1, monthWeek2],
    currentWeekKey: monthWeek2.weekKey,
    currentMonthKey: "2026-03",
    today: new Date("2026-03-13T23:00:00+09:00"),
  });
  assert.equal(monthlyDropout.currentMonthAbsenceCount, 8, "Monthly absence count should accumulate across weeks.");
  assert.equal(monthlyDropout.overallStatus, StudentStatus.DROPOUT, "8 monthly absences should be dropout.");

  return {
    futureIgnored: {
      currentWeekAbsenceCount: futureIgnored.currentWeekAbsenceCount,
      currentMonthAbsenceCount: futureIgnored.currentMonthAbsenceCount,
      overallStatus: futureIgnored.overallStatus,
    },
    pendingInputIgnored: {
      currentWeekAbsenceCount: pendingInputIgnored.currentWeekAbsenceCount,
      currentMonthAbsenceCount: pendingInputIgnored.currentMonthAbsenceCount,
      overallStatus: pendingInputIgnored.overallStatus,
    },
    warning1: warning1.overallStatus,
    warning2: warning2.overallStatus,
    weeklyDropout: weeklyDropout.overallStatus,
    monthlyDropout: {
      currentMonthAbsenceCount: monthlyDropout.currentMonthAbsenceCount,
      overallStatus: monthlyDropout.overallStatus,
    },
  };
}

async function verifyMonitorThresholds(periodId: number, examType: ExamType) {
  const monitor = await getDropoutMonitor(periodId, examType);
  const mismatches = monitor.rows
    .map((row) => ({
      examNumber: row.examNumber,
      name: row.name,
      actual: row.status,
      expected: expectedStatus(row),
      currentWeekAbsenceCount: row.currentWeekAbsenceCount,
      currentMonthAbsenceCount: row.currentMonthAbsenceCount,
    }))
    .filter((row) => row.actual !== row.expected);

  assert.equal(
    mismatches.length,
    0,
    `Status threshold mismatch: ${JSON.stringify({ periodId, examType, mismatches }, null, 2)}`,
  );

  return {
    periodId,
    examType,
    total: monitor.rows.length,
    mismatchCount: mismatches.length,
  };
}

async function verifyCurrentWeekConsistency(periodId: number, examType: ExamType) {
  const prisma = getPrisma();
  const currentWeekKey = getTuesdayWeekKey(new Date());
  const sessions = await prisma.examSession.findMany({
    where: {
      periodId,
      examType,
      isCancelled: false,
    },
    select: {
      examDate: true,
    },
  });

  const hasCurrentWeekSession = sessions.some((session) => getTuesdayWeekKey(session.examDate) === currentWeekKey);
  if (!hasCurrentWeekSession) {
    return {
      periodId,
      examType,
      weekKey: currentWeekKey,
      checked: false,
      comparedRowCount: 0,
    };
  }

  const [weekly, monitor] = await Promise.all([
    getWeeklyResults(periodId, examType, currentWeekKey, "overall", {
      includeRankingRows: false,
    }),
    getDropoutMonitor(periodId, examType),
  ]);

  const monitorMap = new Map(monitor.rows.map((row) => [row.examNumber, row]));
  const mismatches = weekly.sheetRows
    .map((row) => {
      const monitorRow = monitorMap.get(row.examNumber) ?? null;
      return {
        examNumber: row.examNumber,
        name: row.name,
        sheetStatus: row.weekStatus,
        monitorStatus: monitorRow?.status ?? null,
        attendanceRate: row.attendanceRate,
      };
    })
    .filter((row) => row.monitorStatus !== null && row.sheetStatus !== row.monitorStatus);

  assert.equal(
    mismatches.length,
    0,
    `Current week sheet mismatch: ${JSON.stringify({ periodId, examType, mismatches }, null, 2)}`,
  );

  return {
    periodId,
    examType,
    weekKey: currentWeekKey,
    checked: true,
    comparedRowCount: weekly.sheetRows.length,
  };
}

async function verifyPendingInputSessions() {
  const prisma = getPrisma();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const pendingSessions = await prisma.examSession.findMany({
    where: {
      isCancelled: false,
      examDate: {
        lt: todayStart,
      },
      scores: {
        none: {},
      },
    },
    select: {
      id: true,
      periodId: true,
      examType: true,
      examDate: true,
    },
    orderBy: [{ periodId: "asc" }, { examType: "asc" }, { examDate: "asc" }, { id: "asc" }],
  });

  const weeklyCache = new Map<string, Awaited<ReturnType<typeof getWeeklyResults>>>();
  const calendarCache = new Map<string, Awaited<ReturnType<typeof getAttendanceCalendar>>>();

  for (const pendingSession of pendingSessions) {
    const weekKey = getTuesdayWeekKey(pendingSession.examDate);
    const weeklyCacheKey = `${pendingSession.periodId}:${pendingSession.examType}:${weekKey}`;
    const calendarCacheKey = `${pendingSession.periodId}:${pendingSession.examType}:${pendingSession.examDate.getFullYear()}-${pendingSession.examDate.getMonth() + 1}`;

    let weekly = weeklyCache.get(weeklyCacheKey);
    if (!weekly) {
      weekly = await getWeeklyResults(
        pendingSession.periodId,
        pendingSession.examType,
        weekKey,
        "overall",
        { includeRankingRows: false },
      );
      weeklyCache.set(weeklyCacheKey, weekly);
    }

    const pendingCells = weekly.sheetRows.map(
      (row) => row.cells.find((cell) => cell.sessionId === pendingSession.id) ?? null,
    );
    assert.equal(
      pendingCells.length > 0,
      true,
      `Pending session missing from weekly sheet: ${JSON.stringify(pendingSession)}`,
    );
    assert.equal(
      pendingCells.every((cell) => cell?.isPendingInput === true),
      true,
      `Pending session cell mismatch: ${JSON.stringify(pendingSession)}`,
    );

    const pendingSessionIds = new Set(
      weekly.sheetRows.flatMap((row) =>
        row.cells.filter((cell) => cell.isPendingInput).map((cell) => cell.sessionId),
      ),
    );
    const countedMockSessionIds = new Set(
      getMockRankingSessions(
        weekly.sessions.filter(
          (session) =>
            session.examDate <= todayEnd &&
            !session.isCancelled &&
            !pendingSessionIds.has(session.id),
        ),
      ).map((session) => session.id),
    );

    for (const row of weekly.sheetRows) {
      const attendanceCount = row.cells.filter(
        (cell) => countedMockSessionIds.has(cell.sessionId) && countsAsAttendance(cell.attendType),
      ).length;
      const expectedAttendanceRate = percentage(attendanceCount, countedMockSessionIds.size);

      assert.equal(
        row.attendanceRate,
        expectedAttendanceRate,
        `Pending session attendance mismatch: ${JSON.stringify({
          examNumber: row.examNumber,
          sessionId: pendingSession.id,
          actual: row.attendanceRate,
          expected: expectedAttendanceRate,
        })}`,
      );
    }

    let calendar = calendarCache.get(calendarCacheKey);
    if (!calendar) {
      calendar = await getAttendanceCalendar(
        pendingSession.periodId,
        pendingSession.examType,
        pendingSession.examDate.getFullYear(),
        pendingSession.examDate.getMonth() + 1,
      );
      calendarCache.set(calendarCacheKey, calendar);
    }

    const calendarEntry = calendar.days.find((day) => day.sessionId === pendingSession.id) ?? null;
    assert.notEqual(
      calendarEntry,
      null,
      `Pending session missing from attendance calendar: ${JSON.stringify(pendingSession)}`,
    );
    assert.equal(calendarEntry?.isPendingInput ?? false, true, `Pending calendar flag mismatch: ${JSON.stringify(pendingSession)}`);
    assert.equal(calendarEntry?.absentCount ?? -1, 0, `Pending calendar absent mismatch: ${JSON.stringify(pendingSession)}`);
    assert.equal(calendarEntry?.warningCount ?? -1, 0, `Pending calendar warning mismatch: ${JSON.stringify(pendingSession)}`);
    assert.equal(calendarEntry?.dropoutCount ?? -1, 0, `Pending calendar dropout mismatch: ${JSON.stringify(pendingSession)}`);
  }

  return {
    checked: pendingSessions.length > 0,
    pendingSessionCount: pendingSessions.length,
    weeklyGroupCount: weeklyCache.size,
    calendarGroupCount: calendarCache.size,
  };
}

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();

  const targets = await prisma.examSession.findMany({
    select: {
      periodId: true,
      examType: true,
      period: {
        select: {
          name: true,
        },
      },
    },
    distinct: ["periodId", "examType"],
    orderBy: [{ periodId: "asc" }, { examType: "asc" }],
  });

  const thresholdChecks = [] as Array<Record<string, unknown>>;
  const currentWeekChecks = [] as Array<Record<string, unknown>>;
  const pendingInputChecks = await verifyPendingInputSessions();

  for (const target of targets) {
    const thresholdCheck = await verifyMonitorThresholds(target.periodId, target.examType);
    thresholdChecks.push({
      ...thresholdCheck,
      periodName: target.period.name,
    });

    const currentWeekCheck = await verifyCurrentWeekConsistency(target.periodId, target.examType);
    currentWeekChecks.push({
      ...currentWeekCheck,
      periodName: target.period.name,
    });
  }

  const syntheticChecks = verifySyntheticRegressionCases();

  console.log(
    JSON.stringify(
      {
        thresholdChecks,
        currentWeekChecks,
        pendingInputChecks,
        syntheticChecks,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPrisma().$disconnect();
  } catch {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});