"use client";

import Link from "next/link";
import { useState } from "react";
import { PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import {
  PAYMENT_CATEGORY_COLOR,
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";
import { formatDateTime, todayDateInputValue } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterPresetBar } from "@/components/ui/filter-preset-bar";
import { useFilterPresets } from "@/hooks/use-filter-presets";

export type PaymentItemSnapshot = {
  id: string;
  itemType: PaymentCategory;
  itemName: string;
  unitPrice: number;
  quantity: number;
  amount: number;
};

type PaymentEnrollmentSummary = {
  id: string;
  label: string;
  status: string;
};

type PaymentStudentSummary = {
  name: string;
  phone: string | null;
  enrollments?: PaymentEnrollmentSummary[];
};

export type PaymentWithRelations = {
  id: string;
  examNumber: string | null;
  category: PaymentCategory;
  method: PaymentMethod;
  status: PaymentStatus;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  note: string | null;
  processedAt: string;
  student: PaymentStudentSummary | null;
  processor: { name: string };
  items: PaymentItemSnapshot[];
  refunds: { amount: number }[];
};

type Props = {
  initialPayments: PaymentWithRelations[];
  fixedExamNumber?: string;
  hideSearch?: boolean;
};

const TEXT = {
  all: "\uC804\uCCB4",
  tuition: "\uC218\uAC15\uB8CC",
  textbook: "\uAD50\uC7AC",
  facility: "\uC2DC\uC124\uBE44",
  material: "\uAD50\uAD6C \u00B7 \uBAA8\uC758\uBB3C",
  etc: "\uAE30\uD0C0",
  cash: "\uD604\uAE08",
  transfer: "\uACC4\uC88C\uC774\uCCB4",
  requestFailed: "\uC694\uCCAD \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  fetchFailed: "\uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  search: "\uC870\uD68C",
  searching: "\uC870\uD68C \uC911...",
  searchPlaceholder: "\uC774\uB984 \uB610\uB294 \uD559\uBC88",
  registerPayment: "\uC218\uB0A9 \uB4F1\uB85D",
  totalCount: "\uCD1D \uAC74\uC218",
  countUnit: "\uAC74",
  grossTotal: "\uCCAD\uAD6C \uD569\uACC4",
  netTotal: "\uC2E4\uC218\uB0A9 \uD569\uACC4",
  refundTotal: "\uD658\uBD88 \uD569\uACC4",
  listCaption: "\uACB0\uC81C \uC774\uB825 \uBAA9\uB85D",
  dateTime: "\uC77C\uC2DC",
  student: "\uD559\uC0DD",
  category: "\uC720\uD615",
  method: "\uACB0\uC81C\uC218\uB2E8",
  items: "\uB0B4\uC5ED",
  grossAmount: "\uCCAD\uAD6C\uAE08\uC561",
  netAmount: "\uC2E4\uC218\uB0A9\uC561",
  processor: "\uCC98\uB9AC\uC790",
  status: "\uC0C1\uD0DC",
  note: "\uBE44\uACE0",
  detail: "\uC0C1\uC138",
  emptyTitle: "\uACB0\uC81C \uC774\uB825\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyDescription:
    "\uC870\uD68C \uC870\uAC74\uC744 \uBC14\uAFB8\uAC70\uB098 \uC0C8 \uACB0\uC81C \uC774\uB825\uC744 \uB4F1\uB85D\uD574 \uBCF4\uC138\uC694.",
  discount: "\uD560\uC778",
  refund: "\uD658\uBD88",
  nonMember: "\uBE44\uD68C\uC6D0",
  courseUnknown: "\uACFC\uC815 \uBBF8\uC9C0\uC815",
  moreItems: "\uC678",
} as const;

const CATEGORY_FILTERS: Array<{ value: PaymentCategory | "ALL"; label: string }> = [
  { value: "ALL", label: TEXT.all },
  { value: "TUITION", label: TEXT.tuition },
  { value: "TEXTBOOK", label: TEXT.textbook },
  { value: "FACILITY", label: TEXT.facility },
  { value: "MATERIAL", label: TEXT.material },
  { value: "ETC", label: TEXT.etc },
];

const METHOD_FILTERS: Array<{ value: PaymentMethod | "ALL"; label: string }> = [
  { value: "ALL", label: TEXT.all },
  { value: "CASH", label: TEXT.cash },
  { value: "TRANSFER", label: TEXT.transfer },
  { value: "CARD", label: PAYMENT_METHOD_LABEL.CARD },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? TEXT.requestFailed);
  return payload as T;
}

function itemsSummary(items: PaymentItemSnapshot[]): string {
  if (items.length === 0) return "-";
  if (items.length === 1) {
    const item = items[0];
    return item.quantity > 1 ? `${item.itemName} × ${item.quantity}` : item.itemName;
  }

  return `${items[0].itemName} ${TEXT.moreItems} ${items.length - 1}${TEXT.countUnit}`;
}

