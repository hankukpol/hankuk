import { PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";

export type PaymentHistoryFilters = {
  category: PaymentCategory | "ALL";
  method: PaymentMethod | "ALL";
  status: PaymentStatus | "ALL";
  from: string;
  to: string;
};

export const DEFAULT_FILTERS: PaymentHistoryFilters = {
  category: "ALL",
  method: "ALL",
  status: "ALL",
  from: "",
  to: "",
};

export function parsePaymentHistoryFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): PaymentHistoryFilters {
  const category = firstValue(searchParams?.category);
  const method = firstValue(searchParams?.method);
  const status = firstValue(searchParams?.status);
  const from = firstValue(searchParams?.from) ?? "";
  const to = firstValue(searchParams?.to) ?? "";

  return {
    category: isCategory(category) ? category : "ALL",
    method: isMethod(method) ? method : "ALL",
    status: isStatus(status) ? status : "ALL",
    from: isDateInput(from) ? from : "",
    to: isDateInput(to) ? to : "",
  };
}

export function buildPaymentHistoryQuery(filters: PaymentHistoryFilters): string {
  const query = new URLSearchParams();
  if (filters.category !== "ALL") query.set("category", filters.category);
  if (filters.method !== "ALL") query.set("method", filters.method);
  if (filters.status !== "ALL") query.set("status", filters.status);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export function toFromDate(value: string): Date | undefined {
  if (!isDateInput(value)) return undefined;
  return new Date(`${value}T00:00:00`);
}

export function toToDate(value: string): Date | undefined {
  if (!isDateInput(value)) return undefined;
  return new Date(`${value}T23:59:59.999`);
}

export function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}\uC6D0`;
}

export function formatDateTime(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isDateInput(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isCategory(value: string | undefined): value is PaymentCategory {
  return (
    value === "TUITION" ||
    value === "FACILITY" ||
    value === "TEXTBOOK" ||
    value === "MATERIAL" ||
    value === "SINGLE_COURSE" ||
    value === "PENALTY" ||
    value === "ETC"
  );
}

function isMethod(value: string | undefined): value is PaymentMethod {
  return (
    value === "CASH" ||
    value === "CARD" ||
    value === "TRANSFER" ||
    value === "POINT" ||
    value === "MIXED"
  );
}

function isStatus(value: string | undefined): value is PaymentStatus {
  return (
    value === "PENDING" ||
    value === "APPROVED" ||
    value === "PARTIAL_REFUNDED" ||
    value === "FULLY_REFUNDED" ||
    value === "CANCELLED"
  );
}
