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
