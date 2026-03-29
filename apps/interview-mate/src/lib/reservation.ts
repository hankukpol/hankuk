export type DaySummary = {
  date: string;
  totalSlots: number;
  availableSlots: number;
  remainingCount: number;
};

export type SlotSummary = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  reservedCount: number;
  remainingCount: number;
  isActive: boolean;
};

export type CalendarDay = {
  key: string;
  label: number;
  date: Date;
  inMonth: boolean;
  weekday: number;
  isToday: boolean;
};

export function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function buildCalendarDays(baseDate: Date): CalendarDay[] {
  const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 35 }).map((_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return {
      key: toDateKey(current),
      label: current.getDate(),
      date: current,
      inMonth: current.getMonth() === baseDate.getMonth(),
      weekday: current.getDay(),
      isToday: toDateKey(current) === toDateKey(new Date()),
    };
  });
}

export function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

export function formatTimeLabel(time: string) {
  const [hourString, minuteString] = time.split(":");
  const hour = Number(hourString);
  const meridiem = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${meridiem} ${displayHour}:${minuteString}`;
}

export function formatDateLabel(dateKey: string | null | undefined) {
  const parsedDate = parseDateKey(dateKey);

  if (!parsedDate) {
    return "날짜 미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parsedDate);
}
