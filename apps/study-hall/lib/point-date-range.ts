export type PointDateRange = {
  dateFrom: string;
  dateTo: string;
};

export function getKstTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function getKstCurrentMonthRange(today = getKstTodayYmd()): PointDateRange {
  return {
    dateFrom: `${today.slice(0, 8)}01`,
    dateTo: today,
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
