import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { getPeriods } from "@/lib/services/period.service";
import { listStudents } from "@/lib/services/student.service";

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type PatternType = "TARDY" | "ABSENT";

export type AttendancePatternItem = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  seatLabel: string | null;
  phone: string | null;
  type: PatternType;
  count: number;
  message: string;
};

function getKstToday() {
  return kstDateFormatter.format(new Date());
}

function addDays(date: string, offsetDays: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + offsetDays);
  return next.toISOString().slice(0, 10);
}

async function getPatternCounts(
  divisionSlug: string,
  type: PatternType,
  days: number,
) {
  const mandatoryPeriods = (await getPeriods(divisionSlug))
    .filter((period) => period.isActive && period.isMandatory)
    .map((period) => period.id);

  if (mandatoryPeriods.length === 0) {
    return new Map<string, number>();
  }

  const dateTo = getKstToday();
  const dateFrom = addDays(dateTo, -(Math.max(days, 1) - 1));
  const mandatoryPeriodSet = new Set(mandatoryPeriods);

  if (isMockMode()) {
    const state = await readMockState();
    const counts = new Map<string, number>();

    for (const record of state.attendanceByDivision[divisionSlug] ?? []) {
      if (record.date < dateFrom || record.date > dateTo) {
        continue;
      }

      if (!mandatoryPeriodSet.has(record.periodId)) {
        continue;
      }

      if (record.status !== type) {
        continue;
      }

      counts.set(record.studentId, (counts.get(record.studentId) ?? 0) + 1);
    }

    return counts;
  }

  const { prisma } = await import("@/lib/prisma");
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${addDays(dateTo, 1)}T00:00:00.000Z`);
  const rows = await prisma.attendance.findMany({
    where: {
      periodId: {
        in: mandatoryPeriods,
      },
      status: type,
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
    },
  });

  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.studentId, (counts.get(row.studentId) ?? 0) + 1);
  }

  return counts;
}

async function detectPattern(
  divisionSlug: string,
  options: {
    type: PatternType;
    days: number;
    threshold: number;
    label: string;
  },
) {
  const counts = await getPatternCounts(divisionSlug, options.type, options.days);
  const students = await listStudents(divisionSlug);

  return students
    .filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE")
    .map((student) => ({
      studentId: student.id,
      studentName: student.name,
      studentNumber: student.studentNumber,
      seatLabel: student.seatLabel,
      phone: student.phone,
      type: options.type,
      count: counts.get(student.id) ?? 0,
      message: `최근 ${options.days}일 ${options.label} ${counts.get(student.id) ?? 0}회`,
    }))
    .filter((student) => student.count >= options.threshold)
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.studentNumber.localeCompare(right.studentNumber, "ko"),
    ) satisfies AttendancePatternItem[];
}

export async function detectRepeatedTardy(divisionSlug: string, days = 7) {
  return detectPattern(divisionSlug, {
    type: "TARDY",
    days,
    threshold: 3,
    label: "지각",
  });
}

export async function detectRepeatedAbsent(divisionSlug: string, days = 7) {
  return detectPattern(divisionSlug, {
    type: "ABSENT",
    days,
    threshold: 2,
    label: "결석",
  });
}
