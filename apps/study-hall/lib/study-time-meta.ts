export const STUDY_TIME_TRACKING_START_DATE = "2026-04-06";

export function getKstMonth(now = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return formatted.slice(0, 7);
}

export function splitStudyMinutes(minutes: number) {
  return {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  };
}

export function formatStudyMinutes(minutes: number) {
  const parts = splitStudyMinutes(minutes);

  if (parts.hours === 0) {
    return `${parts.minutes}분`;
  }

  if (parts.minutes === 0) {
    return `${parts.hours}시간`;
  }

  return `${parts.hours}시간 ${parts.minutes}분`;
}

export function maskStudentName(name: string) {
  const firstChar = Array.from(name.trim())[0];

  if (!firstChar) {
    return "**";
  }

  return `${firstChar}**`;
}

export function clampStudyTimeDateRange(dateFrom: string, dateTo: string) {
  const clampedFrom =
    dateFrom < STUDY_TIME_TRACKING_START_DATE
      ? STUDY_TIME_TRACKING_START_DATE
      : dateFrom;

  if (clampedFrom > dateTo) {
    return null;
  }

  return {
    dateFrom: clampedFrom,
    dateTo,
  };
}


export function createStudyMinutesCalculator() {
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