function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}\uC6D0`;
}

function enrollmentSummary(student: PaymentStudentSummary | null) {
  if (!student?.enrollments || student.enrollments.length === 0) {
    return null;
  }

  const visible = student.enrollments.slice(0, 2);
  const hiddenCount = student.enrollments.length - visible.length;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {visible.map((enrollment) => (
        <span
          key={enrollment.id}
          className="inline-flex rounded-full border border-forest/10 bg-forest/5 px-2 py-0.5 text-[11px] text-forest"
          title={enrollment.label}
        >
          {enrollment.label || TEXT.courseUnknown}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-[11px] text-slate">
          {TEXT.moreItems} {hiddenCount}\uAC74
        </span>
      ) : null}
    </div>
  );
}

export function PaymentList({ initialPayments, fixedExamNumber, hideSearch = false }: Props) {
  const today = todayDateInputValue();
  const [payments, setPayments] = useState<PaymentWithRelations[]>(initialPayments);
  const [filterCategory, setFilterCategory] = useState<PaymentCategory | "ALL">("ALL");
  const [filterMethod, setFilterMethod] = useState<PaymentMethod | "ALL">("ALL");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { presets, savePreset, deletePreset } = useFilterPresets(
    fixedExamNumber ? "member-payments-filter-presets" : "payments-filter-presets",
  );

  const currentFilters: Record<string, string> = {};
  if (filterCategory !== "ALL") currentFilters.category = filterCategory;
  if (filterMethod !== "ALL") currentFilters.method = filterMethod;
  if (fromDate) currentFilters.fromDate = fromDate;
  if (toDate) currentFilters.toDate = toDate;
  if (!hideSearch && search.trim()) currentFilters.search = search.trim();

  function applyPresetFilters(filters: Record<string, string>) {
    setFilterCategory((filters.category as PaymentCategory) ?? "ALL");
    setFilterMethod((filters.method as PaymentMethod) ?? "ALL");
    setFromDate(filters.fromDate ?? today);
    setToDate(filters.toDate ?? today);
    if (!hideSearch) {
      setSearch(filters.search ?? "");
    }
  }

  async function fetchPayments() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const searchParams = new URLSearchParams();
      if (fixedExamNumber) searchParams.set("examNumber", fixedExamNumber);
      if (filterCategory !== "ALL") searchParams.set("category", filterCategory);
      if (filterMethod !== "ALL") searchParams.set("method", filterMethod);
      if (fromDate) searchParams.set("from", fromDate);
      if (toDate) searchParams.set("to", toDate);
      searchParams.set("limit", "200");

      const result = await requestJson<{
        data?: { payments?: PaymentWithRelations[] };
        payments?: PaymentWithRelations[];
      }>(`/api/payments?${searchParams.toString()}`);

      setPayments(result.data?.payments ?? result.payments ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : TEXT.fetchFailed);
    } finally {
      setLoading(false);
    }
  }

  const filtered = payments.filter((payment) => {
    if (hideSearch || !search.trim()) return true;
    const query = search.trim().toLowerCase();
    const nameMatch = payment.student?.name.toLowerCase().includes(query) ?? false;
    const examNumberMatch = payment.examNumber?.includes(query) ?? false;
    return nameMatch || examNumberMatch;
  });

  const totalRefunded = filtered.reduce(
    (sum, payment) => sum + payment.refunds.reduce((refundSum, refund) => refundSum + refund.amount, 0),
    0,
  );
  const totalGross = filtered.reduce((sum, payment) => sum + payment.grossAmount, 0);
  const totalNet = filtered.reduce((sum, payment) => sum + payment.netAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1">
            {CATEGORY_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setFilterCategory(filter.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterCategory === filter.value
                    ? "bg-ember text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            {METHOD_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setFilterMethod(filter.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterMethod === filter.value
                    ? "bg-ink text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="rounded-full border border-ink/10 px-3 py-1.5 text-sm outline-none focus:border-ink/30"
            />
            <span className="text-xs text-slate">~</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="rounded-full border border-ink/10 px-3 py-1.5 text-sm outline-none focus:border-ink/30"
            />
            <button
              type="button"
              onClick={fetchPayments}
              disabled={loading}
              className="rounded-full bg-forest px-4 py-1.5 text-xs font-medium text-white transition hover:bg-forest/90 disabled:opacity-50"
            >
              {loading ? TEXT.searching : TEXT.search}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!hideSearch ? (
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={TEXT.searchPlaceholder}
              className="w-48 rounded-full border border-ink/10 px-4 py-2 text-sm outline-none focus:border-ink/30"
            />
          ) : null}
          <Link
            href={fixedExamNumber ? `/admin/payments/new?examNumber=${encodeURIComponent(fixedExamNumber)}` : "/admin/payments/new"}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            <span>+</span>
            <span>{TEXT.registerPayment}</span>
          </Link>
        </div>
      </div>

      <FilterPresetBar
        presets={presets}
        currentFilters={currentFilters}
        onApply={applyPresetFilters}
        onSave={savePreset}
        onDelete={deletePreset}
      />

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 rounded-[28px] border border-ink/10 bg-white px-6 py-4">
        <div className="flex flex-col">
          <span className="text-xs text-slate">{TEXT.totalCount}</span>
          <span className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
            {filtered.length.toLocaleString()}
            {TEXT.countUnit}
          </span>
        </div>
        <div className="w-px self-stretch bg-ink/10" />
        <div className="flex flex-col">
          <span className="text-xs text-slate">{TEXT.grossTotal}</span>
          <span className="mt-0.5 text-lg font-semibold text-ink tabular-nums">{formatKRW(totalGross)}</span>
        </div>
        <div className="w-px self-stretch bg-ink/10" />
        <div className="flex flex-col">
          <span className="text-xs text-slate">{TEXT.netTotal}</span>
          <span className="mt-0.5 text-lg font-semibold text-forest tabular-nums">{formatKRW(totalNet)}</span>
        </div>
        {totalRefunded > 0 ? (
          <>
            <div className="w-px self-stretch bg-ink/10" />
            <div className="flex flex-col">
              <span className="text-xs text-slate">{TEXT.refundTotal}</span>
              <span className="mt-0.5 text-lg font-semibold text-red-600 tabular-nums">
                -{formatKRW(totalRefunded)}
              </span>
            </div>
          </>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <caption className="sr-only">{TEXT.listCaption}</caption>
            <thead>
              <tr>
                {[
                  TEXT.dateTime,
                  TEXT.student,
                  TEXT.category,
                  TEXT.method,
                  TEXT.items,
                  TEXT.grossAmount,
                  TEXT.netAmount,
                  TEXT.processor,
                  TEXT.status,
                  TEXT.note,
                  TEXT.detail,
                ].map((header) => (
                  <th
                    key={header}
                    className="sticky top-0 z-10 bg-mist/95 px-4 py-3 text-left text-xs font-medium uppercase whitespace-nowrap text-slate backdrop-blur-sm"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-ink/10 ${loading ? "opacity-60" : ""}`}>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyState
                      title={TEXT.emptyTitle}
                      description={TEXT.emptyDescription}
                      action={{ label: TEXT.registerPayment, href: "/admin/payments/new" }}
                    />
                  </td>
                </tr>
              ) : null}

              {filtered.map((payment) => (
                <tr key={payment.id} className="transition hover:bg-mist/30">
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-slate">{formatDateTime(payment.processedAt)}</td>
                  <td className="px-4 py-3">
                    {payment.student ? (
                      <div className="space-y-0.5">
                        {payment.examNumber ? (
                          <Link
                            href={`/admin/students/${payment.examNumber}`}
                            className="font-medium text-ink transition hover:text-ember"
                          >
                            {payment.student.name}
                          </Link>
                        ) : (
                          <div className="font-medium text-ink">{payment.student.name}</div>
                        )}
                        {payment.examNumber ? <div className="text-xs text-slate">{payment.examNumber}</div> : null}
                        {payment.student.phone ? <div className="text-xs text-slate">{payment.student.phone}</div> : null}
                        {enrollmentSummary(payment.student)}
                      </div>
                    ) : (
                      <span className="text-xs text-slate">{TEXT.nonMember}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_CATEGORY_COLOR[payment.category]}`}
                    >
                      {PAYMENT_CATEGORY_LABEL[payment.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                        payment.method === "CASH"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : payment.method === "TRANSFER"
                            ? "border-sky-200 bg-sky-50 text-sky-800"
                            : payment.method === "CARD"
                              ? "border-purple-200 bg-purple-50 text-purple-800"
                              : "border-ink/20 bg-ink/5 text-slate"
                      }`}
                    >
                      {PAYMENT_METHOD_LABEL[payment.method]}
                    </span>
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-sm text-slate">{itemsSummary(payment.items)}</td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    <span className="text-sm text-ink">{formatKRW(payment.grossAmount)}</span>
                    {payment.discountAmount > 0 ? (
                      <div className="mt-0.5 text-xs text-slate">
                        {TEXT.discount} -{formatKRW(payment.discountAmount)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    <span className="text-sm font-semibold text-forest">{formatKRW(payment.netAmount)}</span>
                    {payment.refunds.length > 0 ? (
                      <div className="mt-0.5 text-xs text-red-600">
                        {TEXT.refund} -
                        {formatKRW(payment.refunds.reduce((sum, refund) => sum + refund.amount, 0))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap text-slate">{payment.processor.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
                    >
                      {PAYMENT_STATUS_LABEL[payment.status]}
                    </span>
                  </td>
                  <td className="max-w-[120px] truncate px-4 py-3 text-xs text-slate">{payment.note ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/payments/${payment.id}`}
                      className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs whitespace-nowrap text-slate transition hover:border-ink/30 hover:text-ink"
                    >
                      {TEXT.detail}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
