import { ExamType } from "@prisma/client";
import { formatTuesdayWeekLabel, getTuesdayWeekKey, getTuesdayWeekStart } from "@/lib/analytics/week";
import { type TuesdayWeekSummary } from "@/lib/analytics/service";
import { resolveEnabledExamType } from "@/lib/periods/exam-types";
import { getPeriodWithSessions, listPeriodsBasic } from "@/lib/periods/service";

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;
type PeriodRecord = NonNullable<Awaited<ReturnType<typeof getPeriodWithSessions>>>;

function reviveDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function pickFirst(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function readStringParam(searchParams: SearchParams | undefined, key: string) {
  return pickFirst(searchParams?.[key]);
}

export function readNumberParam(searchParams: SearchParams | undefined, key: string) {
  const value = readStringParam(searchParams, key);
  return value ? Number(value) : undefined;
}

export function readExamTypeParam(searchParams: SearchParams | undefined, key = "examType") {
  const value = readStringParam(searchParams, key);
  return value === ExamType.GYEONGCHAE ? ExamType.GYEONGCHAE : ExamType.GONGCHAE;
}

export async function getAnalyticsContext(searchParams?: SearchParams) {
  const periods = await listPeriodsBasic();
  const requestedPeriodId = readNumberParam(searchParams, "periodId");
  const activePeriod = periods.find((period) => period.isActive) ?? periods[0] ?? null;
  const selectedPeriodOption =
    periods.find((period) => period.id === requestedPeriodId) ?? activePeriod ?? null;
  const requestedExamType = readExamTypeParam(searchParams);
  const selectedPeriod = selectedPeriodOption
    ? await getPeriodWithSessions(selectedPeriodOption.id)
    : null;
  const examType = resolveEnabledExamType(selectedPeriod, requestedExamType);

  return {
    periods,
    selectedPeriod,
    examType,
  };
}

export function getWeekOptions(period: PeriodRecord | null, examType: ExamType): TuesdayWeekSummary[] {
  if (!period) {
    return [];
  }

  const grouped = new Map<
    string,
    {
      key: string;
      startDate: Date;
      endDate: Date;
      legacyWeeks: number[];
    }
  >();

  for (const session of period.sessions) {
    if (session.examType !== examType) {
      continue;
    }

    const examDate = reviveDate(session.examDate);
    const key = getTuesdayWeekKey(examDate);
    const existing = grouped.get(key);

    if (existing) {
      if (!existing.legacyWeeks.includes(session.week)) {
        existing.legacyWeeks.push(session.week);
        existing.legacyWeeks.sort((left, right) => left - right);
      }
      continue;
    }

    const startDate = getTuesdayWeekStart(examDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    grouped.set(key, {
      key,
      startDate,
      endDate,
      legacyWeeks: [session.week],
    });
  }

  return Array.from(grouped.values())
    .map((option) => ({
      ...option,
      label: formatTuesdayWeekLabel(option.key),
    }))
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
}

export function getMonthOptions(period: PeriodRecord | null, examType: ExamType) {
  if (!period) {
    return [];
  }

  const monthKeys = new Map<string, { year: number; month: number }>();

  for (const session of period.sessions) {
    if (session.examType !== examType) {
      continue;
    }

    const examDate = reviveDate(session.examDate);
    const year = examDate.getFullYear();
    const month = examDate.getMonth() + 1;
    monthKeys.set(`${year}-${month}`, { year, month });
  }

  return Array.from(monthKeys.values()).sort(
    (left, right) => left.year - right.year || left.month - right.month,
  );
}

export function getDefaultMonthOption(
  monthOptions: Array<{ year: number; month: number }>,
  today = new Date(),
) {
  if (monthOptions.length === 0) {
    return undefined;
  }

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  return (
    monthOptions.find((option) => option.year === currentYear && option.month === currentMonth) ??
    monthOptions[monthOptions.length - 1]
  );
}

export function buildHref(
  pathname: string,
  params: Record<string, string | number | boolean | null | undefined>,
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}