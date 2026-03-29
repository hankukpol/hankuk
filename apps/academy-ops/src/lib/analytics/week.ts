function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function getTuesdayWeekStart(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day >= 2 ? day - 2 : day + 5;
  value.setDate(value.getDate() - diff);
  return value;
}

export function getTuesdayWeekEnd(date: Date) {
  const value = getTuesdayWeekStart(date);
  value.setDate(value.getDate() + 6);
  return endOfDay(value);
}

export function getTuesdayWeekKey(date: Date) {
  const start = getTuesdayWeekStart(date);
  const year = start.getFullYear();
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseTuesdayWeekKey(weekKey: string) {
  const [year, month, day] = weekKey.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const value = new Date(year, month - 1, day);
  return Number.isNaN(value.getTime()) ? null : startOfDay(value);
}

export function isSameTuesdayWeek(left: Date, right: Date) {
  return getTuesdayWeekKey(left) === getTuesdayWeekKey(right);
}

export function formatTuesdayWeekLabel(weekKey: string) {
  const start = parseTuesdayWeekKey(weekKey);

  if (!start) {
    return weekKey;
  }

  const end = getTuesdayWeekEnd(start);
  const formatPart = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate(),
    ).padStart(2, "0")}`;

  return `${formatPart(start)} ~ ${formatPart(end)}`;
}
