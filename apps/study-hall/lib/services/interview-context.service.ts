import { getKstTodayYmd } from "@/lib/date-utils";
import { getPointAggregationInfo } from "@/lib/point-aggregation-mode";
import { kstMonthBounds } from "@/lib/management-policy";
import { listStudentAttendanceHistory } from "@/lib/services/attendance.service";
import { listLeavePermissions } from "@/lib/services/leave.service";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getPeriods } from "@/lib/services/period.service";
import { listPointRecords } from "@/lib/services/point.service";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";
import { getWarningStageLabel, toDemeritPoints } from "@/lib/student-meta";
import type { OperatingDays } from "@/lib/settings-schemas";

/** 면담 준비에 쓰는 조회 구간. 30일이면 최근 흐름을 보되 과거에 묻히지 않는다. */
export const INTERVIEW_CONTEXT_WINDOW_DAYS = 30;

export type InterviewContextSummary = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  window: {
    dateFrom: string;
    dateTo: string;
    days: number;
  };
  attendance: {
    tardyCount: number;
    absentCount: number;
    /** 필수 교시인데 아직 아무 상태도 입력되지 않은 칸 수. */
    unprocessedCount: number;
  };
  topDemerits: Array<{
    id: string;
    date: string;
    displayName: string;
    points: number;
  }>;
  leave: {
    month: string;
    holidayRemaining: number;
    halfDayRemaining: number;
    healthRemaining: number;
  };
  points: {
    aggregationLabel: string;
    demeritPoints: number;
    warningStageLabel: string;
  };
};

function shiftYmd(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function getWeekdayKey(date: string): keyof OperatingDays {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[weekday];
}

function eachDate(dateFrom: string, dateTo: string) {
  const dates: string[] = [];

  for (let cursor = dateFrom; cursor <= dateTo; cursor = shiftYmd(cursor, 1)) {
    dates.push(cursor);
  }

  return dates;
}

/**
 * 면담 폼 상단에 띄우는 최근 30일 요약.
 *
 * 면담을 시작하기 전에 관리자가 출석부·상벌점·휴가 화면을 각각 열어보던 일을
 * 한 번의 조회로 대신한다. 학생 한 명 × 30일이라 비용은 크지 않다.
 */
export async function getInterviewContext(
  divisionSlug: string,
  studentId: string,
): Promise<InterviewContextSummary> {
  const student = await getStudentDetail(divisionSlug, studentId);

  if (!student) {
    throw new Error("학생 정보를 찾을 수 없습니다.");
  }

  const today = getKstTodayYmd();
  // 오늘은 아직 진행 중이라 미처리 집계에서 제외한다.
  const dateTo = shiftYmd(today, -1);
  const requestedFrom = shiftYmd(dateTo, -(INTERVIEW_CONTEXT_WINDOW_DAYS - 1));
  // 과정 시작 전 기간을 미처리로 세지 않는다.
  const dateFrom =
    student.courseStartDate && student.courseStartDate > requestedFrom
      ? student.courseStartDate
      : requestedFrom;

  const monthBounds = kstMonthBounds();

  const [attendanceHistory, pointRecords, settings, periods, leavePermissions, policy] =
    await Promise.all([
      listStudentAttendanceHistory(divisionSlug, studentId, { dateFrom, dateTo }),
      listPointRecords(divisionSlug, { studentId, dateFrom, dateTo, limit: 200 }),
      getDivisionSettings(divisionSlug),
      getPeriods(divisionSlug),
      listLeavePermissions(divisionSlug, { studentId, month: monthBounds.dateFrom.slice(0, 7) }),
      getManagementPolicy(divisionSlug),
    ]);

  const tardyCount = attendanceHistory.filter((record) => record.status === "TARDY").length;
  const absentCount = attendanceHistory.filter((record) => record.status === "ABSENT").length;

  const mandatoryPeriods = periods.filter((period) => period.isActive && period.isMandatory);
  const operatingDates =
    dateFrom > dateTo
      ? []
      : eachDate(dateFrom, dateTo).filter((date) => settings.operatingDays[getWeekdayKey(date)]);
  const recordedCells = new Set(
    attendanceHistory.map((record) => `${record.date}:${record.periodId}`),
  );
  const unprocessedCount = operatingDates.reduce((total, date) => {
    return (
      total +
      mandatoryPeriods.filter((period) => !recordedCells.has(`${date}:${period.id}`)).length
    );
  }, 0);

  const topDemerits = pointRecords
    .filter((record) => record.points < 0)
    .sort((left, right) => left.points - right.points)
    .slice(0, 3)
    .map((record) => ({
      id: record.id,
      date: record.date,
      displayName: record.displayName ?? record.ruleName ?? record.categoryLabel,
      points: record.points,
    }));

  const usedByType = leavePermissions.reduce<Record<string, number>>((counts, permission) => {
    if (permission.status === "REJECTED") {
      return counts;
    }

    counts[permission.type] = (counts[permission.type] ?? 0) + 1;
    return counts;
  }, {});

  return {
    studentId: student.id,
    studentName: student.name,
    studentNumber: student.studentNumber,
    window: {
      dateFrom,
      dateTo,
      days: dateFrom > dateTo ? 0 : eachDate(dateFrom, dateTo).length,
    },
    attendance: {
      tardyCount,
      absentCount,
      unprocessedCount,
    },
    topDemerits,
    leave: {
      month: monthBounds.dateFrom.slice(0, 7),
      holidayRemaining: Math.max(settings.holidayLimit - (usedByType.HOLIDAY ?? 0), 0),
      halfDayRemaining: Math.max(settings.halfDayLimit - (usedByType.HALF_DAY ?? 0), 0),
      healthRemaining: Math.max(settings.healthLimit - (usedByType.HEALTH ?? 0), 0),
    },
    points: {
      aggregationLabel: getPointAggregationInfo(policy, today).label,
      demeritPoints: student.demeritPoints ?? toDemeritPoints(student.netPoints),
      warningStageLabel: student.warningStageLabel ?? getWarningStageLabel(student.warningStage),
    },
  };
}
