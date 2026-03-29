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
