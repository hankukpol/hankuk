export type PointDateRange = {
  dateFrom: string;
  dateTo: string;
};

import { getKstTodayYmd } from "@/lib/date-utils";

export { getKstTodayYmd };

export function getKstCurrentMonthRange(today = getKstTodayYmd()): PointDateRange {
  return {
    dateFrom: `${today.slice(0, 8)}01`,
    dateTo: today,
  };
}

export function getMonthRangeForDate(date: string, today = getKstTodayYmd()): PointDateRange {
  const monthKey = date.slice(0, 7);
  const dateFrom = `${monthKey}-01`;

  if (monthKey === today.slice(0, 7)) {
    return {
      dateFrom,
      dateTo: today,
    };
  }

  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    dateFrom,
    dateTo: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function appendPointDateRangeParams(
  params: URLSearchParams,
  range: Partial<PointDateRange>,
) {
  if (range.dateFrom) {
    params.set("dateFrom", range.dateFrom);
  }

  if (range.dateTo) {
    params.set("dateTo", range.dateTo);
  }

  return params;
}
