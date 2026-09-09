/**
 * 오늘 날짜(YYYY-MM-DD)를 한국 시간 기준으로 돌려준다.
 *
 * new Date().toISOString().slice(0, 10) 을 쓰면 안 된다.
 * toISOString 은 UTC 로 바꾸므로 한국 시간 00:00~08:59 사이에는 어제 날짜가 나온다.
 * 서버(UTC)든 브라우저든 같은 값을 주어야 하므로 시간대를 명시한다.
 */
export function getKstTodayYmd(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isValidDateParts(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function normalizeYmdDate(value: string, label = "날짜") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} 형식이 올바르지 않습니다.`);
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!isValidDateParts(year, month, day)) {
    throw new Error(`유효하지 않은 ${label}입니다.`);
  }

  return value;
}

export function parseUtcDateFromYmd(value: string, label = "날짜") {
  const normalized = normalizeYmdDate(value, label);
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function normalizeYmMonth(value: string, label = "월") {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${label} 형식이 올바르지 않습니다.`);
  }

  const [year, month] = value.split("-").map(Number);

  if (month < 1 || month > 12) {
    throw new Error(`유효하지 않은 ${label}입니다.`);
  }

  const candidate = new Date(Date.UTC(year, month - 1, 1));

  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1) {
    throw new Error(`유효하지 않은 ${label}입니다.`);
  }

  return value;
}
