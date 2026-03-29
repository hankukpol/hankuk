import { format } from "date-fns";
import { ko } from "date-fns/locale";

export function formatDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return format(date, "yyyy-MM-dd");
}

export function formatDateWithWeekday(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return format(date, "yyyy-MM-dd(E)", { locale: ko });
}

export function formatDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return format(date, "yyyy-MM-dd HH:mm");
}

export function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  return formatDate(value);
}

export function todayDateInputValue() {
  return toDateInputValue(new Date());
}

export function formatFileDate(value = new Date()) {
  return format(value, "yyyy-MM-dd");
}
